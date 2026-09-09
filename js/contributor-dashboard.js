async function getContributorStoryCounts(contributorId) {
  if (!getSupabaseClient() || !contributorId) {
    return createErrorResult(APP_MESSAGES.unauthorizedSubmission);
  }

  return StoryQueries.listStatusesByContributor(contributorId);
}

function countStoriesByStatus(stories) {
  const counts = {};

  STORY_STATUS_VALUES.forEach(function (status) {
    counts[status] = 0;
  });

  stories.forEach(function (story) {
    if (Object.prototype.hasOwnProperty.call(counts, story.status)) {
      counts[story.status] += 1;
    }
  });

  return counts;
}

async function loadContributorDashboard() {
  showAppMessage('dashboardMessage', 'Loading your dashboard...', 'info');

  try {
    const profile = await requireContributor();

    if (!profile) {
      return;
    }

    const { data, error } = await getContributorStoryCounts(profile.id);

    if (error) {
      logAppError('Could not load contributor dashboard.', error);
      showAppMessage('dashboardMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
      return;
    }

    const counts = countStoriesByStatus(data || []);

    setCount('submittedCount', counts.submitted);
    setCount('publishedCount', counts.published);
    setCount('rejectedCount', counts.rejected);
    showAppMessage('dashboardMessage', 'Dashboard loaded successfully.', 'success');
  } catch (error) {
    logAppError('Could not load contributor dashboard.', error);
    showAppMessage('dashboardMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
  }
}

if (document.body.dataset.page === 'contributor-dashboard') {
  loadContributorDashboard();
}
