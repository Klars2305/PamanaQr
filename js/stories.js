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

  if (!firstPhoto || !firstPhoto.image_url) {
    return;
  }

  try {
    const { signedUrl, error } = await createSignedImageUrl(firstPhoto.image_url, 3600);

    if (error) {
      logAppError('Could not load story photograph.', error);
      return;
    }

    const safeUrl = safeImageUrl(signedUrl);

    if (!safeUrl) {
      return;
    }

    storyPhoto.addEventListener('error', function () {
      storyPhoto.classList.add('d-none');
    }, { once: true });

    storyPhoto.src = safeUrl;
    storyPhoto.alt = firstPhoto.caption || storyTitle;
    storyPhoto.classList.remove('d-none');
  } catch (error) {
    logAppError('Could not load story photograph.', error);
  }
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

  const details = document.getElementById('storyDetails');
  if (details) details.classList.remove('d-none');
}

async function loadStoryDetailsPage() {
  const storyId = getStoryIdFromUrl();

  if (!storyId) {
    showAppMessage('storyDetailsMessage', 'No story was selected. Please browse heritage sites first.', 'warning');
    appendAppLink('storyDetailsMessage', 'browse.html', 'Browse Heritage');
    return;
  }

  showAppMessage('storyDetailsMessage', 'Loading story...', 'info');

  try {
    const { data, error } = await StoryQueries.getPublished(storyId);

    if (error) {
      logAppError('Could not load story.', error);
      showAppMessage('storyDetailsMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
      return;
    }

    if (!data) {
      showAppMessage('storyDetailsMessage', APP_MESSAGES.storyNotFound, 'warning');
      appendAppLink('storyDetailsMessage', 'browse.html', 'Browse Heritage');
      return;
    }

    fillStoryDetails(data);
    showAppMessage('storyDetailsMessage', 'Story loaded successfully.', 'success');
  } catch (error) {
    logAppError('Could not load story.', error);
    showAppMessage('storyDetailsMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
  }
}

if (document.body.dataset.page === 'story-details') {
  loadStoryDetailsPage();
}
