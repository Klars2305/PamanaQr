// Contributor story submission form.
//
// A story is always created as submitted, with no classification and no review
// fields set. The insert policy in database/schema.sql requires exactly that
// and re-checks the contributor role, so a story cannot enter the database
// already published.

/* ---------------------------------------------------------------------------
 * Rendering
 * ------------------------------------------------------------------------ */

function renderContributionHeritageOptions(selectElement, sites) {
  if (!sites.length) {
    selectElement.innerHTML = '<option value="">No active heritage sites available</option>';
    return;
  }

  selectElement.innerHTML = '<option value="">Choose a heritage site</option>';

  sites.forEach(function (site) {
    const option = document.createElement('option');
    option.value = site.id;
    option.textContent = site.location ? `${site.name} - ${site.location}` : site.name;
    selectElement.appendChild(option);
  });
}

function resetSubmissionForm(form, profile) {
  form.reset();
  document.getElementById('contributorDisplayName').value = profile.display_name;
}

/* ---------------------------------------------------------------------------
 * Reading and validating the form
 * ------------------------------------------------------------------------ */

function collectStorySubmissionData() {
  return {
    heritageSiteId: readFieldValue('heritageSiteId'),
    title: readTrimmedField('storyTitle'),
    content: readTrimmedField('storyContent'),
    suggestedClassification: readFieldValue('suggestedClassification'),
    sourceReference: readTrimmedField('storySourceReference'),
    allowPublicName: readCheckedField('allowPublicName'),
    supportingPhoto: readChosenFile('supportingPhoto')
  };
}

function validateStorySubmission(formData) {
  return {
    heritageSiteId: validateRequired(formData.heritageSiteId, 'a heritage site'),
    storyTitle: validateRequired(formData.title, 'a story title'),
    storyContent: validateRequired(formData.content, 'your story'),
    suggestedClassification: formData.suggestedClassification
      ? validateAllowedValue(formData.suggestedClassification, STORY_CLASSIFICATIONS, 'suggested classification')
      : '',
    storySourceReference: validateOptionalUrlOrText(formData.sourceReference, 'source/reference'),
    supportingPhoto: validateImageInput(document.getElementById('supportingPhoto'), false)
  };
}

/* ---------------------------------------------------------------------------
 * Data loading and saving
 * ------------------------------------------------------------------------ */

async function loadContributionHeritageSites() {
  const selectElement = document.getElementById('heritageSiteId');

  if (!selectElement || !getSupabaseClient()) {
    return;
  }

  const { data, error } = await HeritageQueries.listActiveForPicker();

  if (error) {
    logAppError('Could not load heritage sites for submission.', error);
    selectElement.innerHTML = '<option value="">Could not load heritage sites</option>';
    showAppMessage('submissionMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return;
  }

  renderContributionHeritageOptions(selectElement, data || []);
}

function buildNewStoryRecord(formData, authenticatedUser, contributorProfile) {
  return {
    heritage_site_id: formData.heritageSiteId,
    contributor_id: authenticatedUser.id,
    title: formData.title,
    content: formData.content,
    source_reference: formData.sourceReference || null,
    suggested_classification: formData.suggestedClassification || null,
    classification: null,
    contributor_display_name: contributorProfile.display_name,
    allow_public_name: formData.allowPublicName,
    status: STORY_STATUSES.submitted,
    review_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    published_at: null
  };
}

// The photo is attached after the story exists, because the storage policy
// checks that the story is the contributor's own and still submitted.
async function attachStorySupportingPhoto(story, contributorProfile, supportingPhoto, storyTitle) {
  const uploadResult = await uploadStoryImage(story.id, contributorProfile.id, supportingPhoto);

  if (uploadResult.error) {
    return {
      data: story,
      error: createAppError(APP_MESSAGES.storageFailed)
    };
  }

  const { error: mediaError } = await MediaQueries.insert({
    heritage_site_id: null,
    story_id: story.id,
    uploaded_by: contributorProfile.id,
    image_url: uploadResult.data.path,
    caption: storyTitle
  });

  if (mediaError) {
    logAppError('Could not save supporting photograph record.', mediaError);
    await removeImageFile(uploadResult.data.path);
    return {
      data: story,
      error: createAppError(getAppErrorMessage(mediaError, APP_MESSAGES.saveFailed))
    };
  }

  return {
    data: story,
    error: null
  };
}

async function createStorySubmission(formData) {
  if (!getSupabaseClient()) {
    return createErrorResult(APP_MESSAGES.notConfigured);
  }

  const authenticatedUser = await getCurrentUser();

  if (!authenticatedUser) {
    return createErrorResult(APP_MESSAGES.contributorLoginRequired);
  }

  const contributorProfile = await getCurrentUserProfile();

  if (!contributorProfile || contributorProfile.role !== PAMANA_ROLES.contributor) {
    return createErrorResult(APP_MESSAGES.unauthorizedSubmission);
  }

  const { data: story, error: storyError } = await StoryQueries.insert(
    buildNewStoryRecord(formData, authenticatedUser, contributorProfile)
  );

  if (storyError) {
    logAppError('Could not submit story.', storyError);
    return createErrorResult(getAppErrorMessage(storyError, APP_MESSAGES.unauthorizedSubmission));
  }

  if (!formData.supportingPhoto) {
    return {
      data: story,
      error: null
    };
  }

  return attachStorySupportingPhoto(story, contributorProfile, formData.supportingPhoto, formData.title);
}

async function prepareSubmissionPage() {
  showAppMessage('submissionMessage', 'Checking contributor account...', 'info');

  const profile = await requireContributor();

  if (!profile) {
    return null;
  }

  const contributorDisplayName = document.getElementById('contributorDisplayName');

  if (contributorDisplayName) {
    contributorDisplayName.value = profile.display_name;
  }

  await loadContributionHeritageSites();
  showAppMessage('submissionMessage', 'Ready for your story submission.', 'success');
  return profile;
}

/* ---------------------------------------------------------------------------
 * Event handling
 * ------------------------------------------------------------------------ */

async function handleSubmissionFormSubmit(event) {
  event.preventDefault();

  const button = document.getElementById('submissionButton');

  // Claimed before the first await, so a second click cannot start a second
  // insert while this one is still in flight.
  if (!claimButtonAction(button)) {
    return;
  }

  clearFormValidation(event.target);

  const profile = await requireContributor();

  if (!profile) {
    return;
  }

  const formData = collectStorySubmissionData();

  if (!reportValidationResult(validateStorySubmission(formData), 'submissionMessage')) {
    releaseButtonAction(button);
    return;
  }

  setSubmitLoading(button, true, 'Submitting...', 'Submit for Review');
  showAppMessage('submissionMessage', 'Submitting your story for review...', 'info');

  const { data, error } = await createStorySubmission(formData);

  if (error) {
    showAppMessage('submissionMessage', getAppErrorMessage(error, APP_MESSAGES.saveFailed), 'danger');
    setSubmitLoading(button, false, 'Submitting...', 'Submit for Review');
    return;
  }

  resetSubmissionForm(event.target, profile);
  showAppMessage('submissionMessage', `Story submitted successfully. Current status: ${data.status}.`, 'success');
  setSubmitLoading(button, false, 'Submitting...', 'Submit for Review');
}

const submissionForm = document.getElementById('submissionForm');

if (submissionForm) {
  submissionForm.addEventListener('submit', handleSubmissionFormSubmit);
}

if (document.body.dataset.page === 'contribution-form') {
  prepareSubmissionPage();
}
