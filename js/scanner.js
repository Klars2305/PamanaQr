const QR_SCANNER_MODULE_URL = 'https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.min.js';
const INVALID_QR_MESSAGE = 'This QR code is not a valid Pamana heritage QR code.';
const MAX_QR_IMAGE_SIZE = 5 * 1024 * 1024;

const scannerVideo = document.getElementById('scannerVideo');
const startCameraButton = document.getElementById('startCameraButton');
const stopCameraButton = document.getElementById('stopCameraButton');
const qrImageInput = document.getElementById('qrImageInput');
const scannerMessage = document.getElementById('scannerMessage');

let qrScannerClassPromise = null;
let cameraScanner = null;
let isScanning = false;
let isProcessing = false;
let navigationPending = false;

function showScannerMessage(message, type) {
  scannerMessage.className = `alert alert-${type || 'info'} scanner-message`;
  scannerMessage.textContent = message;
}

function loadQrScanner() {
  if (!qrScannerClassPromise) {
    qrScannerClassPromise = import(QR_SCANNER_MODULE_URL).then(function (module) {
      return module.default;
    }).catch(function () {
      qrScannerClassPromise = null;
      const error = new Error('QR scanner unavailable');
      error.code = 'QR_SCANNER_UNAVAILABLE';
      throw error;
    });
  }
  return qrScannerClassPromise;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function getApprovedHeritageTargets() {
  const bases = [normalizeBaseUrl(getAppBasePath())];
  const productionBaseUrl = typeof PAMANA_CONFIG !== 'undefined'
    ? PAMANA_CONFIG.productionBaseUrl
    : '';

  if (productionBaseUrl) {
    try {
      const productionBase = normalizeBaseUrl(productionBaseUrl);
      if (!bases.some(function (base) { return base.href === productionBase.href; })) {
        bases.push(productionBase);
      }
    } catch (_) {
      // An invalid optional production URL must never broaden accepted QR URLs.
    }
  }

  return bases.map(function (base) {
    return { base: base, heritageUrl: new URL('heritage.html', base) };
  });
}

function getValidatedHeritageUrl(scannedValue) {
  if (typeof scannedValue !== 'string' || !scannedValue.trim()) return null;

  try {
    const currentBase = normalizeBaseUrl(getAppBasePath());
    const scannedUrl = new URL(scannedValue.trim(), currentBase);
    if (!['http:', 'https:'].includes(scannedUrl.protocol) || scannedUrl.username || scannedUrl.password) return null;

    const approvedTarget = getApprovedHeritageTargets().find(function (target) {
      return scannedUrl.origin === target.heritageUrl.origin
        && scannedUrl.pathname === target.heritageUrl.pathname;
    });
    const siteValues = scannedUrl.searchParams.getAll('site');
    const site = siteValues.length === 1 ? siteValues[0].trim() : '';
    if (!approvedTarget || !site) return null;

    const destination = new URL('heritage.html', approvedTarget.base);
    destination.searchParams.set('site', site);
    return destination.href;
  } catch (_) {
    return null;
  }
}

function updateCameraButtons(active) {
  isScanning = active;
  startCameraButton.disabled = active || isProcessing || navigationPending;
  stopCameraButton.disabled = !active;
}

function stopCamera(showReadyMessage) {
  if (cameraScanner) cameraScanner.stop();
  updateCameraButtons(false);
  if (showReadyMessage) showScannerMessage('Camera stopped. You can start it again or upload a QR image.', 'info');
}

function getCameraErrorMessage(error) {
  if (error && error.code === 'QR_SCANNER_UNAVAILABLE') {
    return 'QR scanning is unavailable in this browser. Check your connection or upload the image again.';
  }
  if (!window.isSecureContext) {
    return 'Camera access requires HTTPS. During development, open Pamana through localhost.';
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return 'This browser does not support camera scanning. Please upload a QR image instead.';
  }

  const name = error && error.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera permission was denied. Allow camera access in your browser settings and retry, or upload a QR image instead.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No usable camera was found. Please upload a QR image instead.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera may already be in use by another app. Close it there, then try again.';
  }
  return 'The camera could not start. Please try again or upload a QR image.';
}

async function reportInvalidQr() {
  showScannerMessage(INVALID_QR_MESSAGE, 'warning');
  if (typeof showSystemWarning === 'function') {
    await showSystemWarning('Invalid QR code', INVALID_QR_MESSAGE, 'Try Again');
  }
}

async function processDecodedValue(value) {
  if (isProcessing || navigationPending) return;
  isProcessing = true;
  qrImageInput.disabled = true;
  stopCamera(false);

  const destination = getValidatedHeritageUrl(value);
  if (!destination) {
    await reportInvalidQr();
    isProcessing = false;
    qrImageInput.disabled = false;
    updateCameraButtons(false);
    return;
  }

  navigationPending = true;
  showScannerMessage('Pamana QR code found. Opening heritage details…', 'success');
  window.setTimeout(function () {
    window.location.assign(destination);
  }, 350);
}

async function startCamera() {
  if (isScanning || isProcessing || navigationPending) return;
  startCameraButton.disabled = true;
  showScannerMessage('Requesting camera access…', 'info');

  try {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new DOMException('Camera unavailable', 'SecurityError');
    }

    const QrScanner = await loadQrScanner();
    if (!await QrScanner.hasCamera()) {
      throw new DOMException('No camera found', 'NotFoundError');
    }

    if (!cameraScanner) {
      cameraScanner = new QrScanner(scannerVideo, function (result) {
        processDecodedValue(result.data);
      }, {
        preferredCamera: 'environment',
        maxScansPerSecond: 10,
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true
      });
    }

    await cameraScanner.start();
    updateCameraButtons(true);
    showScannerMessage('Camera is active. Hold a Pamana QR code inside the frame.', 'success');
  } catch (error) {
    stopCamera(false);
    showScannerMessage(getCameraErrorMessage(error), 'danger');
  }
}

async function scanUploadedImage(file) {
  if (!file || isProcessing || navigationPending) return;
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type) || file.size > MAX_QR_IMAGE_SIZE) {
    showScannerMessage('Please choose a PNG, JPG, or WEBP image under 5 MB.', 'warning');
    return;
  }

  stopCamera(false);
  isProcessing = true;
  qrImageInput.disabled = true;
  startCameraButton.disabled = true;
  showScannerMessage('Reading QR image…', 'info');

  try {
    const QrScanner = await loadQrScanner();
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
    isProcessing = false;
    qrImageInput.disabled = false;
    await processDecodedValue(result.data);
  } catch (error) {
    isProcessing = false;
    qrImageInput.disabled = false;
    updateCameraButtons(false);
    const message = error && error.code === 'QR_SCANNER_UNAVAILABLE'
      ? 'QR scanning is unavailable in this browser. Check your connection and try again.'
      : 'No readable QR code was found in that image. Please try another image.';
    showScannerMessage(message, 'warning');
  }
}

startCameraButton.addEventListener('click', startCamera);
stopCameraButton.addEventListener('click', function () { stopCamera(true); });
qrImageInput.addEventListener('change', function () {
  const file = qrImageInput.files && qrImageInput.files[0];
  scanUploadedImage(file).finally(function () { qrImageInput.value = ''; });
});
window.addEventListener('pagehide', function () { stopCamera(false); });
document.addEventListener('visibilitychange', function () {
  if (document.hidden && isScanning) stopCamera(false);
});
