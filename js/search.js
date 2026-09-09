// Public home and browse pages.
//
// Loading, rendering and event handling are kept apart below. Matching rules
// live in js/search-matching.js; row visibility lives in js/queries.js and RLS.

/* ---------------------------------------------------------------------------
 * Rendering
 * ------------------------------------------------------------------------ */

async function renderSignedCardImage(imageElement, imagePath, altText) {
  if (!imageElement || !imagePath || typeof createSignedImageUrl !== 'function') {
    return;
  }

  try {
    const { signedUrl, error } = await createSignedImageUrl(imagePath, 3600);

    if (error) {
      logAppError('Could not load public heritage card image.', error);
      return;
    }

    // An unusable scheme returns an empty string. Assigning it would ask the
    // browser to reload the page as an image, so the placeholder stays instead.
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
    logAppError('Could not load public heritage card image.', error);
  }
}

function createHeritageCard(site) {
  // The slug is percent-encoded for the query string, then escaped again by
  // the tag for the attribute it sits in.
  const siteUrl = `heritage.html?site=${encodeURIComponent(site.slug)}`;

  return html`
    <div class="col-md-6 col-lg-4">
      <article class="starter-card heritage-card h-100">
        <img class="heritage-card-image d-none" data-card-image="${site.main_photo || ''}" alt="${site.name}">
        <div class="heritage-card-body">
          <p class="text-muted mb-1">${site.historical_period || 'Historical period not provided'}</p>
          <h2 class="h5">${site.name}</h2>
          <p class="text-muted mb-2">${site.location || 'Location not provided'}</p>
          <p>${site.short_description || 'No short description yet.'}</p>
          <a href="${siteUrl}" class="btn btn-outline-success btn-sm">View Heritage Site</a>
        </div>
      </article>
    </div>
  `;
}

async function renderHeritageCards(containerId, sites, emptyMessage) {
  const container = document.getElementById(containerId);

  if (!container) {
    return;
  }

  if (!sites.length) {
    setSafeHtml(container, html`<p class="text-muted">${emptyMessage}</p>`);
    return;
  }

  setSafeHtml(container, sites.map(createHeritageCard));

  // Scoped to the container just filled, so a repeat render cannot pick up
  // images belonging to another grid on the same page.
  container.querySelectorAll('[data-card-image]').forEach(function (image) {
    renderSignedCardImage(image, image.dataset.cardImage, image.alt);
  });
}

function createPublishedStoryCard(story) {
  const heritageSite = story.heritage_sites || {};
  const storyUrl = `story.html?id=${encodeURIComponent(story.id)}`;

  return html`
    <div class="col-md-6 col-lg-4">
      <article class="starter-card h-100">
        <p class="text-muted mb-1">${story.classification || 'Community Story'}</p>
        <h2 class="h5">${story.title}</h2>
        <p class="text-muted">${heritageSite.name || 'Heritage site unavailable'}</p>
        <a href="${storyUrl}" class="btn btn-outline-success btn-sm">Read Story</a>
      </article>
    </div>
  `;
}

function renderPublishedStoryCards(stories, searchTerm) {
  const section = document.getElementById('communityStoriesSection');
  const container = document.getElementById('storyList');

  if (!section || !container) {
    return;
  }

  if (!searchTerm) {
    section.classList.add('d-none');
    container.innerHTML = '';
    return;
  }

  section.classList.remove('d-none');

  if (!stories.length) {
    setSafeHtml(container, trustedHtml('<p class="text-muted">No matching published community stories found.</p>'));
    return;
  }

  setSafeHtml(container, stories.map(createPublishedStoryCard));
}

// Signed-in navigation state is applied in one place, js/auth.js, for every
// page. This used to be a second implementation that ran on the public pages
// only, and it raced the first one over the same elements. Kept as the public
// entry point; the shared work is idempotent and the profile is cached.
async function updatePublicNavigation() {
  if (typeof updateRoleNavigation !== 'function') {
    return;
  }

  try {
    await updateRoleNavigation();
  } catch (error) {
    logAppError('Could not update public navigation.', error);
  }
}

/* ---------------------------------------------------------------------------
 * Data loading
 * ------------------------------------------------------------------------ */

// An empty term skips the story query entirely, matching the browse page rule
// that community stories only appear once the visitor has searched.
async function loadPublishedStorySearchMatches(searchTerm) {
  if (!searchTerm) {
    return {
      data: [],
      error: null
    };
  }

  return StoryQueries.searchPublishedByTitle(searchTerm);
}

async function loadBrowseResults(searchTerm) {
  const [sitesResult, storyMatchesResult] = await Promise.all([
    HeritageQueries.listActive(),
    loadPublishedStorySearchMatches(searchTerm)
  ]);

  return {
    sites: sitesResult.data || [],
    stories: storyMatchesResult.data || [],
    error: sitesResult.error || storyMatchesResult.error || null
  };
}

async function loadFeaturedSites() {
  showAppMessage('featuredSitesMessage', 'Loading featured heritage sites...', 'info');

  try {
    const { data, error } = await HeritageQueries.listActive();

    if (error) {
      logAppError('Could not load featured heritage sites.', error);
      showAppMessage('featuredSitesMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
      return;
    }

    await renderHeritageCards('featuredSitesList', (data || []).slice(0, 3), 'No active heritage sites are available yet.');
    showAppMessage('featuredSitesMessage', 'Featured heritage sites loaded successfully.', 'success');
  } catch (error) {
    logAppError('Could not load featured heritage sites.', error);
    showAppMessage('featuredSitesMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
  }
}

let browseRequestSequence = 0;
async function loadBrowseSites(searchTerm) {
  const requestId = ++browseRequestSequence;
  const button = document.querySelector('#browseSearchForm button[type="submit"]');
  const results = document.getElementById('heritageList');
  setSubmitLoading(button, true, 'Searching...', 'Search');
  if (results) results.setAttribute('aria-busy', 'true');
  showAppMessage('browseMessage', searchTerm ? 'Searching heritage sites and community stories...' : 'Loading heritage sites...', 'info');
  try {
    const { sites, stories, error } = await loadBrowseResults(searchTerm);
    // A slow older response must not overwrite a newer search or Clear action.
    if (requestId !== browseRequestSequence) return;
    if (error) throw error;
    const normalizedTerm = normalizeSearchText(searchTerm);
    const matchedSites = filterSitesBySearch(sites, normalizedTerm);
    await renderHeritageCards('heritageList', matchedSites, searchTerm ? APP_MESSAGES.noSearchResults : 'No active heritage sites are available yet.');
    renderPublishedStoryCards(stories, normalizedTerm);
    const count = matchedSites.length + (normalizedTerm ? stories.length : 0);
    showAppMessage('browseMessage', normalizedTerm
      ? `${count} result${count === 1 ? '' : 's'} for "${searchTerm}". Use Clear to browse all heritage sites.`
      : `${matchedSites.length} active heritage site${matchedSites.length === 1 ? '' : 's'} available.`, count ? 'success' : 'info');
  } catch (error) {
    if (requestId !== browseRequestSequence) return;
    logAppError('Could not load public search results.', error);
    showAppMessage('browseMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
  } finally {
    if (requestId === browseRequestSequence) {
      setSubmitLoading(button, false, '', 'Search');
      if (results) results.removeAttribute('aria-busy');
    }
  }
}

/* ---------------------------------------------------------------------------
 * Event handling
 * ------------------------------------------------------------------------ */

function setupBrowseSearch() {
  const searchForm = document.getElementById('browseSearchForm');
  const searchInput = document.getElementById('browseSearchInput');
  const clearButton = document.getElementById('clearSearchButton');
  const initialQuery = getQueryParam('q') || '';

  if (searchInput) {
    searchInput.value = initialQuery;
  }

  loadBrowseSites(initialQuery);

  if (searchForm) {
    searchForm.addEventListener('submit', function (event) {
      event.preventDefault();
      loadBrowseSites(searchInput ? searchInput.value.trim() : '');
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', function () {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }

      loadBrowseSites('');
    });
  }
}

updatePublicNavigation();

if (document.body.dataset.page === 'home') {
  loadFeaturedSites();
}

if (document.body.dataset.page === 'browse') {
  setupBrowseSearch();
}
