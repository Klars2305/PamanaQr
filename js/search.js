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

  const { signedUrl, error } = await createSignedImageUrl(imagePath, 3600);

  if (error) {
    logAppError('Could not load public heritage card image.', error);
    return;
  }

  imageElement.src = safeImageUrl(signedUrl);
  imageElement.alt = altText;
  imageElement.classList.remove('d-none');
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

  document.querySelectorAll(`#${containerId} [data-card-image]`).forEach(function (image) {
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

async function updatePublicNavigation() {
  if (typeof getCurrentUserProfile !== 'function') {
    return;
  }

  const profile = await getCurrentUserProfile();

  if (!profile) {
    return;
  }

  const isAdmin = profile.role === PAMANA_ROLES.admin;
  const dashboardUrl = isAdmin
    ? 'admin/dashboard.html'
    : 'contributor/dashboard.html';

  document.querySelectorAll('[data-public-account-link]').forEach(function (link) {
    link.classList.add('d-none');
  });

  document.querySelectorAll('[data-dashboard-nav]').forEach(function (item) {
    item.classList.remove('d-none');
  });

  document.querySelectorAll('[data-dashboard-link]').forEach(function (link) {
    link.href = dashboardUrl;
    link.textContent = isAdmin ? 'Admin Dashboard' : 'Contributor Dashboard';
    link.classList.remove('d-none');
  });
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

  const { data, error } = await HeritageQueries.listActive();

  if (error) {
    logAppError('Could not load featured heritage sites.', error);
    showAppMessage('featuredSitesMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return;
  }

  await renderHeritageCards('featuredSitesList', data.slice(0, 3), 'No active heritage sites are available yet.');
  showAppMessage('featuredSitesMessage', 'Featured heritage sites loaded successfully.', 'success');
}

async function loadBrowseSites(searchTerm) {
  showAppMessage('browseMessage', searchTerm ? 'Searching heritage sites and community stories...' : 'Loading heritage sites...', 'info');

  const { sites, stories, error } = await loadBrowseResults(searchTerm);

  if (error) {
    logAppError('Could not load public search results.', error);
    showAppMessage('browseMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return;
  }

  const normalizedTerm = normalizeSearchText(searchTerm);

  await renderHeritageCards(
    'heritageList',
    filterSitesBySearch(sites, normalizedTerm),
    searchTerm ? APP_MESSAGES.noSearchResults : 'No active heritage sites are available yet.'
  );
  renderPublishedStoryCards(stories, normalizedTerm);
  showAppMessage('browseMessage', searchTerm ? `Showing results for "${searchTerm}".` : 'Active heritage sites loaded successfully.', 'success');
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
      loadBrowseSites(searchInput.value.trim());
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', function () {
      searchInput.value = '';
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
