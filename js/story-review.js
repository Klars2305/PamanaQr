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
  const { signedUrl, error } = await createSignedImageUrl(imagePath, 3600);

  if (error) {
    logAppError('Could not load review photograph.', error);
    return;
  }

  imageElement.src = safeImageUrl(signedUrl);
  imageElement.alt = altText;
  imageElement.classList.remove('d-none');
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

  document.querySelectorAll('[data-review-photo]').forEach(function (image) {
    renderStorageReviewImage(image, image.dataset.reviewPhoto, image.alt);
  });
}

function renderReviewStorySummary(story) {
  const heritage = story.heritage_sites || {};

  document.getElementById('reviewStoryTitle').textContent = story.title || '';
  setSafeHtml(document.getElementById('reviewStoryStatus'), createStatusBadge(story.status));
  document.getElementById('reviewStoryBody').textContent = story.content || '';
  document.getElementById('reviewHeritageName').textContent = heritage.name || 'Heritage site unavailable';
  document.getElementById('reviewHeritageLocation').textContent = [
    heritage.location,
    heritage.historical_period,
    heritage.short_description
  ].filter(Boolean).join(' | ');
  document.getElementById('reviewContributorName').textContent = story.contributor_display_name || 'Community Contributor';
  document.getElementById('reviewSourceReference').textContent = story.source_reference || 'No source/reference provided.';
  document.getElementById('reviewSuggestedClassification').textContent = story.suggested_classification || 'No classification suggested.';
}

function renderReviewDecision(story) {
  document.getElementById('reviewFinalClassification').textContent = story.classification || 'Not classified';
  document.getElementById('reviewedAt').textContent = story.reviewed_at ? new Date(story.reviewed_at).toLocaleString() : 'Not reviewed';
  document.getElementById('reviewNotesDisplay').textContent = story.review_notes || 'No review notes.';
}

function renderReviewPageHeading(story) {
  const canReview = story.status === STORY_STATUSES.submitted;

  document.getElementById('reviewStoryHeading').textContent = canReview
    ? 'Review Story'
    : `${story.status === STORY_STATUSES.published ? 'Published' : 'Rejected'} Story Details`;
  document.getElementById('reviewStoryDescription').textContent = canReview
    ? 'Classify, publish, or reject a community story submission.'
    : 'View the story submission and its review information.';
}

// Only a still-submitted story can be acted on. Everything else is read-only.
function applyReviewFormState(story) {
  const canReview = story.status === STORY_STATUSES.submitted;

  document.getElementById('finalClassification').value = story.classification || story.suggested_classification || '';
  document.getElementById('reviewNotes').value = story.review_notes || '';
  document.getElementById('finalClassification').disabled = !canReview;
  document.getElementById('reviewNotes').disabled = !canReview;
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
    reviewNotes: validateOptionalUrlOrText(decision.reviewNotes, 'review notes')
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
  showAppMessage('reviewStoryMessage', 'Loading story submission...', 'info');

  const adminProfile = await requireAdmin();

  if (!adminProfile) {
    return;
  }

  const authenticatedAdmin = await getCurrentUser();

  if (!authenticatedAdmin || authenticatedAdmin.id !== adminProfile.id) {
    showAppMessage('reviewStoryMessage', APP_MESSAGES.unauthorizedAdminAction, 'danger');
    return;
  }

  const storyId = getReviewStoryId();

  if (!storyId) {
    showAppMessage('reviewStoryMessage', 'No story submission was selected.', 'warning');
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
    return;
  }

  fillReviewPage(data);
  showAppMessage('reviewStoryMessage', 'Story submission loaded.', 'success');
}

async function saveStoryReview(decision, adminProfile) {
  const updates = buildStoryReviewUpdates(decision, adminProfile);
  const { data, error } = await StoryQueries.applyReview(getReviewStoryId(), updates);

  // No row back means the story was no longer submitted, or the administrator
  // policy refused the write. Both are reported the same way.
  if (error || !data) {
    return error || createAppError(APP_MESSAGES.unauthorizedAdminAction);
  }

  return null;
}

/* ---------------------------------------------------------------------------
 * Event handling
 * ------------------------------------------------------------------------ */

async function updateStoryReviewStatus(action) {
  const actionButtons = getReviewActionButtons();

  // Claimed before the first await, so a double click cannot send two review
  // decisions for the same story.
  if (!claimButtonActions(actionButtons)) {
    return;
  }

  clearFormValidation(document.getElementById('reviewStoryForm'));

  const decision = collectReviewDecision(action);

  if (!reportValidationResult(validateReviewDecision(decision), 'reviewStoryMessage')) {
    releaseButtonActions(actionButtons);
    return;
  }

  const adminProfile = await requireAdmin();

  if (!adminProfile) {
    return;
  }

  showAppMessage('reviewStoryMessage', action === 'publish' ? 'Publishing story...' : 'Rejecting story...', 'info');

  const failure = await saveStoryReview(decision, adminProfile);

  if (failure) {
    logAppError('Could not update story review status.', failure);
    showAppMessage('reviewStoryMessage', getAppErrorMessage(failure, APP_MESSAGES.unauthorizedAdminAction), 'danger');
    releaseButtonActions(actionButtons);
    return;
  }

  showAppMessage('reviewStoryMessage', action === 'publish' ? 'Story published successfully.' : 'Story rejected successfully.', 'success');

  setTimeout(function () {
    window.location.href = `submissions.html?status=${STORY_STATUSES.submitted}`;
  }, 1200);
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
