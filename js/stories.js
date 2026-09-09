// Public single story page.

function getStoryIdFromUrl() {
  return getQueryParam('id');
}

async function showStoryPhoto(mediaItems, storyTitle) {
  const storyPhoto = document.getElementById('storyPhoto');

  if (!storyPhoto || !mediaItems || !mediaItems.length) {
    return;
  }

  const firstPhoto = mediaItems[0];
  const { signedUrl, error } = await createSignedImageUrl(firstPhoto.image_url, 3600);

  if (error) {
    logAppError('Could not load story photograph.', error);
    return;
  }

  storyPhoto.src = safeImageUrl(signedUrl);
  storyPhoto.alt = firstPhoto.caption || storyTitle;
  storyPhoto.classList.remove('d-none');
}

function fillStoryDetails(story) {
  const heritageSite = story.heritage_sites || {};
  const contributorName = story.allow_public_name
    ? story.contributor_display_name || 'Community Contributor'
    : 'Community Contributor';
  const backLink = document.getElementById('backToHeritageLink');

  setText('storyTitle', story.title);
  setText('storyClassification', story.classification, 'Community Story');
  setText('storyHeritageSite', heritageSite.name, 'Heritage site unavailable');
  setText('storyContent', story.content);
  setText('storySourceReference', story.source_reference, 'No source/reference provided.');
  setText('storyContributor', contributorName);

  if (backLink && heritageSite.slug) {
    backLink.href = `heritage.html?site=${encodeURIComponent(heritageSite.slug)}`;
  }

  showStoryPhoto(story.media || [], story.title || 'Community story photograph');
  document.getElementById('storyDetails').classList.remove('d-none');
}

async function loadStoryDetailsPage() {
  const storyId = getStoryIdFromUrl();

  if (!storyId) {
    showAppMessage('storyDetailsMessage', 'No story was selected. Please browse heritage sites first.', 'warning');
    return;
  }

  showAppMessage('storyDetailsMessage', 'Loading story...', 'info');

  const { data, error } = await StoryQueries.getPublished(storyId);

  if (error) {
    logAppError('Could not load story.', error);
    showAppMessage('storyDetailsMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return;
  }

  if (!data) {
    showAppMessage('storyDetailsMessage', APP_MESSAGES.storyNotFound, 'warning');
    return;
  }

  fillStoryDetails(data);
  showAppMessage('storyDetailsMessage', 'Story loaded successfully.', 'success');
}

if (document.body.dataset.page === 'story-details') {
  loadStoryDetailsPage();
}
