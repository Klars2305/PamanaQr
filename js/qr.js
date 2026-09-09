let currentQrDetails = {
  slug: '',
  siteName: '',
  url: ''
};

function getQrBaseUrl() {
  if (PAMANA_CONFIG.productionBaseUrl) {
    return PAMANA_CONFIG.productionBaseUrl;
  }

  return getAppBasePath();
}

function getHeritagePublicUrl(slug) {
  return new URL(`heritage.html?site=${encodeURIComponent(slug)}`, getQrBaseUrl()).href;
}

function renderQrCode(url) {
  const qrCodeBox = document.getElementById('qrCodeBox');

  if (!qrCodeBox || !window.QRCode) {
    logAppError('QR code library is not available.', createAppError(APP_MESSAGES.qrUnavailable));
    showAppMessage('heritageManagementMessage', APP_MESSAGES.qrUnavailable, 'danger');
    return;
  }

  qrCodeBox.innerHTML = '';

  new QRCode(qrCodeBox, {
    text: url,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M
  });
}

function showHeritageQrCode(slug, siteName) {
  const qrCodeBox = document.getElementById('qrCodeBox');
  const qrCodeUrl = document.getElementById('qrCodeUrl');
  const qrModalTitle = document.getElementById('qrModalTitle');

  if (!qrCodeBox) {
    logAppError('QR code container is missing.', createAppError(APP_MESSAGES.qrUnavailable));
    showAppMessage('heritageManagementMessage', APP_MESSAGES.qrUnavailable, 'danger');
    return;
  }

  const publicUrl = getHeritagePublicUrl(slug);
  currentQrDetails = {
    slug: slug,
    siteName: siteName,
    url: publicUrl
  };

  renderQrCode(publicUrl);

  if (qrCodeUrl) {
    qrCodeUrl.textContent = publicUrl;
  }

  if (qrModalTitle) {
    qrModalTitle.textContent = `QR Code: ${siteName}`;
  }

  const qrModal = new bootstrap.Modal(document.getElementById('qrModal'));
  qrModal.show();
}

function regenerateCurrentQrCode() {
  if (!currentQrDetails.slug) {
    return;
  }

  currentQrDetails.url = getHeritagePublicUrl(currentQrDetails.slug);
  renderQrCode(currentQrDetails.url);

  const qrCodeUrl = document.getElementById('qrCodeUrl');

  if (qrCodeUrl) {
    qrCodeUrl.textContent = currentQrDetails.url;
  }
}

const QR_PRINT_STYLES = 'body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }'
  + ' img, canvas { width: 260px; height: 260px; }'
  + ' p { overflow-wrap: anywhere; }';

// Built with DOM APIs rather than document.write. The site name is admin-entered
// text, so it goes in as textContent and the QR node is imported as a node,
// never as markup.
function buildQrPrintDocument(printDocument, qrCodeBox) {
  const style = printDocument.createElement('style');
  style.textContent = QR_PRINT_STYLES;
  printDocument.head.appendChild(style);

  printDocument.title = `${currentQrDetails.siteName} QR Code`;

  const heading = printDocument.createElement('h1');
  heading.textContent = currentQrDetails.siteName;
  printDocument.body.appendChild(heading);

  Array.prototype.forEach.call(qrCodeBox.childNodes, function (node) {
    printDocument.body.appendChild(printDocument.importNode(node, true));
  });

  const urlLine = printDocument.createElement('p');
  urlLine.textContent = currentQrDetails.url;
  printDocument.body.appendChild(urlLine);
}

function printCurrentQrCode() {
  const qrCodeBox = document.getElementById('qrCodeBox');

  if (!qrCodeBox || !currentQrDetails.url) {
    return;
  }

  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    showAppMessage('heritageManagementMessage', APP_MESSAGES.popupBlocked, 'warning');
    return;
  }

  buildQrPrintDocument(printWindow.document, qrCodeBox);
  printWindow.focus();
  printWindow.print();
}

function saveCurrentQrCode() {
  const qrImage = document.querySelector('#qrCodeBox img');
  const qrCanvas = document.querySelector('#qrCodeBox canvas');

  if (!currentQrDetails.slug || (!qrImage && !qrCanvas)) {
    showAppMessage('heritageManagementMessage', APP_MESSAGES.qrNotReady, 'warning');
    return;
  }

  const link = document.createElement('a');
  link.href = qrImage ? qrImage.src : qrCanvas.toDataURL('image/png');
  link.download = `${currentQrDetails.slug}-qr-code.png`;
  link.click();
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
