async function loadAdminDashboard() {
  showAppMessage('adminDashboardMessage', 'Loading administrator dashboard...', 'info');

  const profile = await requireAdmin();

  if (!profile) {
    return;
  }

  const [
    activeSites,
    archivedSites,
    submittedStories,
    publishedStories,
    rejectedStories,
    contributors
  ] = await Promise.all([
    HeritageQueries.countByStatus(SITE_STATUSES.active),
    HeritageQueries.countByStatus(SITE_STATUSES.archived),
    StoryQueries.countByStatus(STORY_STATUSES.submitted),
    StoryQueries.countByStatus(STORY_STATUSES.published),
    StoryQueries.countByStatus(STORY_STATUSES.rejected),
    ProfileQueries.countByRole(PAMANA_ROLES.contributor)
  ]);

  const results = [
    activeSites,
    archivedSites,
    submittedStories,
    publishedStories,
    rejectedStories,
    contributors
  ];

  const failedResult = results.find(function (result) {
    return result.error;
  });

  if (failedResult) {
    logAppError('Could not load administrator dashboard.', failedResult.error);
    showAppMessage('adminDashboardMessage', getAppErrorMessage(failedResult.error, APP_MESSAGES.databaseFailed), 'danger');
    return;
  }

  setCount('activeSitesCount', activeSites.count || 0);
  setCount('archivedSitesCount', archivedSites.count || 0);
  setCount('submittedStoriesCount', submittedStories.count || 0);
  setCount('publishedStoriesCount', publishedStories.count || 0);
  setCount('rejectedStoriesCount', rejectedStories.count || 0);
  setCount('contributorsCount', contributors.count || 0);

  showAppMessage('adminDashboardMessage', 'Administrator dashboard loaded successfully.', 'success');
}

if (document.body.dataset.page === 'admin-dashboard') {
  loadAdminDashboard();
}
