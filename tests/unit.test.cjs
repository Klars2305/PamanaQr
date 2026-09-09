// Run: node --test tests/unit.test.cjs. No network or live credentials used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { File } = require('node:buffer');
const context = vm.createContext({
  URL, URLSearchParams, crypto: require('node:crypto').webcrypto, File,
  console: { error() {}, warn() {} }, setTimeout, clearTimeout,
  window: { location: { origin: 'https://pamana.test', pathname: '/archive/admin/heritage-sites.html', search: '' } },
  document: { body: { dataset: {} }, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
  PAMANA_CONFIG: { productionBaseUrl: '' }
});
for (const file of ['core', 'storage', 'validation', 'search-matching', 'session', 'story-submit', 'heritage-form', 'story-review', 'heritage-list', 'story-lists', 'contributor-dashboard', 'qr']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), context, { filename: file + '.js' });
}
const run = code => vm.runInContext(code, context);
const json = code => JSON.parse(JSON.stringify(run(code)));
function case_(name, expression, expected) { test(name, () => assert.deepEqual(json(expression), expected)); }
case_('Password: valid example', 'validatePassword("PamanaTest123")', '');
case_('Password: minimum 8', 'validatePassword("Pamana12")', '');
case_('Password: maximum 64', 'validatePassword("Aa1" + "x".repeat(61))', '');
case_('Password: reject 7', 'Boolean(validatePassword("Paman12"))', true);
case_('Password: reject 65 without truncation', 'Boolean(validatePassword("Aa1" + "x".repeat(62)))', true);
case_('Password: reject lowercase only', 'Boolean(validatePassword("pamanaan123"))', true);
case_('Password: reject uppercase only', 'Boolean(validatePassword("PAMANA123"))', true);
case_('Password: reject no number', 'Boolean(validatePassword("PamanaPassword"))', true);
case_('Password: optional symbol is allowed', 'validatePassword("Pamana!123")', '');
case_('Password: spaces are preserved and allowed', 'validatePassword(" Pamana123 ")', '');
case_('Confirmation: mismatch', 'validateConfirmPassword("Pamana123", "Other123")', 'Passwords do not match.');
case_('Confirmation: required', 'validateConfirmPassword("Pamana123", "")', 'Please confirm your password.');
case_('Email: valid with surrounding whitespace', 'validateEmail(" juan+test@example.com ")', '');
case_('Email: incomplete domain', 'validateEmail("juan@")', 'Enter a valid email address.');
case_('Email: internal spaces', 'validateEmail("juan dela@example.com")', 'Enter a valid email address.');
case_('Email: blank', 'validateEmail("  ")', 'Email address is required.');
case_('Story: content required', 'validateStoryContent("")', 'Story content is required.');
case_('Story: 49 too short', 'Boolean(validateStoryContent("a".repeat(49)))', true);
case_('Story: 50 allowed', 'validateStoryContent("a".repeat(50))', '');
case_('Story: 3000 allowed', 'validateStoryContent("a".repeat(3000))', '');
case_('Story: 3001 blocked', 'Boolean(validateStoryContent("a".repeat(3001)))', true);
case_('Story: title 4 blocked', 'Boolean(validateTextLength("Test", "Story title", FORM_LIMITS.storyTitle))', true);
case_('Story: title 5 allowed', 'validateTextLength("Story", "Story title", FORM_LIMITS.storyTitle)', '');
case_('Story: title 101 blocked', 'Boolean(validateTextLength("a".repeat(101), "Story title", FORM_LIMITS.storyTitle))', true);
case_('Story: suggested classification stays optional', 'validateStorySubmission({heritageSiteId:"1",title:"My Story",content:"a".repeat(50),suggestedClassification:"",sourceReference:"",supportingPhoto:null}).suggestedClassification', '');
case_('Story: unsupported classification blocked', 'Boolean(validateStorySubmission({heritageSiteId:"1",title:"My Story",content:"a".repeat(50),suggestedClassification:"Rumor",sourceReference:"",supportingPhoto:null}).suggestedClassification)', true);
case_('Heritage: name min 3', 'validateTextLength("Abc", "Heritage name", FORM_LIMITS.siteName)', '');
case_('Heritage: name 151 blocked', 'Boolean(validateTextLength("a".repeat(151), "Heritage name", FORM_LIMITS.siteName))', true);
case_('Heritage: short description 501 blocked', 'Boolean(validateTextLength("a".repeat(501), "Short description", FORM_LIMITS.shortDescription))', true);
case_('Slug: test record URL stays compatible', 'createSlug("Pamana Test Heritage Plaza")', 'pamana-test-heritage-plaza');
case_('Slug: unsafe punctuation removed', 'createSlug("  Old Town / Plaza! ")', 'old-town-plaza');
case_('Status: unsupported heritage status rejected', 'Boolean(validateAllowedValue("deleted", SITE_STATUS_VALUES, "status"))', true);
case_('Publish: final classification required', 'Boolean(validateReviewDecision({action:"publish",finalClassification:"",reviewNotes:""}).finalClassification)', true);
case_('Reject: reason required', 'Boolean(validateReviewDecision({action:"reject",finalClassification:"",reviewNotes:""}).reviewNotes)', true);
case_('Reject: classification not required', 'validateReviewDecision({action:"reject",finalClassification:"",reviewNotes:"Insufficient supporting context."})', {reviewNotes:''});
case_('Image: existing 5 MiB limit', 'MAX_IMAGE_SIZE_BYTES', 5242880);
case_('Image: valid JPEG metadata', 'validateImageFile({name:"photo.JPG",type:"image/jpeg",size:1024})', '');
case_('Image: limit inclusive', 'validateImageFile({name:"photo.png",type:"image/png",size:5242880})', '');
case_('Image: oversized rejected', 'Boolean(validateImageFile({name:"photo.png",type:"image/png",size:5242881}))', true);
case_('Image: empty rejected', 'Boolean(validateImageFile({name:"photo.png",type:"image/png",size:0}))', true);
case_('Image: wrong MIME rejected', 'Boolean(validateImageFile({name:"photo.jpg",type:"text/plain",size:42}))', true);
case_('Image: wrong extension rejected', 'Boolean(validateImageFile({name:"photo.exe",type:"image/png",size:42}))', true);
case_('Friendly error: invalid credentials', 'getAppErrorMessage({code:"invalid_credentials",message:"AuthApiError"})', 'Incorrect email or password. Please check your details and try again.');
case_('Friendly error: network', 'getAppErrorMessage({message:"Failed to fetch"})', "We couldn't connect to the server. Check your internet connection and try again.");
case_('Friendly error: duplicate not email', 'getAppErrorMessage({code:"23505",message:"duplicate key already exists"})', 'This information already exists. Check the existing record before trying again.');
case_('Friendly error: raw provider detail not exposed', 'getAppErrorMessage({message:"PostgrestError: private.internal.table"},"Please try again.")', 'Please try again.');
case_('Friendly error: rate limit', 'getAppErrorMessage({status:429})', 'Too many attempts. Please wait a few minutes before trying again.');
case_('Friendly error: safe internal validation retained', 'getAppErrorMessage(createAppError("Story content is required."))', 'Story content is required.');
case_('XSS: database text is escaped', 'renderHtmlValue(html`<p>${"<img src=x onerror=alert(1)>"}</p>`)', '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
case_('XSS: unsafe image URL blocked', 'safeImageUrl("javascript:alert(1)")', '');
case_('Search: matching behavior unchanged', 'siteMatchesSearch({name:"Fort Santiago",location:"Manila",historical_period:"Spanish Colonial Period"},normalizeSearchText("  MANILA  "))', true);
case_('Search: empty matches existing supplied rows', 'filterSitesBySearch([{name:"Fort"}], "").length', 1);
case_('QR: subfolder URL remains correct', 'getHeritagePublicUrl("pamana-test-heritage-plaza")', 'https://pamana.test/archive/heritage.html?site=pamana-test-heritage-plaza');
case_('QR: export requires an explicit production base', 'isQrBaseUrlPublishable()', false);
case_('QR: configured HTTPS base is canonical', '(() => { PAMANA_CONFIG.productionBaseUrl="https://pamana.example/archive"; const value=[isQrBaseUrlPublishable(),getHeritagePublicUrl("old-town")]; PAMANA_CONFIG.productionBaseUrl=""; return value; })()', [true, 'https://pamana.example/archive/heritage.html?site=old-town']);
case_('QR: insecure configured base cannot be exported', '(() => { PAMANA_CONFIG.productionBaseUrl="http://pamana.example/"; const value=isQrBaseUrlPublishable(); PAMANA_CONFIG.productionBaseUrl=""; return value; })()', false);
case_('Heritage edit payload preserves the stored slug by omission', 'Object.hasOwn(buildHeritageSiteRecord({name:"Renamed Site",shortDescription:"",historicalBackground:"History",location:"Place",historicalPeriod:"Period",sourceReference:"",status:"active"}),"slug")', false);
case_('Heritage create payload includes its generated slug', 'buildHeritageSiteRecord({name:"New Site",shortDescription:"",historicalBackground:"History",location:"Place",historicalPeriod:"Period",sourceReference:"",status:"active"},"new-site").slug', 'new-site');
case_('Guard: duplicate button claim is rejected', '(() => { const b={disabled:false}; return [claimButtonAction(b), claimButtonAction(b)]; })()', [true,false]);
case_('Guard: release restores action', '(() => { const b={disabled:true}; releaseButtonAction(b); return b.disabled; })()', false);
case_('Workflow: new story never published', 'buildNewStoryRecord({heritageSiteId:"1",title:"Test story",content:"a".repeat(50),sourceReference:"",suggestedClassification:"Personal Recollection",allowPublicName:false},{id:"c"},{display_name:"Juan"}).status', 'submitted');
case_('Privacy: new story defaults to hidden public name', 'buildNewStoryRecord({heritageSiteId:"1",title:"Test story",content:"a".repeat(50),sourceReference:"",suggestedClassification:"Personal Recollection",allowPublicName:false},{id:"c"},{display_name:"Juan"}).allow_public_name', false);
test('Service boundary blocks invalid registration before Supabase', async () => {
  const result = await run('registerContributor("Juan", "test@example.com", "abc")');
  assert.ok(result.error); assert.match(result.error.message, /8.*64/);
});
test('Byte preflight rejects renamed non-image content', async () => {
  const file = new File(['not an image'], 'photo.png', { type: 'image/png' });
  context.badImage = file;
  assert.match(await run('validateImageContents(badImage)'), /not a valid/);
});
