// Administrator heritage site form: create and edit official records.
//
// The slug is what public heritage URLs and printed QR codes point at, so it
// is always derived through createSlug and checked for uniqueness before it is
// written. Only an administrator can reach these writes, per the heritage
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

function fillHeritageForm(site) {
  document.getElementById('heritageFormTitle').textContent = 'Edit Heritage Site';
  document.getElementById('heritageFormHelp').textContent = 'Update official heritage information. Leave the photograph blank to keep the current image.';
  document.getElementById('heritageFormButton').textContent = 'Update Heritage Site';
  document.getElementById('siteName').value = site.name || '';
  document.getElementById('siteLocation').value = site.location || '';
  document.getElementById('historicalPeriod').value = site.historical_period || '';
  document.getElementById('shortDescription').value = site.short_description || '';
  document.getElementById('historicalBackground').value = site.historical_background || '';
  document.getElementById('sourceReference').value = site.source_reference || '';
  document.getElementById('siteStatus').value = site.status || SITE_STATUSES.active;

  if (site.main_photo) {
    document.getElementById('currentPhotoHelp').textContent = `Current photograph path: ${site.main_photo}`;
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
    siteName: validateRequired(formData.name, 'the heritage site name'),
    siteLocation: validateRequired(formData.location, 'the location'),
    historicalPeriod: validateRequired(formData.historicalPeriod, 'the historical period'),
    shortDescription: validateRequired(formData.shortDescription, 'a short description'),
    historicalBackground: validateRequired(formData.historicalBackground, 'the historical background'),
    sourceReference: validateOptionalUrlOrText(formData.sourceReference, 'source/reference'),
    mainPhoto: validateImageInput(document.getElementById('mainPhoto'), false),
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
  return {
    slug: slug,
    name: formData.name,
    short_description: formData.shortDescription,
    historical_background: formData.historicalBackground,
    location: formData.location,
    historical_period: formData.historicalPeriod,
    source_reference: formData.sourceReference || null,
    status: formData.status
  };
}

async function addHeritageSite(formData, adminProfile) {
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

  if (insertError) {
    logAppError('Could not create heritage site.', insertError);
    return createErrorResult(getAppErrorMessage(insertError, APP_MESSAGES.saveFailed));
  }

  if (!formData.mainPhoto) {
    return {
      data: site,
      error: null
    };
  }

  const uploadResult = await uploadHeritageImage(site.id, formData.mainPhoto);

  if (uploadResult.error) {
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

async function updateHeritageSite(siteId, formData) {
  const slugResult = await resolveHeritageSlug(formData, siteId);

  if (slugResult.error) {
    return {
      data: null,
      error: slugResult.error
    };
  }

  const updates = buildHeritageSiteRecord(formData, slugResult.slug);

  if (formData.mainPhoto) {
    const uploadResult = await uploadHeritageImage(siteId, formData.mainPhoto);

    if (uploadResult.error) {
      return createErrorResult(APP_MESSAGES.storageFailed);
    }

    updates.main_photo = uploadResult.data.path;
  }

  const { data, error } = await HeritageQueries.update(siteId, updates);

  if (error) {
    logAppError('Could not update heritage site.', error);
    if (formData.mainPhoto && updates.main_photo) {
      await removeImageFile(updates.main_photo);
    }
    return createErrorResult(getAppErrorMessage(error, APP_MESSAGES.saveFailed));
  }

  return {
    data: data,
    error: null
  };
}

function saveHeritageSite(siteId, formData, adminProfile) {
  return siteId
    ? updateHeritageSite(siteId, formData)
    : addHeritageSite(formData, adminProfile);
}

/* ---------------------------------------------------------------------------
 * Data loading
 * ------------------------------------------------------------------------ */

async function loadHeritageSiteForEditing(siteId) {
  const adminProfile = await requireAdmin();

  if (!adminProfile) {
    return;
  }

  showAppMessage('heritageFormMessage', 'Loading heritage site...', 'info');

  const { data, error } = await HeritageQueries.getForEditing(siteId);

  if (error) {
    logAppError('Could not load heritage site for editing.', error);
    showAppMessage('heritageFormMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return;
  }

  fillHeritageForm(data);

  document.getElementById('relatedPhotosSection').classList.remove('d-none');
  await loadRelatedHeritagePhotos(siteId);

  showAppMessage('heritageFormMessage', 'Heritage site loaded. You can now edit it.', 'success');
}

/* ---------------------------------------------------------------------------
 * Event handling
 * ------------------------------------------------------------------------ */

async function handleHeritageFormSubmit(event) {
  event.preventDefault();

  const button = document.getElementById('heritageFormButton');
  const siteId = getHeritageFormSiteId();
  const normalLabel = siteId ? 'Update Heritage Site' : 'Save Heritage Site';

  // Claimed before the first await, so a double click cannot create the same
  // heritage site twice.
  if (!claimButtonAction(button)) {
    return;
  }

  clearFormValidation(event.target);

  const formData = collectHeritageFormData();

  if (!reportValidationResult(validateHeritageSiteForm(formData), 'heritageFormMessage')) {
    releaseButtonAction(button);
    return;
  }

  const adminProfile = await requireAdmin();

  if (!adminProfile) {
    return;
  }

  setSubmitLoading(button, true, 'Saving...', normalLabel);
  showAppMessage('heritageFormMessage', 'Saving heritage site...', 'info');

  const { data, error } = await saveHeritageSite(siteId, formData, adminProfile);

  if (error) {
    showAppMessage('heritageFormMessage', getAppErrorMessage(error, APP_MESSAGES.saveFailed), 'danger');
    setSubmitLoading(button, false, 'Saving...', normalLabel);
    return;
  }

  showAppMessage('heritageFormMessage', 'Heritage site saved successfully. Redirecting...', 'success');

  setTimeout(function () {
    window.location.href = `heritage-sites.html?created=${data.slug}`;
  }, 1200);
}

const heritageForm = document.getElementById('heritageForm');

if (heritageForm) {
  const editingSiteId = getHeritageFormSiteId();

  if (editingSiteId) {
    loadHeritageSiteForEditing(editingSiteId);
  }

  heritageForm.addEventListener('submit', handleHeritageFormSubmit);
}
