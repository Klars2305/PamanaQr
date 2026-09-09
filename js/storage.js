const HERITAGE_IMAGES_BUCKET = 'heritage-images';
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function getFileExtension(fileName) {
  return fileName.split('.').pop().toLowerCase();
}

function validateImageFile(file) {
  if (!file) {
    return 'Please choose an image to upload.';
  }

  const extension = getFileExtension(file.name);

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Please upload a JPG, JPEG, PNG, or WEBP image.';
  }

  if (!ALLOWED_IMAGE_EXTENSIONS.includes(extension)) {
    return 'The image file extension must be JPG, JPEG, PNG, or WEBP.';
  }

  if (!file.size) {
    return 'This image is empty. Please choose a valid image.';
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return 'Please upload an image smaller than 5 MB.';
  }

  return '';
}

// Validate the actual bytes, not only the browser-provided MIME/extension.
// File objects are immutable; cache by object to avoid decoding twice when the
// preview and the submit handler validate the same selection.
const checkedImages = new WeakMap();
async function inspectImageContents(file) {
  const metadataError = validateImageFile(file);
  if (metadataError) return metadataError;
  try {
    const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => b[index] === value);
    const webp = String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
    const matches = { 'image/jpeg': jpeg, 'image/png': png, 'image/webp': webp };
    if (!matches[file.type]) return 'This file is not a valid JPG, PNG, or WebP image. Choose another photo.';
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width > 0 && bitmap.height > 0;
      bitmap.close();
      if (!valid) return 'This image could not be opened. Choose another photo.';
    }
    return '';
  } catch (_) {
    return 'This image could not be opened. It may be damaged. Choose another photo.';
  }
}
function validateImageContents(file) {
  if (!file) return Promise.resolve('');
  if (!checkedImages.has(file)) checkedImages.set(file, inspectImageContents(file));
  return checkedImages.get(file);
}

function createUniqueImageName(file) {
  const extension = getFileExtension(file.name);
  const randomPart = crypto.randomUUID();

  return `${Date.now()}-${randomPart}.${extension}`;
}

function createHeritageImagePath(heritageSiteId, file) {
  return `heritage/${heritageSiteId}/${createUniqueImageName(file)}`;
}

function createStoryImagePath(storyId, contributorId, file) {
  return `stories/${storyId}/${contributorId}/${createUniqueImageName(file)}`;
}

async function uploadImageFile(path, file) {
  const validationMessage = !file ? validateImageFile(file) : await validateImageContents(file);

  if (validationMessage) {
    return {
      data: null,
      error: createAppError(validationMessage)
    };
  }

  const supabaseClient = getSupabaseClient();

  if (!supabaseClient) {
    return {
      data: null,
      error: createAppError(APP_MESSAGES.notConfigured)
    };
  }

  let data;
  let error;

  try {
    const result = await supabaseClient.storage
      .from(HERITAGE_IMAGES_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false
      });
    data = result.data;
    error = result.error;
  } catch (requestError) {
    logAppError('Image upload request failed.', requestError);
    return {
      data: null,
      error: createAppError(getAppErrorMessage(requestError, APP_MESSAGES.storageFailed))
    };
  }

  if (error || !data || !data.path) {
    logAppError('Image upload failed.', error);
    return {
      data: null,
      error: createAppError(getAppErrorMessage(error, APP_MESSAGES.storageFailed))
    };
  }

  return {
    data: data,
    error: null
  };
}

async function uploadHeritageImage(heritageSiteId, file) {
  try {
    const path = createHeritageImagePath(heritageSiteId, file);
    return await uploadImageFile(path, file);
  } catch (error) {
    logAppError('Could not prepare heritage photo upload.', error);
    return createErrorResult(APP_MESSAGES.storageFailed);
  }
}

async function uploadStoryImage(storyId, contributorId, file) {
  try {
    const path = createStoryImagePath(storyId, contributorId, file);
    return await uploadImageFile(path, file);
  } catch (error) {
    logAppError('Could not prepare story photo upload.', error);
    return createErrorResult(APP_MESSAGES.storageFailed);
  }
}

async function removeImageFile(path) {
  return runSupabaseQuery('Could not remove image file.', APP_MESSAGES.storageFailed, function (supabaseClient) {
    return supabaseClient.storage
      .from(HERITAGE_IMAGES_BUCKET)
      .remove([path]);
  });
}

async function createSignedImageUrl(path, expiresInSeconds) {
  const supabaseClient = getSupabaseClient();

  if (!supabaseClient || !path) {
    return {
      signedUrl: '',
      error: createAppError(APP_MESSAGES.databaseFailed)
    };
  }

  let data;
  let error;

  try {
    const result = await supabaseClient.storage
      .from(HERITAGE_IMAGES_BUCKET)
      .createSignedUrl(path, expiresInSeconds || 3600);
    data = result.data;
    error = result.error;
  } catch (requestError) {
    logAppError('Could not create signed image URL.', requestError);
    return {
      signedUrl: '',
      error: createAppError(getAppErrorMessage(requestError, APP_MESSAGES.databaseFailed))
    };
  }

  if (error || !data || !data.signedUrl) {
    logAppError('Could not create signed image URL.', error);
    return {
      signedUrl: '',
      error: createAppError(getAppErrorMessage(error, APP_MESSAGES.databaseFailed))
    };
  }

  return {
    signedUrl: data.signedUrl,
    error: null
  };
}
