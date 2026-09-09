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
  if (form) form.reset();

  const name = document.getElementById('contributorDisplayName');
  if (name && profile) name.value = profile.display_name;
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
    storyTitle: validateTextLength(formData.title, 'Story title', FORM_LIMITS.storyTitle),
    storyContent: validateStoryContent(formData.content),
    suggestedClassification: formData.suggestedClassification
      ? validateAllowedValue(formData.suggestedClassification, STORY_CLASSIFICATIONS, 'suggested classification')
      : '',
    storySourceReference: validateOptionalUrlOrText(formData.sourceReference, 'source/reference'),
    supportingPhoto: formData.supportingPhoto ? validateImageFile(formData.supportingPhoto) : ''
  };
}

/* ---------------------------------------------------------------------------
 * Data loading and saving
 * ------------------------------------------------------------------------ */

async function loadContributionHeritageSites() {
  const selectElement = document.getElementById('heritageSiteId');
  if (!selectElement || !getSupabaseClient()) {
    showAppMessage('submissionMessage', APP_MESSAGES.notConfigured, 'danger');
    return false;
  }
  const { data, error } = await HeritageQueries.listActiveForPicker();
  if (error) {
    logAppError('Could not load heritage sites for submission.', error);
    selectElement.innerHTML = '<option value="">Could not load heritage sites</option>';
    showAppMessage('submissionMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return false;
  }
  renderContributionHeritageOptions(selectElement, data || []);
  if (!data || !data.length) {
    showAppMessage('submissionMessage', 'No active heritage sites are available yet. Please return later or contact an administrator.', 'warning');
    // Nothing can be submitted without a site to attach the story to.
    await showSystemInfo('No records available', 'There are no active heritage sites to contribute to yet. Please return later or contact an administrator.', 'OK');
    return false;
  }
  return true;
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

  // An upload that reports no error but returns no path is still a failure.
  if (uploadResult.error || !uploadResult.data || !uploadResult.data.path) {
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

async function createStorySubmission(formData, onProgress) {
  const invalid = Object.values(validateStorySubmission(formData)).find(Boolean);
  if (invalid) return createErrorResult(invalid);
  const imageError = await validateImageContents(formData.supportingPhoto);
  if (imageError) return createErrorResult(imageError);
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

  if (storyError || !story) {
    logAppError('Could not submit story.', storyError);
    return createErrorResult(getAppErrorMessage(storyError, APP_MESSAGES.unauthorizedSubmission));
  }

  if (!formData.supportingPhoto) {
    return {
      data: story,
      error: null
    };
  }

  if (onProgress) onProgress('Uploading your supporting photo...');
  try {
    return await attachStorySupportingPhoto(story, contributorProfile, formData.supportingPhoto, formData.title);
  } catch (error) {
    // Keep the successfully inserted story visible to the caller even when a
    // browser/file API or a later media operation fails unexpectedly.
    logAppError('Could not attach the submitted story photo.', error);
    return { data: story, error: createAppError(APP_MESSAGES.storageFailed) };
  }
}

async function prepareSubmissionPage() {
  const button = document.getElementById('submissionButton');
  const picker = document.getElementById('heritageSiteId');
  if (button) button.disabled = true;
  if (picker) picker.disabled = true;
  showAppMessage('submissionMessage', 'Checking contributor account...', 'info');
  try {
    const profile = await requireContributor();
    if (!profile) return null;
    const name = document.getElementById('contributorDisplayName');
    if (name) name.value = profile.display_name;
    if (!await loadContributionHeritageSites()) return null;
    if (picker) picker.disabled = false;
    if (button) button.disabled = false;
    showAppMessage('submissionMessage', 'Ready for your story. It will be reviewed before appearing publicly.', 'info');
    return profile;
  } catch (error) {
    showAppMessage('submissionMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return null;
  }
}

async function handleSubmissionFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('submissionButton');
  if (!claimButtonAction(button)) return;
  // Set only when the story row exists. The button then stays disabled, because
  // pressing Submit again would create a second copy of the same story.
  let storyCreated = false;
  try {
    clearFormValidation(form);
    const formData = collectStorySubmissionData();
    if (!reportValidationResult(validateStorySubmission(formData), 'submissionMessage')) return;
    setFormBusy(form, true);
    setSubmitLoading(button, true, 'Submitting story...', 'Submit for Review');
    showAppMessage('submissionMessage', 'Checking your story and photo...', 'info');
    const imageError = await validateImageContents(formData.supportingPhoto);
    if (imageError) {
      setFormBusy(form, false);
      reportValidationResult({ supportingPhoto: imageError }, 'submissionMessage');
      return;
    }
    const profile = await requireContributor();
    if (!profile) return;
    showAppMessage('submissionMessage', 'Submitting your story for review...', 'info');
    const { data, error } = await createStorySubmission(formData, message => showAppMessage('submissionMessage', message, 'info'));
    if (error && data) {
      // The story insert succeeded; retrying the entire form would duplicate it.
      storyCreated = true;
      resetSubmissionForm(form, profile);
      showAppMessage('submissionMessage', 'Your story was submitted for review, but the photo could not be attached. Do not submit the story again. Contact an administrator for help with the photo.', 'warning');
      appendAppLink('submissionMessage', 'contributor/submissions.html', 'View My Submissions');
      await showSystemWarning('Upload failed', 'Your story was submitted for review, but the photo could not be attached. Do not submit the story again. Contact an administrator for help with the photo.');
      return;
    }
    if (error) {
      const message = getAppErrorMessage(error, APP_MESSAGES.saveFailed);
      showAppMessage('submissionMessage', message + (message === APP_MESSAGES.networkFailed ? ' Check My Submissions before retrying, in case the story was saved.' : ''), 'danger');
      appendAppLink('submissionMessage', 'contributor/submissions.html', 'Check My Submissions');
      await showSystemErrorFor(error, 'Failed to save', APP_MESSAGES.saveFailed);
      return;
    }
    storyCreated = true;
    resetSubmissionForm(form, profile);
    showAppMessage('submissionMessage', 'Story submitted successfully. Status: Submitted. An administrator will review it before publication.', 'success');
    appendAppLink('submissionMessage', 'contributor/submissions.html', 'View My Submissions');
    await showSystemSuccess('Story submitted', 'Your story was submitted with the status Submitted. An administrator will review it before it appears publicly.');
  } catch (error) {
    logAppError('Story submission failed.', error);
    showAppMessage('submissionMessage', getAppErrorMessage(error, APP_MESSAGES.saveFailed), 'danger');
    await showSystemErrorFor(error, 'Failed to save', APP_MESSAGES.saveFailed);
  } finally {
    setFormBusy(form, false);
    setSubmitLoading(button, false, '', 'Submit for Review');
    if (storyCreated && button) {
      button.disabled = true;
      button.textContent = 'Story submitted';
    }
  }
}

const submissionForm = document.getElementById('submissionForm');

if (submissionForm) {
  submissionForm.addEventListener('submit', handleSubmissionFormSubmit);
}

if (document.body.dataset.page === 'contribution-form') {
  prepareSubmissionPage();
}
