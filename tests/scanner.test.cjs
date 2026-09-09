const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/scanner.js'), 'utf8');

function element() {
  return {
    disabled: false,
    value: '',
    files: [],
    className: '',
    textContent: '',
    addEventListener() {}
  };
}

function harness(options = {}) {
  const elements = {
    scannerVideo: element(),
    startCameraButton: element(),
    stopCameraButton: element(),
    qrImageInput: element(),
    scannerMessage: element()
  };
  const navigations = [];
  const warnings = [];
  const context = vm.createContext({
    URL,
    DOMException,
    console: { error() {}, warn() {} },
    navigator: options.navigator || { mediaDevices: { getUserMedia() {} } },
    document: {
      hidden: false,
      getElementById(id) { return elements[id]; },
      addEventListener() {}
    },
    window: {
      isSecureContext: options.secure !== false,
      location: { assign(url) { navigations.push(url); } },
      setTimeout(callback) { callback(); return 1; },
      addEventListener() {}
    },
    PAMANA_CONFIG: { productionBaseUrl: options.productionBaseUrl || '' },
    getAppBasePath() { return options.baseUrl || 'http://localhost/pamana/'; },
    async showSystemWarning(title, message) { warnings.push({ title, message }); }
  });
  vm.runInContext(source, context, { filename: 'scanner.js' });
  return {
    elements,
    navigations,
    warnings,
    run(code) { return vm.runInContext(code, context); },
    installScanner(scannerClass) {
      context.MockQrScanner = scannerClass;
      vm.runInContext('loadQrScanner = async function () { return MockQrScanner; }', context);
    }
  };
}

test('TC-QR-001 validates and opens the matching local or production heritage page', async () => {
  const h = harness({ productionBaseUrl: 'https://pamana-domain.vercel.app/' });
  assert.equal(h.run("getValidatedHeritageUrl('heritage.html?site=fort-santiago')"), 'http://localhost/pamana/heritage.html?site=fort-santiago');
  assert.equal(h.run("getValidatedHeritageUrl('https://pamana-domain.vercel.app/heritage.html?site=fort-santiago')"), 'https://pamana-domain.vercel.app/heritage.html?site=fort-santiago');
  await h.run("processDecodedValue('heritage.html?site=fort-santiago')");
  assert.deepEqual(h.navigations, ['http://localhost/pamana/heritage.html?site=fort-santiago']);
});

test('TC-QR-002 rejects unrelated URLs and plain text with the required message', async () => {
  const h = harness();
  await h.run("processDecodedValue('https://example.com/heritage.html?site=fort-santiago')");
  await h.run("processDecodedValue('plain text')");
  assert.deepEqual(h.navigations, []);
  assert.equal(h.elements.scannerMessage.textContent, 'This QR code is not a valid Pamana heritage QR code.');
  assert.equal(h.warnings.length, 2);
});

test('TC-QR-003 permission denial remains recoverable and offers image upload', async () => {
  class DeniedScanner {
    static async hasCamera() { return true; }
    async start() { throw new DOMException('Denied', 'NotAllowedError'); }
    stop() {}
  }
  const h = harness();
  h.installScanner(DeniedScanner);
  await h.run('startCamera()');
  assert.match(h.elements.scannerMessage.textContent, /permission was denied/i);
  assert.match(h.elements.scannerMessage.textContent, /upload a QR image/i);
  assert.equal(h.elements.startCameraButton.disabled, false);
  assert.equal(h.elements.qrImageInput.disabled, false);
});

test('TC-QR-004 valid uploaded image result opens the correct heritage page', async () => {
  class UploadScanner {
    static async scanImage() { return { data: 'heritage.html?site=fort-santiago' }; }
  }
  const h = harness();
  h.installScanner(UploadScanner);
  await h.run("scanUploadedImage({type:'image/png',size:1024})");
  assert.deepEqual(h.navigations, ['http://localhost/pamana/heritage.html?site=fort-santiago']);
});

test('TC-QR-005 duplicate detections trigger only one navigation', async () => {
  const h = harness();
  await Promise.all([
    h.run("processDecodedValue('heritage.html?site=fort-santiago')"),
    h.run("processDecodedValue('heritage.html?site=fort-santiago')")
  ]);
  assert.equal(h.navigations.length, 1);
});

test('camera starts, stops, and reports insecure or busy states', async () => {
  class WorkingScanner {
    static instances = [];
    static async hasCamera() { return true; }
    constructor() { this.stops = 0; WorkingScanner.instances.push(this); }
    async start() {}
    stop() { this.stops += 1; }
  }
  const h = harness();
  h.installScanner(WorkingScanner);
  await h.run('startCamera()');
  assert.equal(h.elements.stopCameraButton.disabled, false);
  h.run('stopCamera(true)');
  assert.equal(WorkingScanner.instances[0].stops, 1);
  assert.equal(h.elements.startCameraButton.disabled, false);

  const insecure = harness({ secure: false });
  await insecure.run('startCamera()');
  assert.match(insecure.elements.scannerMessage.textContent, /requires HTTPS/i);
  assert.match(h.run("getCameraErrorMessage(new DOMException('Busy','NotReadableError'))"), /already be in use/i);
});

test('scanner page provides responsive structure, navigation, and Back destination', () => {
  const html = fs.readFileSync(path.join(root, 'scan.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  assert.match(html, /name="viewport"/);
  assert.match(html, /class="active" href="scan\.html"/);
  assert.match(html, /class="btn btn-link scan-back-link" href="index\.html"/);
  assert.match(html, /d-grid d-sm-flex/);
  assert.match(css, /\.scan-shell[\s\S]*width:\s*min\(100%, 680px\)/);
  assert.match(css, /@media \(min-width: 576px\)[\s\S]*\.scanner-preview/);
});
