// Read-only story tables: the contributor's own submissions, and the
// administrator list filtered by status.
//
// Ownership and visibility are not decided here. A contributor's list is
// scoped by contributor_id and by RLS; the administrator list is only
// readable at all under the administrator policy.

/* ---------------------------------------------------------------------------
 * Contributor: my submissions
 * ------------------------------------------------------------------------ */

function createMySubmissionAction(story) {
  if (story.status !== STORY_STATUSES.published) {
    return trustedHtml('<button class="btn btn-sm btn-outline-secondary" type="button" disabled>Pending Review</button>');
  }

  return html`<a class="btn btn-sm btn-outline-success" href="../story.html?id=${encodeURIComponent(story.id)}">View</a>`;
}

function createMySubmissionRow(story) {
  const isPublished = story.status === STORY_STATUSES.published;
  const heritageName = story.heritage_sites ? story.heritage_sites.name : 'Heritage site unavailable';
  const classification = isPublished
    ? story.classification || 'Not classified'
    : '';

  return html`
    <tr>
      <td>${story.title}</td>
      <td>${heritageName}</td>
      <td>${formatDate(story.created_at)}</td>
      <td>${createStatusBadge(story.status)}</td>
      <td>${classification ? createClassificationBadge(classification) : ''}</td>
      <td>${createMySubmissionAction(story)}</td>
    </tr>
  `;
}

function renderMySubmissionsTable(stories) {
  const tableBody = document.getElementById('mySubmissionsTableBody');

  if (!tableBody) {
    return;
  }

  if (!stories.length) {
    setSafeHtml(tableBody, trustedHtml('<tr><td colspan="6" class="text-muted">You have not submitted any stories yet.</td></tr>'));
    return;
  }

  setSafeHtml(tableBody, stories.map(createMySubmissionRow));
}

async function loadMySubmissionsPage() {
  showAppMessage('mySubmissionsMessage', 'Loading your submissions...', 'info');

  const profile = await requireContributor();

  if (!profile) {
    return;
  }

  const { data, error } = await StoryQueries.listByContributor(profile.id);

  if (error) {
    logAppError('Could not load contributor submissions.', error);
    showAppMessage('mySubmissionsMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return;
  }

  renderMySubmissionsTable(data || []);
  showAppMessage('mySubmissionsMessage', 'Your submissions loaded successfully.', 'success');
}

/* ---------------------------------------------------------------------------
 * Administrator: story list by status
 * ------------------------------------------------------------------------ */

const ADMIN_STORY_VIEWS = {
  submitted: {
    heading: 'Pending Stories',
    description: 'Review contributor stories before publication.',
    empty: 'No pending submissions right now.'
  },
  published: {
    heading: 'Published Stories',
    description: 'View published story details and classifications.',
    empty: 'No published stories yet.'
  },
  rejected: {
    heading: 'Rejected Stories',
    description: 'View rejected submissions and their review information.',
    empty: 'No rejected stories yet.'
  }
};

// Falls back to the pending view for any status not in the shared list.
function getAdminStoryStatus() {
  const status = getQueryParam('status');
  return STORY_STATUS_VALUES.includes(status) ? status : STORY_STATUSES.submitted;
}

function updateAdminStoryStatusView(status) {
  const view = ADMIN_STORY_VIEWS[status];

  setText('adminStoriesHeading', view.heading);
  setText('adminStoriesDescription', view.description);

  document.querySelectorAll('[data-story-status-tab]').forEach(function (tab) {
    const isActive = tab.dataset.storyStatusTab === status;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function createAdminStoryAction(story) {
  const detailsUrl = `review-story.html?id=${encodeURIComponent(story.id)}`;

  if (story.status === STORY_STATUSES.submitted) {
    return html`<a class="btn btn-sm btn-outline-success" href="${detailsUrl}">Review</a>`;
  }

  if (story.status === STORY_STATUSES.published) {
    const publicStoryUrl = `../story.html?id=${encodeURIComponent(story.id)}`;
    return html`
      <div class="d-flex flex-wrap gap-2">
        <a class="btn btn-sm btn-outline-success" href="${publicStoryUrl}">View Story</a>
        <a class="btn btn-sm btn-outline-secondary" href="${detailsUrl}">Details</a>
      </div>
    `;
  }

  return html`<a class="btn btn-sm btn-outline-secondary" href="${detailsUrl}">View Details</a>`;
}

function createAdminStoryRow(story) {
  const heritageName = story.heritage_sites ? story.heritage_sites.name : 'Heritage site unavailable';
  const classificationBadge = createClassificationBadge(story.classification || story.suggested_classification);
  const notClassified = trustedHtml('<span class="text-muted">Not classified</span>');

  return html`
    <tr>
      <td>${story.title}</td>
      <td>${heritageName}</td>
      <td>${story.contributor_display_name || 'Community Contributor'}</td>
      <td>${formatDate(story.created_at)}</td>
      <td>${classificationBadge || notClassified}</td>
      <td>${createStatusBadge(story.status)}</td>
      <td>${createAdminStoryAction(story)}</td>
    </tr>
  `;
}

function renderAdminSubmissionsTable(stories, status) {
  const tableBody = document.getElementById('adminSubmissionsTableBody');

  if (!tableBody) {
    return;
  }

  if (!stories.length) {
    setSafeHtml(tableBody, html`<tr><td colspan="7" class="text-muted">${ADMIN_STORY_VIEWS[status].empty}</td></tr>`);
    return;
  }

  setSafeHtml(tableBody, stories.map(createAdminStoryRow));
}

async function loadAdminSubmissionsPage() {
  const status = getAdminStoryStatus();
  updateAdminStoryStatusView(status);
  showAppMessage('adminSubmissionsMessage', 'Loading administrator story records...', 'info');

  const adminProfile = await requireAdmin();

  if (!adminProfile) {
    return;
  }

  const { data, error } = await StoryQueries.listByStatus(status);

  if (error) {
    logAppError('Could not load administrator story records.', error);
    showAppMessage('adminSubmissionsMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return;
  }

  renderAdminSubmissionsTable(data || [], status);
  showAppMessage('adminSubmissionsMessage', 'Administrator story records loaded successfully.', 'success');
}

/* ---------------------------------------------------------------------------
 * Page entry
 * ------------------------------------------------------------------------ */

if (document.body.dataset.page === 'my-submissions') {
  loadMySubmissionsPage();
}

if (document.body.dataset.page === 'admin-submissions') {
  loadAdminSubmissionsPage();
}
