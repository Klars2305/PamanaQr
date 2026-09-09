// Public heritage site page: official record, published stories, related media.

function getHeritageSlugFromUrl() {
  return getQueryParam('site') || getQueryParam('slug') || '';
}

function showHeritageDetails() {
  const detailsElement = document.getElementById('heritageDetails');

  if (detailsElement) {
    detailsElement.classList.remove('d-none');
  }
}

async function renderStorageImage(imageElement, imagePath, altText) {
  if (!imagePath || !imageElement) {
    return;
  }

  try {
    const { signedUrl, error } = await createSignedImageUrl(imagePath, 3600);

    if (error) {
      logAppError('Could not load heritage image.', error);
      return;
    }

    const safeUrl = safeImageUrl(signedUrl);

    if (!safeUrl) {
      return;
    }

    imageElement.addEventListener('error', function () {
      imageElement.classList.add('d-none');
    }, { once: true });

    imageElement.src = safeUrl;
    imageElement.alt = altText;
    imageElement.classList.remove('d-none');
  } catch (error) {
    logAppError('Could not load heritage image.', error);
  }
}

// A contributor name is only shown when the contributor allowed it.
function getPublicContributorName(story) {
  return story.allow_public_name
    ? story.contributor_display_name || 'Community Contributor'
    : 'Community Contributor';
}

function createPublishedStoryPanel(story) {
  const storyUrl = `story.html?id=${encodeURIComponent(story.id)}`;

  return html`
    <div class="col-md-6">
      <article class="starter-card h-100">
        <p class="text-muted mb-1">${story.classification || 'Community Story'}</p>
        <h3 class="h5">${story.title}</h3>
        <p>${story.content}</p>
        <p class="small text-muted mb-0">Shared by ${getPublicContributorName(story)}</p>
        <a class="btn btn-outline-success mt-3" href="${storyUrl}">Read Story</a>
      </article>
    </div>
  `;
}

function renderPublishedStories(stories) {
  const list = document.getElementById('publishedStoriesList');

  if (!list) {
    return;
  }

  if (!stories.length) {
    setSafeHtml(list, trustedHtml('<p class="text-muted">No published community stories yet.</p>'));
    return;
  }

  setSafeHtml(list, stories.map(createPublishedStoryPanel));
}

function createRelatedMediaPanel(item) {
  return html`
    <div class="col-md-4">
      <article class="starter-card h-100">
        <img class="related-media-image d-none" data-media-path="${item.image_url}" alt="${item.caption || 'Related heritage photograph'}">
        <p class="mt-2 mb-0">${item.caption || 'Heritage photograph'}</p>
      </article>
    </div>
  `;
}

async function renderRelatedMedia(mediaItems) {
  const list = document.getElementById('relatedMediaList');

  if (!list) {
    return;
  }

  if (!mediaItems.length) {
    setSafeHtml(list, trustedHtml('<p class="text-muted">No related photographs yet.</p>'));
    return;
  }

  setSafeHtml(list, mediaItems.map(createRelatedMediaPanel));

  // Scoped to the list just rendered, not the whole document.
  list.querySelectorAll('[data-media-path]').forEach(function (image) {
    renderStorageImage(image, image.dataset.mediaPath, image.alt);
  });
}

async function updateContributionAction() {
  const action = document.getElementById('contributionAction');

  if (!action) {
    return;
  }

  let profile = null;

  try {
    profile = await getCurrentUserProfile();
  } catch (error) {
    logAppError('Could not read the session for the contribute action.', error);
  }

  if (profile && profile.role === PAMANA_ROLES.contributor) {
    action.textContent = 'Contribute a Story';
    action.href = toAppUrl('contribute.html');
    return;
  }

  action.textContent = 'Login to Contribute';
  action.href = toAppUrl('login.html');
}

function renderHeritageRecord(site) {
  setText('heritageName', site.name);
  setText('heritageLocation', site.location, 'Location not provided');
  setText('heritagePeriod', site.historical_period, 'Historical period not provided');
  setText('heritageShortDescription', site.short_description, 'No short description available.');
  setText('heritageBackground', site.historical_background, 'No historical background available.');
  setText('heritageSources', site.source_reference, 'No sources provided yet.');
}

// Media is scoped to this site plus the stories that are already published, so
// a photograph on a submitted or rejected story is never requested.
function collectPublishedStoryIds(stories) {
  return stories.map(function (story) {
    return story.id;
  });
}

async function loadHeritageStoriesAndMedia(site) {
  const storiesResult = await StoryQueries.listPublishedForSite(site.id);
  const publishedStories = storiesResult.data || [];
  const mediaResult = await MediaQueries.listForSiteAndStories(
    site.id,
    collectPublishedStoryIds(publishedStories)
  );

  if (storiesResult.error) {
    logAppError('Could not load published stories.', storiesResult.error);
    showAppMessage('heritageDetailsMessage', getAppErrorMessage(storiesResult.error, APP_MESSAGES.databaseFailed), 'warning');
  } else {
    renderPublishedStories(publishedStories);
  }

  if (mediaResult.error) {
    logAppError('Could not load related media.', mediaResult.error);
    showAppMessage('heritageDetailsMessage', getAppErrorMessage(mediaResult.error, APP_MESSAGES.databaseFailed), 'warning');
  } else {
    await renderRelatedMedia(mediaResult.data || []);
  }
  return !storiesResult.error && !mediaResult.error;
}

async function loadHeritageDetailsPage() {
  const slug = getHeritageSlugFromUrl();

  await updateContributionAction();

  if (!slug) {
    showAppMessage('heritageDetailsMessage', 'No heritage site was selected. Please browse heritage sites first.', 'warning');
    appendAppLink('heritageDetailsMessage', 'browse.html', 'Browse Heritage');
    return;
  }

  showAppMessage('heritageDetailsMessage', 'Loading heritage site...', 'info');

  try {
    const { data: site, error: siteError } = await HeritageQueries.getActiveBySlug(slug);

    if (siteError) {
      logAppError('Could not load heritage site.', siteError);
      showAppMessage('heritageDetailsMessage', getAppErrorMessage(siteError, APP_MESSAGES.databaseFailed), 'danger');
      return;
    }

    // An archived or missing site looks the same to a visitor.
    if (!site) {
      showAppMessage('heritageDetailsMessage', APP_MESSAGES.heritageNotFound, 'warning');
      appendAppLink('heritageDetailsMessage', 'browse.html', 'Browse Heritage');
      return;
    }

    renderHeritageRecord(site);

    await renderStorageImage(
      document.getElementById('heritagePhoto'),
      site.main_photo,
      site.name
    );

    const complete = await loadHeritageStoriesAndMedia(site);

    showHeritageDetails();
    if (complete) showAppMessage('heritageDetailsMessage', 'Heritage site loaded successfully.', 'success');
  } catch (error) {
    logAppError('Could not load heritage site.', error);
    showAppMessage('heritageDetailsMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
  }
}

if (document.body.dataset.page === 'heritage-details') {
  loadHeritageDetailsPage();
}
