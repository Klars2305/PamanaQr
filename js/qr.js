let currentQrDetails = {
  slug: '',
  siteName: '',
  url: ''
};

function getQrBaseUrl() {
  return getConfiguredQrBaseUrl() || getAppBasePath();
}

// With no production URL configured the QR code encodes whatever host the
// browser is on. That produces a code that scans to a local address and
// resolves for nobody once it is printed, so say so at generation time
// instead of leaving it to the README.
const LOCAL_QR_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0', '::1', ''];

function isQrBaseUrlPublishable() {
  return Boolean(getConfiguredQrBaseUrl());
}

function getConfiguredQrBaseUrl() {
  const configuredUrl = String(PAMANA_CONFIG.productionBaseUrl || '').trim();
  if (!configuredUrl) return '';
  try {
    const base = new URL(configuredUrl);
    if (base.protocol !== 'https:') return '';

    const hostname = base.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (LOCAL_QR_HOSTNAMES.includes(hostname) || hostname.endsWith('.local')) return '';
    base.search = '';
    base.hash = '';
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    return base.href;
  } catch (_) {
    return '';
  }
}

function getQrBaseUrlWarning() {
  if (isQrBaseUrlPublishable()) {
    return '';
  }

  return 'Set a permanent HTTPS productionBaseUrl in js/config.js before saving, printing, or sharing this QR code.';
}

function getHeritagePublicUrl(slug) {
  return new URL(`heritage.html?site=${encodeURIComponent(slug)}`, getQrBaseUrl()).href;
}

let lastQrTrigger = null;
function setQrReady(ready) {
  const exportReady = ready && isQrBaseUrlPublishable();
  ['saveQrButton', 'printQrButton'].forEach(function (id) {
    const button = document.getElementById(id);
    if (button) button.disabled = !exportReady;
  });
}
function renderQrCode(url) {
  const box = document.getElementById('qrCodeBox');
  setQrReady(false);
  if (!box || !window.QRCode) {
    showAppMessage('qrMessage', APP_MESSAGES.qrUnavailable, 'danger');
    return false;
  }
  showAppMessage('qrMessage', 'Generating QR code...', 'info');
  try {
    box.innerHTML = '';
    // Keep the original payload, dimensions and error-correction level.
    new QRCode(box, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    setQrReady(true);
    return true;
  } catch (error) {
    logAppError('QR rendering failed.', error);
    showAppMessage('qrMessage', 'The QR code could not be generated. Please try again.', 'danger');
    return false;
  }
}
function updateQrAddress(url) {
  const text = document.getElementById('qrCodeUrl');
  if (text) text.textContent = url;
  let link = document.getElementById('qrOpenPublicLink');
  if (!link && text) {
    link = document.createElement('a');
    link.id = 'qrOpenPublicLink';
    link.className = 'btn btn-link';
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = 'Open public heritage page';
    text.insertAdjacentElement('afterend', link);
  }
  if (link) link.href = url;
}
// Feedback about a QR code that is already on screen stays inside the QR modal
// itself. Only failures raised before that modal opens are reported through the
// shared notification dialog, so a second dialog is never stacked over the QR.
function showHeritageQrCode(slug, siteName) {
  const box = document.getElementById('qrCodeBox');
  const modal = document.getElementById('qrModal');
  if (!box || !modal || !window.bootstrap || !window.bootstrap.Modal) {
    showAppMessage('heritageManagementMessage', APP_MESSAGES.qrUnavailable, 'danger');
    showSystemError('QR code unavailable', APP_MESSAGES.qrUnavailable);
    return;
  }
  try {
    const publicUrl = getHeritagePublicUrl(slug);
    currentQrDetails = { slug, siteName, url: publicUrl };
    lastQrTrigger = document.activeElement;
    setText('qrModalTitle', `QR Code: ${siteName}`);
    updateQrAddress(publicUrl);
    bootstrap.Modal.getOrCreateInstance(modal).show();
    if (!renderQrCode(publicUrl)) return;
    const warning = getQrBaseUrlWarning();
    showAppMessage('qrMessage', warning || 'QR code ready. Check the public address before saving or printing.', warning ? 'warning' : 'success');
  } catch (error) {
    logAppError('QR preparation failed.', error);
    showAppMessage('heritageManagementMessage', 'Check the configured public website address before generating a QR code.', 'danger');
  }
}
function regenerateCurrentQrCode() {
  if (!currentQrDetails.slug) return;
  const button = document.getElementById('regenerateQrButton');
  if (!claimButtonAction(button)) return;
  try {
    setSubmitLoading(button, true, 'Generating...', 'Regenerate');
    currentQrDetails.url = getHeritagePublicUrl(currentQrDetails.slug);
    updateQrAddress(currentQrDetails.url);
    if (!renderQrCode(currentQrDetails.url)) return;
    const warning = getQrBaseUrlWarning();
    showAppMessage('qrMessage', warning || 'QR code regenerated.', warning ? 'warning' : 'success');
  } catch (error) {
    showAppMessage('qrMessage', getAppErrorMessage(error, APP_MESSAGES.qrUnavailable), 'danger');
  } finally { setSubmitLoading(button, false, '', 'Regenerate'); }
}

const QR_PRINT_STYLES = 'body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }'
  + ' img, canvas { width: 260px; height: 260px; }'
  + ' p { overflow-wrap: anywhere; }';

// Built with DOM APIs rather than document.write. The site name is admin-entered
// text, so it goes in as textContent and the QR node is imported as a node,
// never as markup.
function getQrImageDataUrl() {
  const canvas = document.querySelector('#qrCodeBox canvas');
  const image = document.querySelector('#qrCodeBox img');
  return canvas ? canvas.toDataURL('image/png') : image && image.getAttribute('src') || '';
}
function buildQrPrintDocument(printDocument) {
  const style = printDocument.createElement('style');
  style.textContent = QR_PRINT_STYLES;
  printDocument.head.appendChild(style);
  printDocument.title = `${currentQrDetails.siteName} QR Code`;
  const heading = printDocument.createElement('h1');
  heading.textContent = currentQrDetails.siteName;
  const image = printDocument.createElement('img');
  image.alt = `QR code for ${currentQrDetails.siteName}`;
  // Cloning a canvas node loses its bitmap. Use the existing generated pixels.
  image.src = getQrImageDataUrl();
  const url = printDocument.createElement('p');
  url.textContent = currentQrDetails.url;
  printDocument.body.append(heading, image, url);
  return image;
}
function printCurrentQrCode() {
  if (!isQrBaseUrlPublishable()) {
    showAppMessage('qrMessage', getQrBaseUrlWarning(), 'warning'); return;
  }
  if (!currentQrDetails.url || !getQrImageDataUrl()) {
    showAppMessage('qrMessage', APP_MESSAGES.qrNotReady, 'warning'); return;
  }
  const popup = window.open('', '_blank');
  if (!popup) { showAppMessage('qrMessage', APP_MESSAGES.popupBlocked, 'warning'); return; }
  popup.opener = null;
  try {
    const image = buildQrPrintDocument(popup.document);
    const print = function () { if (!popup.closed) { popup.focus(); popup.print(); } };
    if (image.complete) print(); else image.addEventListener('load', print, { once: true });
    showAppMessage('qrMessage', 'Print preview opened. Check the QR code before printing.', 'info');
  } catch (error) {
    logAppError('QR print preview failed.', error);
    showAppMessage('qrMessage', 'The print preview could not open. Try saving the QR image instead.', 'danger');
  }
}
function saveCurrentQrCode() {
  try {
    if (!isQrBaseUrlPublishable()) {
      showAppMessage('qrMessage', getQrBaseUrlWarning(), 'warning'); return;
    }
    const imageUrl = getQrImageDataUrl();
    if (!currentQrDetails.slug || !imageUrl) {
      showAppMessage('qrMessage', APP_MESSAGES.qrNotReady, 'warning'); return;
    }
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${currentQrDetails.slug}-qr-code.png`;
    link.click();
    showAppMessage('qrMessage', 'QR image download requested. Check your browser downloads.', 'success');
  } catch (error) {
    logAppError('QR image export failed.', error);
    showAppMessage('qrMessage', 'The QR image could not be saved. Regenerate it and try again.', 'danger');
  }
}

const regenerateQrButton = document.getElementById('regenerateQrButton');
const printQrButton = document.getElementById('printQrButton');
const saveQrButton = document.getElementById('saveQrButton');

if (regenerateQrButton) {
  regenerateQrButton.addEventListener('click', regenerateCurrentQrCode);
}

if (printQrButton) {
  printQrButton.addEventListener('click', printCurrentQrCode);
}

if (saveQrButton) {
  saveQrButton.addEventListener('click', saveCurrentQrCode);
}

// Print and Save act on a rendered QR image. They stay disabled until one
// exists, and go back to disabled when the modal closes.
setQrReady(false);

const qrModalElement = document.getElementById('qrModal');
if (qrModalElement) qrModalElement.addEventListener('hidden.bs.modal', function () {
  setQrReady(false);
  currentQrDetails = { slug: '', siteName: '', url: '' };
  const box = document.getElementById('qrCodeBox');
  if (box) box.innerHTML = '';
  if (lastQrTrigger && lastQrTrigger.isConnected) lastQrTrigger.focus();
});
