// Related heritage photographs on the administrator heritage form.
//
// These are media rows with a heritage_site_id and no story_id. Both the media
// policy and the storage policy require an administrator for these writes.

/* ---------------------------------------------------------------------------
 * Rendering
 * ------------------------------------------------------------------------ */

function createRelatedPhotoCard(photo) {
  const caption = photo.caption || 'Related heritage photograph';

  return html`
    <div class="col-md-6 col-lg-4">
      <article class="starter-card h-100">
        <img class="related-media-image d-none" data-related-photo-path="${photo.image_url}" alt="${caption}">
        <p class="mt-2 mb-3">${caption}</p>
        <button type="button" class="btn btn-sm btn-outline-danger" data-related-photo-id="${photo.id}" data-related-photo-path="${photo.image_url}">Remove</button>
      </article>
    </div>
  `;
}

async function loadRelatedPhotoImage(image) {
  if (!image || !image.dataset.relatedPhotoPath) {
    return;
  }

  try {
    const { signedUrl, error } = await createSignedImageUrl(image.dataset.relatedPhotoPath, 3600);

    if (error) {
      logAppError('Could not load related heritage photo.', error);
      return;
    }

    const safeUrl = safeImageUrl(signedUrl);

    if (!safeUrl) {
      return;
    }

    image.addEventListener('error', function () {
      image.classList.add('d-none');
    }, { once: true });

    image.src = safeUrl;
    image.classList.remove('d-none');
  } catch (error) {
    logAppError('Could not load related heritage photo.', error);
  }
}

function renderRelatedHeritagePhotos(siteId, photos) {
  const list = document.getElementById('relatedPhotosList');

  if (!list) {
    return;
  }

  if (!photos.length) {
    setSafeHtml(list, trustedHtml('<p class="text-muted">No related heritage photos yet.</p>'));
    return;
  }

  setSafeHtml(list, photos.map(createRelatedPhotoCard));

  // Scoped to the list just rendered. A document-wide query re-bound whatever
  // else matched on the page every time the list reloaded.
  list.querySelectorAll('button[data-related-photo-path][data-related-photo-id]').forEach(function (button) {
    button.addEventListener('click', function () {
      removeRelatedHeritagePhoto(siteId, button, button.dataset.relatedPhotoId, button.dataset.relatedPhotoPath);
    });
  });

  list.querySelectorAll('img[data-related-photo-path]').forEach(loadRelatedPhotoImage);
}

/* ---------------------------------------------------------------------------
 * Data loading and saving
 * ------------------------------------------------------------------------ */

async function loadRelatedHeritagePhotos(siteId) {
  const list = document.getElementById('relatedPhotosList');

  if (!list || !getSupabaseClient() || !siteId) {
    return;
  }

  setSafeHtml(list, trustedHtml('<p class="text-muted">Loading related photos...</p>'));

  const { data, error } = await MediaQueries.listForHeritageSite(siteId);

  if (error) {
    logAppError('Could not load related heritage photos.', error);
    setSafeHtml(list, trustedHtml('<p class="text-danger">Could not load related photos. Reload the page to try again.</p>'));
    return false;
  }

  renderRelatedHeritagePhotos(siteId, data || []);
  return true;
}

// Keeps the delete inside this site's own storage folder. The storage policy
// enforces the same boundary on the server.
function isPhotoOwnedBySite(imagePath, siteId) {
  return Boolean(imagePath) && imagePath.startsWith(`heritage/${siteId}/`);
}

async function removeRelatedHeritagePhoto(siteId, button, mediaId, imagePath) {
  if (!isPhotoOwnedBySite(imagePath, siteId)) {
    showAppMessage('relatedPhotosMessage', 'This photo cannot be removed from this heritage site.', 'danger');
    return;
  }
  if (!claimButtonAction(button)) return;
  let fileRemoved = false;
  try {
    await showConfirmationModal({
      title: 'Remove this photo?',
      message: 'The stored photo and its archive reference will be removed. This cannot be undone.',
      confirmText: 'Remove Photo',
      cancelText: 'Keep Photo',
      variant: 'danger',
      trigger: button,
      onConfirm: async function () {
        if (!await requireAdmin()) return;
        setSubmitLoading(button, true, 'Removing...', 'Remove');
        showAppMessage('relatedPhotosMessage', 'Removing related photo...', 'info');
        const { error: storageError } = await removeImageFile(imagePath);
        if (storageError) throw storageError;
        fileRemoved = true;
        const { error: mediaError } = await MediaQueries.deleteHeritagePhoto(mediaId, siteId);
        if (mediaError) throw mediaError;
        const refreshed = await loadRelatedHeritagePhotos(siteId);
        showAppMessage('relatedPhotosMessage', refreshed ? 'Related photo removed successfully.' : 'The photo was removed, but the list could not reload. Refresh the page before making another change.', refreshed ? 'success' : 'warning');
      }
    });
  } catch (error) {
    logAppError('Could not remove related heritage photo.', error);
    const partial = 'The image file was removed, but its archive reference could not be removed. Refresh the list and contact an administrator before retrying.';
    showAppMessage('relatedPhotosMessage', fileRemoved
      ? partial
      : getAppErrorMessage(error, APP_MESSAGES.storageFailed), fileRemoved ? 'warning' : 'danger');
    await (fileRemoved
      ? showSystemWarning('Photo partly removed', partial)
      : showSystemErrorFor(error, 'Failed to save', APP_MESSAGES.storageFailed));
  } finally {
    setSubmitLoading(button, false, '', 'Remove');
  }
}

async function saveRelatedHeritagePhoto(siteId, adminProfile, file, caption) {
  const uploadResult = await uploadHeritageImage(siteId, file);

  if (uploadResult.error || !uploadResult.data || !uploadResult.data.path) {
    return uploadResult.error || createAppError(APP_MESSAGES.storageFailed);
  }

  const { error: mediaError } = await MediaQueries.insert({
    heritage_site_id: siteId,
    story_id: null,
    uploaded_by: adminProfile.id,
    image_url: uploadResult.data.path,
    caption: caption || null
  });

  if (mediaError) {
    logAppError('Could not save related heritage photo record.', mediaError);
    await removeImageFile(uploadResult.data.path);
    return mediaError;
  }

  return null;
}

/* ---------------------------------------------------------------------------
 * Event handling
 * ------------------------------------------------------------------------ */

async function uploadRelatedHeritagePhoto(siteId) {
  const button = document.getElementById('uploadRelatedPhotoButton');
  const form = document.getElementById('heritageForm');
  const section = document.getElementById('relatedPhotosSection');
  const saveButton = document.getElementById('heritageFormButton');
  // Parenthesised: the form-busy check must short-circuit before the button is
  // claimed, otherwise a busy form would leave the button permanently disabled.
  if ((form && form.dataset.busy === 'true') || !claimButtonAction(button)) return;
  const input = document.getElementById('relatedPhoto');
  const wasSaveDisabled = Boolean(saveButton && saveButton.disabled);
  try {
    const file = readChosenFile('relatedPhoto');
    const invalid = validateImageFile(file) || await validateImageContents(file);
    if (invalid) {
      showFieldError('relatedPhoto', invalid);
      showAppMessage('relatedPhotosMessage', invalid, 'warning');
      await showSystemModal({ type: 'warning', title: 'Invalid image', message: invalid, buttonText: 'Go Back', returnFocus: false });
      if (input) input.focus();
      return;
    }
    if (!siteId) {
      showAppMessage('relatedPhotosMessage', 'Save the heritage site before adding related photos.', 'warning');
      await showSystemWarning('Save the site first', 'Save the heritage site before adding related photos.');
      return;
    }
    setSubmitLoading(button, true, 'Uploading photo...', 'Upload Related Photo');
    setFormBusy(section, true);
    if (saveButton) saveButton.disabled = true;
    const profile = await requireAdmin();
    if (!profile) return;
    showAppMessage('relatedPhotosMessage', 'Uploading related photo...', 'info');
    const failure = await saveRelatedHeritagePhoto(siteId, profile, file, readTrimmedField('relatedPhotoCaption'));
    if (failure) throw failure;
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const caption = document.getElementById('relatedPhotoCaption');
    if (caption) caption.value = '';
    const refreshed = await loadRelatedHeritagePhotos(siteId);
    showAppMessage('relatedPhotosMessage', refreshed ? 'Related photo uploaded successfully.' : 'The photo was uploaded, but the list could not reload. Refresh the page; do not upload the photo again.', refreshed ? 'success' : 'warning');
    await (refreshed
      ? showSystemSuccess('Photo uploaded', 'The related heritage photo was uploaded and added to this site.')
      : showSystemWarning('Photo uploaded', 'The photo was uploaded, but the list could not reload. Refresh the page; do not upload the photo again.'));
  } catch (error) {
    logAppError('Related photo upload failed.', error);
    showAppMessage('relatedPhotosMessage', getAppErrorMessage(error, APP_MESSAGES.storageFailed), 'danger');
    await showSystemErrorFor(error, 'Upload failed', APP_MESSAGES.storageFailed);
  } finally {
    setFormBusy(section, false);
    if (saveButton) saveButton.disabled = wasSaveDisabled;
    setSubmitLoading(button, false, '', 'Upload Related Photo');
  }
}

const uploadRelatedPhotoButton = document.getElementById('uploadRelatedPhotoButton');

if (uploadRelatedPhotoButton) {
  uploadRelatedPhotoButton.addEventListener('click', function () {
    const siteId = getHeritageFormSiteId();

    if (!siteId) {
      showAppMessage('relatedPhotosMessage', 'Save the heritage site before adding related photos.', 'warning');
      return;
    }

    uploadRelatedHeritagePhoto(siteId);
  });
}
