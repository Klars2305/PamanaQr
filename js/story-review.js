// Administrator story review page.
//
// Publishing or rejecting only ever targets a story that is still submitted.
// That filter lives in StoryQueries.applyReview, and the administrator policy
// in database/schema.sql is what actually permits the write.

/* ---------------------------------------------------------------------------
 * Rendering
 * ------------------------------------------------------------------------ */

function getReviewActionButtons() {
  return [
    document.getElementById('publishStoryButton'),
    document.getElementById('rejectStoryButton')
  ];
}

function setReviewActionButtonsDisabled(isDisabled) {
  getReviewActionButtons().forEach(function (button) {
    if (button) {
      button.disabled = isDisabled;
    }
  });
}

async function renderStorageReviewImage(imageElement, imagePath, altText) {
  if (!imageElement || !imagePath) {
    return;
  }

  try {
    const { signedUrl, error } = await createSignedImageUrl(imagePath, 3600);

    if (error) {
      logAppError('Could not load review photograph.', error);
      return;
    }

    const safeUrl = safeImageUrl(signedUrl);

    if (!safeUrl) {
      return;
    }

    imageElement.addEventListener('error', function () {
      imageElement.classList.add('d-none');
    }, { once: true });

    imageElement.src = safeUrl;
    imageElement.alt = altText;
    imageElement.classList.remove('d-none');
  } catch (error) {
    logAppError('Could not load review photograph.', error);
  }
}

function createReviewPhotoPanel(item) {
  const caption = item.caption || 'Supporting photograph';

  return html`
    <div class="col-md-6">
      <article class="starter-card h-100">
        <img class="related-media-image d-none" data-review-photo="${item.image_url}" alt="${caption}">
        <p class="mt-2 mb-0">${caption}</p>
      </article>
    </div>
  `;
}

function renderReviewPhotographs(mediaItems) {
  const photoBox = document.getElementById('reviewPhotoBox');

  if (!photoBox) {
    return;
  }

  if (!mediaItems.length) {
    setSafeHtml(photoBox, trustedHtml('<p class="text-muted">No supporting photograph was uploaded.</p>'));
    return;
  }

  setSafeHtml(photoBox, mediaItems.map(createReviewPhotoPanel));

  // Scoped to the panel just filled, so listeners and image loads cannot attach
  // to matching elements elsewhere on the page.
  photoBox.querySelectorAll('[data-review-photo]').forEach(function (image) {
    renderStorageReviewImage(image, image.dataset.reviewPhoto, image.alt);
  });
}

// A missing element used to throw and abandon the rest of the render, leaving
// the page half-filled with its action buttons in an unknown state.
function setReviewFieldValue(elementId, value) {
  const field = document.getElementById(elementId);

  if (field) {
    field.value = value;
  }
}

function setReviewFieldDisabled(elementId, isDisabled) {
  const field = document.getElementById(elementId);

  if (field) {
    field.disabled = isDisabled;
  }
}

function renderReviewStorySummary(story) {
  const heritage = story.heritage_sites || {};

  setText('reviewStoryTitle', story.title, '');
  setSafeHtml(document.getElementById('reviewStoryStatus'), createStatusBadge(story.status));
  setText('reviewStoryBody', story.content, '');
  setText('reviewHeritageName', heritage.name, 'Heritage site unavailable');
  setText('reviewHeritageLocation', [
    heritage.location,
    heritage.historical_period,
    heritage.short_description
  ].filter(Boolean).join(' | '), '');
  setText('reviewContributorName', story.contributor_display_name, 'Community Contributor');
  setText('reviewSourceReference', story.source_reference, 'No source/reference provided.');
  setText('reviewSuggestedClassification', story.suggested_classification, 'No classification suggested.');
}

function renderReviewDecision(story) {
  setText('reviewFinalClassification', story.classification, 'Not classified');
  setText('reviewedAt', story.reviewed_at ? new Date(story.reviewed_at).toLocaleString() : '', 'Not reviewed');
  setText('reviewNotesDisplay', story.review_notes, 'No review notes.');
}

function renderReviewPageHeading(story) {
  const canReview = story.status === STORY_STATUSES.submitted;

  setText('reviewStoryHeading', canReview
    ? 'Review Story'
    : `${story.status === STORY_STATUSES.published ? 'Published' : 'Rejected'} Story Details`, '');
  setText('reviewStoryDescription', canReview
    ? 'Classify, publish, or reject a community story submission.'
    : 'View the story submission and its review information.', '');
}

// Only a still-submitted story can be acted on. Everything else is read-only.
function applyReviewFormState(story) {
  const canReview = story.status === STORY_STATUSES.submitted;

  setReviewFieldValue('finalClassification', story.classification || story.suggested_classification || '');
  setReviewFieldValue('reviewNotes', story.review_notes || '');
  setReviewFieldDisabled('finalClassification', !canReview);
  setReviewFieldDisabled('reviewNotes', !canReview);
  setReviewActionButtonsDisabled(!canReview);

  if (!canReview) {
    showAppMessage('reviewStoryMessage', 'This story has already been reviewed.', 'warning');
  }
}

function fillReviewPage(story) {
  const content = document.getElementById('reviewStoryContent');

  renderReviewStorySummary(story);
  renderReviewDecision(story);
  renderReviewPageHeading(story);

  if (content) {
    content.classList.remove('d-none');
  }

  applyReviewFormState(story);
  renderReviewPhotographs(story.media || []);
}

/* ---------------------------------------------------------------------------
 * Reading and validating the decision
 * ------------------------------------------------------------------------ */

function getReviewStoryId() {
  return getQueryParam('id');
}

function collectReviewDecision(action) {
  return {
    action: action,
    finalClassification: readFieldValue('finalClassification'),
    reviewNotes: readTrimmedField('reviewNotes')
  };
}

// Publishing requires a classification from the shared list; rejecting does not.
function validateReviewDecision(decision) {
  const errors = {
    reviewNotes: decision.action === 'reject' && !decision.reviewNotes
      ? 'Please add review notes explaining why this story is being rejected.'
      : validateOptionalUrlOrText(decision.reviewNotes, 'review notes')
  };

  if (decision.action === 'publish') {
    errors.finalClassification = validateAllowedValue(decision.finalClassification, STORY_CLASSIFICATIONS, 'final classification');
  }

  return errors;
}

function buildStoryReviewUpdates(decision, adminProfile) {
  const now = new Date().toISOString();
  const updates = {
    status: decision.action === 'publish' ? STORY_STATUSES.published : STORY_STATUSES.rejected,
    reviewed_by: adminProfile.id,
    reviewed_at: now,
    review_notes: decision.reviewNotes || null
  };

  if (decision.action === 'publish') {
    updates.classification = decision.finalClassification;
    updates.published_at = now;
  }

  return updates;
}

/* ---------------------------------------------------------------------------
 * Data loading and saving
 * ------------------------------------------------------------------------ */

async function loadAdminReviewStoryPage() {
  setReviewActionButtonsDisabled(true);
  showAppMessage('reviewStoryMessage', 'Loading story submission...', 'info');

  let rendered = false;

  try {
    const adminProfile = await requireAdmin();

    if (!adminProfile) {
      return;
    }

    const authenticatedAdmin = await getCurrentUser();

    if (!authenticatedAdmin || authenticatedAdmin.id !== adminProfile.id) {
      showAppMessage('reviewStoryMessage', APP_MESSAGES.unauthorizedAdminAction, 'danger');
      await showSystemWarning('Unauthorized action', APP_MESSAGES.unauthorizedAdminAction);
      return;
    }

    const storyId = getReviewStoryId();

    if (!storyId) {
      showAppMessage('reviewStoryMessage', 'No story submission was selected.', 'warning');
      appendAppLink('reviewStoryMessage', 'admin/submissions.html', 'Return to Submissions');
      return;
    }

    const { data, error } = await StoryQueries.getForReview(storyId);

    if (error) {
      logAppError('Could not load story for review.', error);
      showAppMessage('reviewStoryMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
      return;
    }

    if (!data) {
      showAppMessage('reviewStoryMessage', 'This story record could not be found.', 'warning');
      appendAppLink('reviewStoryMessage', 'admin/submissions.html', 'Return to Submissions');
      return;
    }

    fillReviewPage(data);
    rendered = true;

    if (data.status === STORY_STATUSES.submitted) {
      showAppMessage('reviewStoryMessage', 'Story loaded. Review the content and references before making a decision.', 'info');
    }
  } catch (error) {
    logAppError('Could not load story for review.', error);
    showAppMessage('reviewStoryMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
  } finally {
    // A story that never rendered must not leave Publish or Reject usable.
    if (!rendered) {
      setReviewActionButtonsDisabled(true);
    }
  }
}

async function saveStoryReview(decision, adminProfile) {
  const updates = buildStoryReviewUpdates(decision, adminProfile);
  const { data, error } = await StoryQueries.applyReview(getReviewStoryId(), updates);

  // No row back means the story was no longer submitted, or the administrator
  // policy refused the write. Both are reported the same way.
  if (error || !data) {
    return error || createAppError('This story may already have been reviewed. Return to Submissions and refresh before trying again.');
  }

  return null;
}

/* ---------------------------------------------------------------------------
 * Event handling
 * ------------------------------------------------------------------------ */

async function updateStoryReviewStatus(action) {
  if (!['publish', 'reject'].includes(action)) return;
  const buttons = getReviewActionButtons();
  if (!claimButtonActions(buttons)) return;
  const form = document.getElementById('reviewStoryForm');
  const activeButton = action === 'publish' ? buttons[0] : buttons[1];
  let completed = false;
  try {
    clearFormValidation(form);
    const decision = collectReviewDecision(action);
    if (!reportValidationResult(validateReviewDecision(decision), 'reviewStoryMessage')) return;
    await showConfirmationModal({
      title: action === 'publish' ? 'Publish Story?' : 'Reject Story?',
      message: action === 'publish'
        ? 'This story will become visible to public visitors. Please confirm that you have checked its content, source, and classification.'
        : 'The contributor will see that this submission was rejected. The story will not appear publicly.',
      confirmText: action === 'publish' ? 'Publish Story' : 'Reject Story',
      cancelText: 'Keep Reviewing',
      variant: action === 'publish' ? 'success' : 'danger',
      trigger: activeButton,
      onConfirm: async function () {
        setFormBusy(form, true);
        setSubmitLoading(activeButton, true, action === 'publish' ? 'Publishing story...' : 'Rejecting story...', '');
        const profile = await requireAdmin();
        if (!profile) return;
        showAppMessage('reviewStoryMessage', action === 'publish' ? 'Publishing story...' : 'Rejecting story...', 'info');
        const failure = await saveStoryReview(decision, profile);
        if (failure) throw failure;
        completed = true;
        const message = action === 'publish' ? 'Story published successfully.' : 'Story rejected.';
        showAppMessage('reviewStoryMessage', message, 'success');
        rememberAppFeedback(message, 'success');
        // Same destination as before; opened once the administrator acknowledges.
        await showSystemSuccess(
          action === 'publish' ? 'Story published' : 'Story rejected',
          action === 'publish'
            ? 'The story is now visible to public visitors. Returning to Submissions.'
            : 'The contributor will see that this submission was rejected. Returning to Submissions.',
          'Back to Submissions'
        );
        window.location.href = `submissions.html?status=${STORY_STATUSES.submitted}`;
      }
    });
  } catch (error) {
    logAppError('Could not update story review status.', error);
    showAppMessage('reviewStoryMessage', getAppErrorMessage(error, APP_MESSAGES.saveFailed), 'danger');
    await showSystemErrorFor(error, 'Failed to save', APP_MESSAGES.saveFailed);
  } finally {
    setFormBusy(form, false);
    setSubmitLoading(activeButton, false, '', action === 'publish' ? 'Publish Story' : 'Reject Story');
    if (completed) setReviewActionButtonsDisabled(true);
    else releaseButtonActions(buttons);
  }
}

const publishStoryButton = document.getElementById('publishStoryButton');
const rejectStoryButton = document.getElementById('rejectStoryButton');

if (publishStoryButton) {
  publishStoryButton.addEventListener('click', function () {
    updateStoryReviewStatus('publish');
  });
}

if (rejectStoryButton) {
  rejectStoryButton.addEventListener('click', function () {
    updateStoryReviewStatus('reject');
  });
}

if (document.body.dataset.page === 'admin-review-story') {
  loadAdminReviewStoryPage();
}

const reviewDecisionForm = document.getElementById('reviewStoryForm');
if (reviewDecisionForm) reviewDecisionForm.addEventListener('submit', event => event.preventDefault());
