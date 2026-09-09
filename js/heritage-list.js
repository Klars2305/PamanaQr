// Administrator heritage sites table: status toggle and QR code access.
//
// Archiving and activating only ever move between the two shared site
// statuses. Nothing here deletes a heritage record.

/* ---------------------------------------------------------------------------
 * Rendering
 * ------------------------------------------------------------------------ */

function getNextSiteStatus(status) {
  return status === SITE_STATUSES.active
    ? SITE_STATUSES.archived
    : SITE_STATUSES.active;
}

function createHeritageSiteRow(site) {
  const nextStatus = getNextSiteStatus(site.status);
  const statusLabel = nextStatus === SITE_STATUSES.archived ? 'Archive' : 'Activate';
  const editUrl = `heritage-form.html?id=${encodeURIComponent(site.id)}`;

  return html`
    <tr>
      <td>${site.name}</td>
      <td>${site.location}</td>
      <td>${site.historical_period}</td>
      <td>${createStatusBadge(site.status)}</td>
      <td>
        <div class="d-flex flex-wrap gap-2">
          <a class="btn btn-sm btn-outline-success" href="${editUrl}">Edit</a>
          <button class="btn btn-sm btn-outline-warning" type="button" data-status-toggle data-site-id="${site.id}" data-site-name="${site.name}" data-next-status="${nextStatus}">${statusLabel}</button>
          <button class="btn btn-sm btn-outline-secondary" type="button" data-qr-slug="${site.slug}" data-qr-name="${site.name}">QR Code</button>
        </div>
      </td>
    </tr>
  `;
}

function bindHeritageSiteRowActions() {
  document.querySelectorAll('[data-status-toggle]').forEach(function (button) {
    button.addEventListener('click', handleHeritageStatusToggle);
  });

  document.querySelectorAll('[data-qr-slug]').forEach(function (button) {
    button.addEventListener('click', function () {
      showHeritageQrCode(button.dataset.qrSlug, button.dataset.qrName);
    });
  });
}

function renderHeritageSitesTable(sites) {
  const tableBody = document.getElementById('heritageSitesTableBody');

  if (!tableBody) {
    return;
  }

  if (!sites.length) {
    setSafeHtml(tableBody, trustedHtml('<tr><td colspan="5" class="text-muted">No heritage sites found.</td></tr>'));
    return;
  }

  setSafeHtml(tableBody, sites.map(createHeritageSiteRow));
  bindHeritageSiteRowActions();
}

/* ---------------------------------------------------------------------------
 * Data loading
 * ------------------------------------------------------------------------ */

async function loadAdminHeritageSites() {
  showAppMessage('heritageManagementMessage', 'Loading heritage sites...', 'info');

  const adminProfile = await requireAdmin();

  if (!adminProfile) {
    return;
  }

  const { data, error } = await HeritageQueries.listAll();

  if (error) {
    logAppError('Could not load heritage sites.', error);
    showAppMessage('heritageManagementMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return;
  }

  renderHeritageSitesTable(data || []);
  showAppMessage('heritageManagementMessage', 'Heritage sites loaded successfully.', 'success');
}

/* ---------------------------------------------------------------------------
 * Event handling
 * ------------------------------------------------------------------------ */

async function handleHeritageStatusToggle(event) {
  const button = event.currentTarget;
  const siteId = button.dataset.siteId;
  const siteName = button.dataset.siteName;
  const nextStatus = button.dataset.nextStatus;
  const actionLabel = nextStatus === SITE_STATUSES.archived ? 'archive' : 'activate';

  if (!confirm(`Are you sure you want to ${actionLabel} "${siteName}"?`)) {
    return;
  }

  // Claimed before the first await, so a double click cannot send two status
  // changes for the same site.
  if (!claimButtonAction(button)) {
    return;
  }

  const adminProfile = await requireAdmin();

  if (!adminProfile) {
    showAppMessage('heritageManagementMessage', APP_MESSAGES.unauthorizedAdminAction, 'danger');
    return;
  }

  showAppMessage('heritageManagementMessage', `Updating ${siteName}...`, 'info');

  const { error } = await HeritageQueries.setStatus(siteId, nextStatus);

  if (error) {
    logAppError('Could not update heritage status.', error);
    showAppMessage('heritageManagementMessage', getAppErrorMessage(error, APP_MESSAGES.saveFailed), 'danger');
    releaseButtonAction(button);
    return;
  }

  await loadAdminHeritageSites();
}

if (document.body.dataset.page === 'heritage-sites-admin') {
  loadAdminHeritageSites();
}
