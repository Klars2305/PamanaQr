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

// Scoped to the table body just rendered. A document-wide query re-bound every
// matching button on the page each time the table reloaded.
function bindHeritageSiteRowActions(tableBody) {
  tableBody.querySelectorAll('[data-status-toggle]').forEach(function (button) {
    button.addEventListener('click', handleHeritageStatusToggle);
  });

  tableBody.querySelectorAll('[data-qr-slug]').forEach(function (button) {
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
    setSafeHtml(tableBody, trustedHtml('<tr><td colspan="5"><p class="text-muted">No heritage sites have been added yet.</p><a class="btn btn-outline-success" href="heritage-form.html">Add the first heritage site</a></td></tr>'));
    return;
  }

  setSafeHtml(tableBody, sites.map(createHeritageSiteRow));
  bindHeritageSiteRowActions(tableBody);
}

/* ---------------------------------------------------------------------------
 * Data loading
 * ------------------------------------------------------------------------ */

async function loadAdminHeritageSites() {
  showAppMessage('heritageManagementMessage', 'Loading heritage sites...', 'info');

  try {
    const adminProfile = await requireAdmin();

    if (!adminProfile) {
      return false;
    }

    const { data, error } = await HeritageQueries.listAll();

    if (error) {
      logAppError('Could not load heritage sites.', error);
      showAppMessage('heritageManagementMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
      return false;
    }

    renderHeritageSitesTable(data || []);
    showAppMessage('heritageManagementMessage', 'Heritage sites loaded successfully.', 'success');
    return true;
  } catch (error) {
    logAppError('Could not load heritage sites.', error);
    showAppMessage('heritageManagementMessage', getAppErrorMessage(error, APP_MESSAGES.databaseFailed), 'danger');
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * Event handling
 * ------------------------------------------------------------------------ */

async function handleHeritageStatusToggle(event) {
  const button = event.currentTarget;
  const siteId = button.dataset.siteId;
  const name = button.dataset.siteName;
  const status = button.dataset.nextStatus;
  if (!SITE_STATUS_VALUES.includes(status) || !claimButtonAction(button)) return;
  const archive = status === SITE_STATUSES.archived;
  const label = archive ? 'Archive' : 'Activate';
  try {
    await showConfirmationModal({
      title: archive ? 'Archive Heritage Site?' : 'Activate Heritage Site?',
      message: archive
        ? `"${name}" will no longer appear publicly as an active heritage site, but its record will remain stored.`
        : `"${name}" will become available in public heritage browsing.`,
      confirmText: label,
      cancelText: archive ? 'Keep Active' : 'Keep Archived',
      variant: archive ? 'warning' : 'success',
      trigger: button,
      onConfirm: async function () {
        setSubmitLoading(button, true, archive ? 'Archiving...' : 'Activating...', label);
        if (!await requireAdmin()) return;
        showAppMessage('heritageManagementMessage', `Updating ${name}...`, 'info');
        const { error } = await HeritageQueries.setStatus(siteId, status);
        if (error) throw error;
        const loaded = await loadAdminHeritageSites();
        if (loaded) showAppMessage('heritageManagementMessage', archive ? 'Heritage site archived. Its record is still stored.' : 'Heritage site activated.', 'success');
        else showAppMessage('heritageManagementMessage', 'The status was saved, but the list could not reload. Refresh the page before making another change.', 'warning');
      }
    });
  } catch (error) {
    logAppError('Could not update heritage status.', error);
    showAppMessage('heritageManagementMessage', getAppErrorMessage(error, APP_MESSAGES.saveFailed), 'danger');
    await showSystemErrorFor(error, 'Failed to save', APP_MESSAGES.saveFailed);
  } finally {
    setSubmitLoading(button, false, '', label);
  }
}

if (document.body.dataset.page === 'heritage-sites-admin') {
  loadAdminHeritageSites();
}
