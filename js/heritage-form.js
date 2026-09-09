// Administrator heritage site form: create and edit official records.
//
// The slug is what public heritage URLs and printed QR codes point at. It is
// generated once for new records and then kept during edits so printed codes
// remain valid. Only an administrator can reach these writes, per the heritage
// policy in database/schema.sql.

function createSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getHeritageFormSiteId() {
  return getQueryParam('id');
}

/* ---------------------------------------------------------------------------
 * Rendering
 * ------------------------------------------------------------------------ */

// A missing field used to throw here and abandon the rest of the fill, leaving
// a partly populated form that would then save the wrong values.
function setHeritageFieldValue(elementId, value) {
  const field = document.getElementById(elementId);

  if (!field) {
    return;
  }

  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function fillHeritageForm(site) {
  setText('heritageFormTitle', 'Edit Heritage Site');
  setText('heritageFormHelp', 'Update official heritage information. Leave the photograph blank to keep the current image.');
  setText('heritageFormButton', 'Update Heritage Site');

  setHeritageFieldValue('siteName', site.name || '');
  setHeritageFieldValue('siteLocation', site.location || '');
  setHeritageFieldValue('historicalPeriod', site.historical_period || '');
  setHeritageFieldValue('shortDescription', site.short_description || '');
  setHeritageFieldValue('historicalBackground', site.historical_background || '');
  setHeritageFieldValue('sourceReference', site.source_reference || '');
  setHeritageFieldValue('siteStatus', site.status || SITE_STATUSES.active);

  const slugHelp = document.getElementById('siteSlugHelp');
  if (slugHelp) {
    const output = document.createElement('output');
    output.id = 'siteSlugPreview';
    output.textContent = site.slug || 'Unavailable';
    slugHelp.replaceChildren('Permanent address (kept when the name changes): ', output);
  }

  if (site.main_photo) {
    setText('currentPhotoHelp', 'The existing photograph will be kept unless you choose a new main photograph.');
  }
}

/* ---------------------------------------------------------------------------
 * Reading and validating the form
 * ------------------------------------------------------------------------ */

function collectHeritageFormData() {
  return {
    name: readTrimmedField('siteName'),
    location: readTrimmedField('siteLocation'),
    historicalPeriod: readTrimmedField('historicalPeriod'),
    shortDescription: readTrimmedField('shortDescription'),
    historicalBackground: readTrimmedField('historicalBackground'),
    sourceReference: readTrimmedField('sourceReference'),
    mainPhoto: readChosenFile('mainPhoto'),
    status: readFieldValue('siteStatus')
  };
}

function validateHeritageSiteForm(formData) {
  return {
    siteName: validateTextLength(formData.name, 'Heritage name', FORM_LIMITS.siteName) || (!createSlug(formData.name) ? 'Use a heritage name that can produce a URL-safe address.' : ''),
    siteLocation: validateRequired(formData.location, 'the location'),
    historicalPeriod: validateRequired(formData.historicalPeriod, 'the historical period'),
    shortDescription: validateTextLength(formData.shortDescription, 'Short description', FORM_LIMITS.shortDescription),
    historicalBackground: validateRequired(formData.historicalBackground, 'the historical background'),
    sourceReference: validateOptionalUrlOrText(formData.sourceReference, 'source/reference'),
    mainPhoto: formData.mainPhoto ? validateImageFile(formData.mainPhoto) : '',
    siteStatus: validateAllowedValue(formData.status, SITE_STATUS_VALUES, 'status')
  };
}

/* ---------------------------------------------------------------------------
 * Slug
 * ------------------------------------------------------------------------ */

// Appends -2, -3 and so on until the slug is free. excludeSiteId keeps a site
// from colliding with itself while being edited.
async function createUniqueHeritageSlug(baseSlug, currentSiteId) {
  let slug = baseSlug;
  let counter = 2;

  while (true) {
    const { data, error } = await HeritageQueries.findBySlug(slug, currentSiteId);

    if (error) {
      logAppError('Could not check heritage slug uniqueness.', error);
      return {
        slug: '',
        error: error
      };
    }

    if (!data) {
      return {
        slug: slug,
        error: null
      };
    }

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

async function resolveHeritageSlug(formData, currentSiteId) {
  const baseSlug = createSlug(formData.name);

  if (!getSupabaseClient()) {
    return {
      slug: '',
      error: createAppError(APP_MESSAGES.notConfigured)
    };
  }

  if (!baseSlug) {
    return {
      slug: '',
      error: createAppError('Please use a heritage site name that can create a valid URL slug.')
    };
  }

  const slugResult = await createUniqueHeritageSlug(baseSlug, currentSiteId);

  if (slugResult.error) {
    return {
      slug: '',
      error: createAppError(getAppErrorMessage(slugResult.error, APP_MESSAGES.duplicateSlug))
    };
  }

  return slugResult;
}

/* ---------------------------------------------------------------------------
 * Saving
 * ------------------------------------------------------------------------ */

function buildHeritageSiteRecord(formData, slug) {
  const record = {
    name: formData.name,
    short_description: formData.shortDescription,
    historical_background: formData.historicalBackground,
    location: formData.location,
    historical_period: formData.historicalPeriod,
    source_reference: formData.sourceReference || null,
    status: formData.status
  };

  if (slug) record.slug = slug;
  return record;
}

async function addHeritageSite(formData, adminProfile, onProgress) {
  const slugResult = await resolveHeritageSlug(formData);

  if (slugResult.error) {
    return {
      data: null,
      error: slugResult.error
    };
  }

  const record = buildHeritageSiteRecord(formData, slugResult.slug);
  record.main_photo = null;
  record.created_by = adminProfile.id;

  const { data: site, error: insertError } = await HeritageQueries.insert(record);

  if (insertError || !site) {
    logAppError('Could not create heritage site.', insertError);
    return createErrorResult(getAppErrorMessage(insertError, APP_MESSAGES.saveFailed));
  }

  if (!formData.mainPhoto) {
    return {
      data: site,
      error: null
    };
  }

  if (onProgress) onProgress('Uploading the main photograph...');
  const uploadResult = await uploadHeritageImage(site.id, formData.mainPhoto);

  // An upload that reports no error but returns no path is still a failure.
  if (uploadResult.error || !uploadResult.data || !uploadResult.data.path) {
    return {
      data: site,
      error: createAppError(APP_MESSAGES.storageFailed)
    };
  }

  const { error: updateError } = await HeritageQueries.updateMainPhoto(site.id, uploadResult.data.path);

  if (updateError) {
    logAppError('Could not save heritage image path.', updateError);
    await removeImageFile(uploadResult.data.path);
    return {
      data: site,
      error: createAppError(getAppErrorMessage(updateError, APP_MESSAGES.saveFailed))
    };
  }

  return {
    data: site,
    error: null
  };
}

async function updateHeritageSite(siteId, formData, onProgress, existingPhotoPath) {
  // Omit slug from edits. The stored value is the permanent destination of
  // printed QR codes even when an administrator changes the display name.
  const updates = buildHeritageSiteRecord(formData);

  // Kept so the previous file can be removed once the new path is committed.
  const previousPhoto = existingPhotoPath || '';

  if (formData.mainPhoto) {
    if (onProgress) onProgress('Uploading the main photograph...');
    const uploadResult = await uploadHeritageImage(siteId, formData.mainPhoto);

    if (uploadResult.error || !uploadResult.data || !uploadResult.data.path) {
      return createErrorResult(APP_MESSAGES.storageFailed);
    }

    updates.main_photo = uploadResult.data.path;
  }

  const { data, error } = await HeritageQueries.update(siteId, updates);

  if (error || !data) {
    logAppError('Could not update heritage site.', error);
    if (formData.mainPhoto && updates.main_photo) {
      await removeImageFile(updates.main_photo);
    }
    return createErrorResult(getAppErrorMessage(error, APP_MESSAGES.saveFailed));
  }

  // The replaced file is now unreferenced. A failure to delete it is not worth
  // reporting to the administrator; the record itself saved correctly.
  if (updates.main_photo && previousPhoto && previousPhoto !== updates.main_photo) {
    try {
      await removeImageFile(previousPhoto);
    } catch (removeError) {
      logAppError('Could not remove the replaced heritage photo.', removeError);
    }
  }

  return {
    data: data,
    error: null
  };
}

async function saveHeritageSite(siteId, formData, adminProfile, onProgress) {
  const invalid = Object.values(validateHeritageSiteForm(formData)).find(Boolean);
  if (invalid) return createErrorResult(invalid);
  const imageError = await validateImageContents(formData.mainPhoto);
  if (imageError) return createErrorResult(imageError);
  return siteId
    ? updateHeritageSite(siteId, formData, onProgress, loadedHeritagePhotoPath)
    : addHeritageSite(formData, adminProfile, onProgress);
}

/* ---------------------------------------------------------------------------
 * Data loading
 * ------------------------------------------------------------------------ */

// The photo path already stored for the site being edited, so a replacement
// upload can remove the file it supersedes.
let loadedHeritagePhotoPath = '';

async function loadHeritageSiteForEditing(siteId) {
  const form = document.getElementById('heritageForm');
  const button = document.getElementById('heritageFormButton');
  if (button) button.disabled = true;
  setFormBusy(form, true);
  showAppMessage('heritageFormMessage', 'Loading heritage site...', 'info');
  let loaded = false;
  try {
    if (!await requireAdmin()) return;
    const { data, error } = await HeritageQueries.getForEditing(siteId);
    if (error) throw error;
    if (!data) {
      showAppMessage('heritageFormMessage', 'This heritage record was not found. Return to Heritage Management and select a site.', 'warning');
      return;
    }
    loadedHeritagePhotoPath = data.main_photo || '';
    fillHeritageForm(data);
    const relatedSection = document.getElementById('relatedPhotosSection');
    if (relatedSection) relatedSection.classList.remove('d-none');
    await loadRelatedHeritagePhotos(siteId);
    loaded = true;
    showAppMessage('heritageFormMessage', 'Heritage site loaded. Its permanent public address will stay the same if the name changes.', 'info');
  } catch (error) {
    logAppError('Could not load heritage site for editing.', error);
    showAppMessage('heritageFormMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
  } finally {
    if (loaded) {
      setFormBusy(form, false);
      if (button) button.disabled = false;
    } else if (form) {
      // Fields stay disabled on purpose: there is no record to edit. Release the
      // busy bookkeeping through the helper so its snapshot is not left behind.
      setFormBusy(form, false);
      form.querySelectorAll('input, select, textarea, [data-password-toggle], [data-remove-selected-photo]').forEach(function (field) {
        field.disabled = true;
      });
      appendAppLink('heritageFormMessage', 'admin/heritage-sites.html', 'Return to Heritage Management');
    }
  }
}

async function handleHeritageFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('heritageFormButton');
  const siteId = getHeritageFormSiteId();
  const label = siteId ? 'Update Heritage Site' : 'Save Heritage Site';
  if (!claimButtonAction(button)) return;
  let saved = false;
  try {
    clearFormValidation(form);
    const dataToSave = collectHeritageFormData();
    if (!reportValidationResult(validateHeritageSiteForm(dataToSave), 'heritageFormMessage')) return;
    setFormBusy(form, true);
    setSubmitLoading(button, true, 'Saving heritage site...', label);
    showAppMessage('heritageFormMessage', 'Checking heritage information and photo...', 'info');
    const photoError = await validateImageContents(dataToSave.mainPhoto);
    if (photoError) {
      setFormBusy(form, false);
      reportValidationResult({ mainPhoto: photoError }, 'heritageFormMessage');
      return;
    }
    const profile = await requireAdmin();
    if (!profile) return;
    showAppMessage('heritageFormMessage', 'Saving heritage site...', 'info');
    const { data, error } = await saveHeritageSite(siteId, dataToSave, profile, message => showAppMessage('heritageFormMessage', message, 'info'));
    if (error && data) {
      saved = true;
      showAppMessage('heritageFormMessage', 'The heritage record was saved, but its photo could not be attached. Continue editing the saved record to retry the photo; do not create the site again.', 'warning');
      appendAppLink('heritageFormMessage', `admin/heritage-form.html?id=${encodeURIComponent(data.id)}`, 'Continue editing the saved site');
      await showSystemWarning('Upload failed', 'The heritage record was saved, but its photo could not be attached. Continue editing the saved record to retry the photo; do not create the site again.');
      return;
    }
    if (error) {
      const message = getAppErrorMessage(error, APP_MESSAGES.saveFailed);
      showAppMessage('heritageFormMessage', message + (message === APP_MESSAGES.networkFailed ? ' Check Heritage Management before retrying, in case the record was saved.' : ''), 'danger');
      await showSystemErrorFor(error, 'Failed to save', APP_MESSAGES.saveFailed);
      return;
    }
    saved = true;
    showAppMessage('heritageFormMessage', 'Heritage site saved. Returning to Heritage Management...', 'success');
    rememberAppFeedback('Heritage site saved successfully.', 'success');
    const savedSlug = data && data.slug ? `?created=${encodeURIComponent(data.slug)}` : '';
    // Same destination as before; opened once the administrator acknowledges.
    await showSystemSuccess('Heritage site saved', 'The heritage record was saved. Returning to Heritage Management.', 'Back to Heritage Management');
    window.location.href = `heritage-sites.html${savedSlug}`;
  } catch (error) {
    logAppError('Heritage save request failed.', error);
    showAppMessage('heritageFormMessage', getAppErrorMessage(error, APP_MESSAGES.saveFailed), 'danger');
    await showSystemErrorFor(error, 'Failed to save', APP_MESSAGES.saveFailed);
  } finally {
    setFormBusy(form, false);
    setSubmitLoading(button, false, '', label);
    if (saved) { button.disabled = true; button.textContent = 'Record saved'; }
  }
}

const heritageForm = document.getElementById('heritageForm');

if (heritageForm) {
  const editingSiteId = getHeritageFormSiteId();

  if (editingSiteId) {
    loadHeritageSiteForEditing(editingSiteId);
  }

  heritageForm.addEventListener('submit', handleHeritageFormSubmit);
}

// New records preview their generated address. Edit pages replace this output
// with the stored permanent slug after the record loads.
const siteNameInput = document.getElementById('siteName');
if (siteNameInput) {
  const updateSlugPreview = function () {
    const output = document.getElementById('siteSlugPreview');
    if (getHeritageFormSiteId()) return;
    if (output) output.textContent = createSlug(siteNameInput.value.trim()) || 'Enter a site name';
  };
  siteNameInput.addEventListener('input', updateSlugPreview);
  updateSlugPreview();
}
