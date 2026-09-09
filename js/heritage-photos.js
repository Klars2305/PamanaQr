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
  const { signedUrl, error } = await createSignedImageUrl(image.dataset.relatedPhotoPath, 3600);

  if (error) {
    logAppError('Could not load related heritage photo.', error);
    return;
  }

  image.src = safeImageUrl(signedUrl);
  image.classList.remove('d-none');
}

function renderRelatedHeritagePhotos(siteId, photos) {
  const list = document.getElementById('relatedPhotosList');

  if (!photos.length) {
    setSafeHtml(list, trustedHtml('<p class="text-muted">No related heritage photos yet.</p>'));
    return;
  }

  setSafeHtml(list, photos.map(createRelatedPhotoCard));

  document.querySelectorAll('[data-related-photo-path][data-related-photo-id]').forEach(function (button) {
    button.addEventListener('click', function () {
      removeRelatedHeritagePhoto(siteId, button, button.dataset.relatedPhotoId, button.dataset.relatedPhotoPath);
    });
  });

  document.querySelectorAll('img[data-related-photo-path]').forEach(loadRelatedPhotoImage);
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
    setSafeHtml(list, trustedHtml('<p class="text-danger">Could not load related photos.</p>'));
    return;
  }

  renderRelatedHeritagePhotos(siteId, data || []);
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

  if (!window.confirm('Remove this related heritage photo?')) {
    return;
  }

  if (!claimButtonAction(button)) {
    return;
  }

  showAppMessage('relatedPhotosMessage', 'Removing related photo...', 'info');

  const { error: storageError } = await removeImageFile(imagePath);

  if (storageError) {
    logAppError('Could not remove related heritage photo from Storage.', storageError);
    showAppMessage('relatedPhotosMessage', getAppErrorMessage(storageError, APP_MESSAGES.storageFailed), 'danger');
    releaseButtonAction(button);
    return;
  }

  const { error: mediaError } = await MediaQueries.deleteHeritagePhoto(mediaId, siteId);

  if (mediaError) {
    logAppError('Could not remove related heritage photo record.', mediaError);
    showAppMessage('relatedPhotosMessage', getAppErrorMessage(mediaError, APP_MESSAGES.saveFailed), 'danger');
    releaseButtonAction(button);
    return;
  }

  await loadRelatedHeritagePhotos(siteId);
  showAppMessage('relatedPhotosMessage', 'Related photo removed successfully.', 'success');
}

async function saveRelatedHeritagePhoto(siteId, adminProfile, file, caption) {
  const uploadResult = await uploadHeritageImage(siteId, file);

  if (uploadResult.error) {
    return uploadResult.error;
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
  const uploadButton = document.getElementById('uploadRelatedPhotoButton');
  const file = readChosenFile('relatedPhoto');
  const validationMessage = validateImageFile(file);

  if (validationMessage) {
    showAppMessage('relatedPhotosMessage', validationMessage, 'warning');
    return;
  }

  if (!claimButtonAction(uploadButton)) {
    return;
  }

  const adminProfile = await requireAdmin();

  if (!adminProfile) {
    return;
  }

  showAppMessage('relatedPhotosMessage', 'Uploading related photo...', 'info');

  const failure = await saveRelatedHeritagePhoto(siteId, adminProfile, file, readTrimmedField('relatedPhotoCaption'));

  if (failure) {
    showAppMessage('relatedPhotosMessage', getAppErrorMessage(failure, APP_MESSAGES.storageFailed), 'danger');
    releaseButtonAction(uploadButton);
    return;
  }

  document.getElementById('relatedPhoto').value = '';
  document.getElementById('relatedPhotoCaption').value = '';
  releaseButtonAction(uploadButton);
  await loadRelatedHeritagePhotos(siteId);
  showAppMessage('relatedPhotosMessage', 'Related photo uploaded successfully.', 'success');
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
