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

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return 'Please upload an image smaller than 5 MB.';
  }

  return '';
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
  const validationMessage = validateImageFile(file);

  if (validationMessage) {
    return {
      data: null,
      error: createAppError(APP_MESSAGES.invalidImage)
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

  if (error) {
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
  const path = createHeritageImagePath(heritageSiteId, file);
  return uploadImageFile(path, file);
}

async function uploadStoryImage(storyId, contributorId, file) {
  const path = createStoryImagePath(storyId, contributorId, file);
  return uploadImageFile(path, file);
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

  if (error) {
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
