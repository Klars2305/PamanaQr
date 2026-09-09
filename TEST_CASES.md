# Pamana HCI test cases and actual results

## Evidence and scope

Final automated execution: **2026-09-09T05:46:59.408484+00:00**.

- **59/59 pure JavaScript unit tests passed.**
- **39/39 isolated browser scenarios passed**, including the two full requested user journeys below.
- **102/102 viewport checks passed**, covering 17 pages at 320, 375, 430, 768, 1024, and 1440 pixels. This matrix is part of the browser scenarios, not 102 additional end-to-end tests.
- Original-page contract, protected-file hash, 24-JavaScript syntax, CSS syntax and 69-SVG checks passed.

**These are not live Supabase end-to-end results.** Browser navigation was blocked by the environment. Tests rendered actual HTML/controllers in an `about:blank` document with in-memory location/history/storage adapters, stateful Auth/database/storage fixtures, an offline Bootstrap **5.3.6** substitute, and a test-only QR matrix encoder. Native DOM, forms, modal events, focus, CSS and controller code executed. Production still imports Bootstrap **5.3.3** and the original Supabase/QR libraries. No live account, email, database row, photo, or publication was created.

The application does not import these test adapters. The substitute database implements only enough behavior to exercise workflows; it is not an RLS/security test. Project metadata access does not establish an authenticated test session. No authorized live admin test credentials or isolated staging environment were supplied.

Evidence: `docs/HCI_QA_RESULTS.json`, `docs/HCI_UNIT_RESULTS.txt`, `docs/HCI_RESPONSIVE_RESULTS.json`, and the contract/asset logs. The earlier UI-only checklist is retained in `docs/TEST_CASES_UI_HISTORY.md`; its historical results are not being presented as current tests.

## Status legend

**PASS - ISOLATED TEST:** assertions actually executed and passed with the stated adapters.  
**NOT RUN - LIVE:** requires the configured hosted system and authorized test identities.  
**FAIL:** use only for an actually executed check that did not meet expectations. Do not turn untested items into PASS.

## TC-001 - Valid contributor registration

**Feature:** Valid contributor registration  
**Objective:** Create a contributor using valid form data.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters.  
**Test Data:** Juan Dela Cruz; juan.e2e@example.com; PamanaTest123; matching confirmation. These are fictional credentials.

**Steps:** Open Register; fill the four fields; submit; attempt a duplicate submit while pending; follow the existing Login destination.

**Expected Result:** Validation passes; one Auth request; a contributor profile is available; success feedback and existing redirect.

**Actual Result:** E2E-001 submitted once, created one test-double contributor user/profile, displayed success, and reached Login. The real Supabase profile trigger and email confirmation were not exercised.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-002 - Invalid password

**Feature:** Invalid password  
**Objective:** Block a weak password before Auth.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters.  
**Test Data:** Name Juan Dela Cruz; test@example.com; password abc; confirmation abc.

**Steps:** Open Register; enter data; submit.

**Expected Result:** Show the 8-64/uppercase/lowercase/number requirement; focus and mark the password field; no account request.

**Actual Result:** The password error appeared below the correct input, aria-invalid was true, focus moved to it, the button recovered, and auth.signUp call count remained zero.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-003 - Empty story

**Feature:** Empty story  
**Objective:** Prevent a story without reviewable content.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters. Contributor session and active fixture site exist.  
**Test Data:** Site ID 1; valid story title; empty body; Personal Recollection.

**Steps:** Open Contribute; select the site; complete title/classification; leave Story blank; submit.

**Expected Result:** Show "Story content is required."; insert no record.

**Actual Result:** The exact field message was displayed, no story insert ran, and entering 3,001 characters also remained blocked with a 3,001/3,000 counter.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-004 - Invalid email

**Feature:** Invalid email  
**Objective:** Validate email before requesting a recovery link.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters.  
**Test Data:** juan@

**Steps:** Open Forgot Password; enter juan@; submit.

**Expected Result:** Show "Enter a valid email address." and send no Auth request.

**Actual Result:** The email field showed the exact message; resetPasswordForEmail call count was zero.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-005 - Password mismatch and visibility

**Feature:** Password mismatch and visibility  
**Objective:** Prevent mismatch and support keyboard-accessible visibility.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters.  
**Test Data:** PamanaTest123 and OtherTest123.

**Steps:** Open Register; fill otherwise valid values; focus eye toggle; press Enter and Space; submit mismatched confirmation.

**Expected Result:** Show/hide without submitting; accessible labels update; mismatched values block registration.

**Actual Result:** Password/text types and Show/Hide labels changed correctly; matching was enforced with "Passwords do not match."; no signUp ran.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-006 - Oversized image

**Feature:** Oversized image  
**Objective:** Reject an upload above the existing limit.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters. Contributor form is valid.  
**Test Data:** PNG metadata, size 5 * 1024 * 1024 + 1 bytes.

**Steps:** Select the oversized fixture; submit.

**Expected Result:** Inline size feedback before any insert/upload.

**Actual Result:** The size error appeared; both stories.insert and storage.upload remained at zero. The existing 5 MiB bucket limit was not altered.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-007 - Unsupported/spoofed image

**Feature:** Unsupported/spoofed image  
**Objective:** Check type, extension and actual file content.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters. Contributor form is valid.  
**Test Data:** SVG followed by a text file renamed .png.

**Steps:** Select SVG; inspect error; replace with renamed PNG; submit.

**Expected Result:** Reject unsupported or invalid bytes before writing a story or media.

**Actual Result:** Both invalid choices were rejected; no insert/upload ran. The decoder is used when supported by the browser.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-008 - Valid story and photo

**Feature:** Valid story and photo  
**Objective:** Submit valid, formatted story content once.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters. Registered contributor and active fixture site.  
**Test Data:** The Fort Santiago family-visit story in E2E-001; Personal Recollection; valid local PNG; public-name consent.

**Steps:** Complete Contribute; preview image; submit; attempt a duplicate pending submit; inspect My Submissions and Dashboard.

**Expected Result:** One submitted story and associated photo; submitted count increases; no public publication yet.

**Actual Result:** E2E-001 produced one story, one media record and a Submitted count of 1 in the test double; the public story page did not reveal it before review.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-009 - Publish story

**Feature:** Publish story  
**Objective:** Require classification and deliberate confirmation.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters. Authorized fixture administrator and submitted story.  
**Test Data:** Final classification Personal Recollection; notes "Content reviewed and appropriate for community publication."

**Steps:** Open review; inspect story/source/contributor/photo; select final classification; click Publish; confirm; open public pages.

**Expected Result:** One publication update; success feedback; story appears publicly.

**Actual Result:** E2E-001 checked the review content/photo and confirmed one stories.update; the heritage list of published stories and public Story Details showed the approved content. A separate test blocked empty classification before the dialog.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-010 - Reject story

**Feature:** Reject story  
**Objective:** Prevent accidental rejection and keep rejected content nonpublic.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters. Submitted story and fixture administrator.  
**Test Data:** Notes "Please provide a clearer source before publication."

**Steps:** Try Reject without notes; then add notes, confirm rejection, inspect contributor/public views.

**Expected Result:** Require explanatory notes; rejection requires confirmation; contributor sees rejected status; story stays nonpublic.

**Actual Result:** Empty notes were blocked; confirmed rejection changed the fixture status; contributor UI showed Not published and public details did not expose the story.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-011 - Archive/activate heritage

**Feature:** Archive/activate heritage  
**Objective:** Keep records while changing public availability.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters. Fixture administrator and active site.  
**Test Data:** Pamana Test Heritage Plaza; active/archived values only.

**Steps:** Cancel an archive; test a failed request; confirm an archive; confirm activation on another isolated fixture.

**Expected Result:** Cancel writes nothing; failures recover controls; successful archive keeps record but hides it from public browse; activation reverses visibility.

**Actual Result:** Cancel wrote zero updates; a simulated network failure restored the action; E2E-002 retained the archived row and removed it from public results; activation returned the fixture to active.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-012 - Forgot password

**Feature:** Forgot password  
**Objective:** Use a generic, recoverable request flow.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters.  
**Test Data:** Surrounding whitespace around not-an-account@example.com.

**Steps:** Open Forgot Password; submit; attempt a second pending submit; check result and destination. Repeat with one simulated connection failure.

**Expected Result:** One request, trimmed email, current-app reset URL, generic success, recoverable failure.

**Actual Result:** One request was logged, redirectTo matched the same app reset page, generic account-neutral text appeared, and retry after a failed request worked. No email was sent by these tests.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-013 - Reset password

**Feature:** Reset password  
**Objective:** Require valid recovery context and matching new password.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters. Explicit test-only recovery session; no real emailed token.  
**Test Data:** New password UpdatedPamana123, first mismatched then matching confirmation.

**Steps:** Open fixture recovery link; verify URL cleanup; submit mismatch; correct and submit twice while pending; return to Login.

**Expected Result:** Block mismatch; update once; end local recovery session; new password works.

**Actual Result:** One updateUser call occurred; success appeared; form disabled; the test-double session ended; login with the new password succeeded. Direct/expired contexts remained disabled. Real token exchange and email delivery remain live checks.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-014 - Invalid login and recovery

**Feature:** Invalid login and recovery  
**Objective:** Keep existing users compatible and provide friendly failures.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters.  
**Test Data:** Invalid password, injected network failure, then a fixture account with old password legacy.

**Steps:** Open Login; submit invalid credentials; simulate connection failure; then sign in with the old valid password.

**Expected Result:** Friendly incorrect-credentials/network messages; inputs restored; new-account complexity must not block old-account login.

**Actual Result:** Both failures produced friendly feedback; buttons recovered; the legacy password was sent to Auth and the fixture administrator reached Dashboard.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

## TC-015 - No-results search

**Feature:** No-results search  
**Objective:** Make empty search results understandable and safe.  
**Preconditions:** Isolated browser harness with real Pamana DOM/controllers and the explicitly documented test adapters.  
**Test Data:** <img src=x onerror=alert(1)> as search text.

**Steps:** Search for the text; inspect zero results; choose Clear.

**Expected Result:** No HTML execution; readable empty feedback; Clear restores active heritage results.

**Actual Result:** The input was shown as literal text, no injected image existed, zero-results guidance appeared, and Clear restored the Fort Santiago fixture.

**Status:** PASS - ISOLATED TEST. Live Supabase acceptance: NOT RUN.

# Complete user journeys

## E2E-001 - Contributor -> Administrator -> Public

**Objective:** verify the full submission and publication journey.  
**Preconditions:** isolated test context; authorized fictional administrator; one active site.  
**Test Data:** Juan Dela Cruz; `juan.e2e@example.com`; `PamanaTest123`; matching confirmation. Site: **Fort Santiago (Test Fixture)**, slug `fort-santiago-fixture`. Photo: `tests/fixtures/valid-photo.png`, a generated test image, not documentary heritage imagery.

Story title: **My Family's Visit to Fort Santiago**

> My family visited Fort Santiago during a trip to Intramuros. Walking through the stone walls helped me understand how important the site is to Philippine history. Our guide explained several events connected to the Spanish colonial period and Dr. Jose Rizal. The experience made me appreciate why historical places should be preserved for future generations.

Suggested/final classification: **Personal Recollection**. Source: **Personal experience during visit**. Public-name consent: enabled. Review note: **Content reviewed and appropriate for community publication.**

| Step | Expected result | Actual isolated result |
| --- | --- | --- |
| 1. Register contributor | Valid account/profile, once | One signUp call; fixture contributor profile; success and existing Login destination |
| 2. Log in | Contributor dashboard | Correct dashboard; Submitted count 0 |
| 3. Select site, enter story, preview/upload photo, submit | One submitted story and photo | One insert and media record; duplicate pending submission ignored |
| 4. Dashboard and My Submissions | Submitted count 1, visible submission | Both verified; public details still hid the submitted story |
| 5. Sign out, log in as authorized fixture admin | Admin access | Shared login reached Admin Dashboard |
| 6. Open review | Correct title/body/contributor/source/photo | All inspected through DOM assertions |
| 7. Choose classification and confirm Publish | One update and success | One update; published status; returned to submissions |
| 8. Sign out and open heritage/story pages | Public approved content | Story appeared under published stories; details/body/classification matched |

**Actual Result:** the complete journey passed in the isolated browser scenario, including role changes through the real login/logout form controllers.  
**Status:** **PASS - SIMULATED JOURNEY. NOT RUN AGAINST LIVE SUPABASE.** Real Auth/profile triggers, RLS, storage and public visibility must still be checked on staging.

## E2E-002 - Administrator -> Heritage management -> QR -> Public -> Edit -> Archive

**Objective:** exercise the full heritage lifecycle without deletion.  
**Preconditions:** isolated test context and fictional administrator; no production data.  
**Test Data:**

| Field | Value |
| --- | --- |
| Name | Pamana Test Heritage Plaza |
| Generated slug | pamana-test-heritage-plaza |
| Location | Davao del Norte, Philippines |
| Historical period | 20th Century |
| Short description | A temporary test heritage record used to verify the complete Pamana heritage management workflow. |
| Historical background | This test record is created only for system testing. It verifies that administrators can create, update, activate, archive, and generate QR codes for heritage records. |
| Source | Pamana System Testing |
| Status | active |

| Step | Expected result | Actual isolated result |
| --- | --- | --- |
| 1. Admin login | Authorized dashboard | Existing shared login/role destination verified |
| 2. Complete Add Heritage Site | Valid form and automatic slug | Name, location, period, descriptions, source and status accepted; slug preview matched |
| 3. Save once | Record and success | One insert; list contained test plaza; duplicate pending submit ignored |
| 4. Open QR modal and regenerate | Correct public URL | `heritage.html?site=pamana-test-heritage-plaza` and open-link target matched |
| 5. Save/print presentation | Nonblank image and useful print document | Download filename/pixels verified; print popup had title and bitmap. Print dialog itself was stubbed |
| 6. Decode offline adapter QR | Exact expected URL | OpenCV decoded the test-adapter image to that URL. This is NOT verification of the original CDN encoder |
| 7. Sign out and open public site | Correct active details | Name, location and history were verified |
| 8. Admin edit and save | Updated description appears publicly | Changed description, saved, signed out and verified public description |
| 9. Admin Archive and confirm | Record kept; public visibility removed | Row remained archived; signed-out Browse omitted it and direct heritage URL showed unavailable feedback |

**Actual Result:** create -> QR presentation/export -> public view -> edit -> archive passed in the isolated browser scenario.  
**Status:** **PASS - SIMULATED JOURNEY. NOT RUN AGAINST LIVE SUPABASE.** Physical phone scanning, production CDN output, real printing and real database/storage writes remain unverified.

## Live acceptance still required

| Check | Preconditions | Actual result | Status |
| --- | --- | --- | --- |
| Both journeys above | Authorized staging project, test contributor and admin | Not executed against a hosted backend | NOT RUN - LIVE |
| Registration confirmation and profile trigger | Owned test inbox; real Auth settings | Simulated user/profile only | NOT RUN - LIVE |
| Reset email delivery, token exchange, expiry/reuse | Correct allowlist/template and owned inbox | Recovery context/API calls simulated only | NOT RUN - LIVE |
| RLS, ownership and cross-account privacy | Two authorized contributor accounts plus admin | Query contracts preserved; fixture permissions are not proof | NOT RUN - LIVE |
| Real image upload, signed URL and cleanup | Private storage bucket and policies | File validation and controllers tested; storage mocked | NOT RUN - LIVE |
| Actual Bootstrap 5.3.3/Supabase/QR CDN loading | Normal browser with network access | Offline substitutes used | NOT RUN - LIVE |
| QR scanned from print on a physical phone | Correct productionBaseUrl; original encoder loaded | Only test-adapter bitmap was decoded | NOT RUN - LIVE |
| Assistive technology and physical touch devices | Screen reader/keyboard/phone | DOM focus and viewport checks only | NOT RUN - LIVE |

Use uniquely marked test records and an inbox you control; never use a service-role key in the browser. Do not modify important production records for evidence. Record real expected/actual outcomes after each step. Only archive or remove temporary records you explicitly created and are authorized to clean up. Do not fabricate screenshots, email results, database evidence or AI history.

## Issues found and resolved while implementing/testing

- Field feedback had to be identified by field ID so password-toggle wrappers did not break association.
- A failed site-picker request and read-only review message could previously be overwritten with a generic success. Success is now conditional on actual loading.
- Unexpected photo-preparation failures after a record insert needed to retain the saved record in the result. The UI now states that the record exists and does not encourage a duplicate full submission.
- QR print preparation now copies generated pixels to an image rather than cloning an empty canvas bitmap. The production encoder and URL rules were not replaced.
- Initial test harness failures included attempting to edit a read-only profile field, expecting "No" instead of the actual "0 results" message, secure-context UUID absence in about:blank, and unsafe test-fixture JSON embedding. The harness was corrected; these failures are not represented as live application defects.

Final executed suites have no failed assertions. The unrun live checks above remain release acceptance work, not passing results.

## QR Scanner focused verification — 2026-09-09

Command: `node --test tests/scanner.test.cjs` — **7/7 passed**. The tests execute the real scanner controller with isolated camera/decoder doubles. Headless Chrome renders were also checked at the mobile breakpoint (500 × 850) and desktop (1440 × 1000).

| Feature | Result | Notes |
| --- | --- | --- |
| TC-QR-001 — Valid Pamana QR | PARTIAL | The real validation and navigation code opened the exact local and configured production `heritage.html?site=fort-santiago` destinations. Physical camera decoding of a generated QR was not available. |
| TC-QR-002 — Invalid QR | PASS | An unrelated URL and plain text caused no navigation and showed the exact required invalid-QR message. |
| TC-QR-003 — Camera permission denied | PASS | A simulated browser `NotAllowedError` did not crash, restored Retry, and explicitly offered QR image upload. |
| TC-QR-004 — QR image upload | PARTIAL | The upload controller accepted a valid image result and opened the correct heritage destination. Production CDN bitmap decoding was not executed in this environment. |
| TC-QR-005 — Duplicate scan | PASS | Two immediate detections produced one navigation action. |
| Camera start/stop | PASS | Start/Stop state, button recovery, stream stop call, insecure context, and busy-camera messages passed with browser API doubles. |
| Mobile layout | PASS | Responsive structure passed at 375 px; the scanner page visually fit the mobile breakpoint in headless Chrome. |
| Desktop layout | PASS | Headless Chrome render at 1440 × 1000 fit without scanner-page overflow. |
| Back navigation | PASS | Back to Home points to the existing `index.html` destination. |
| Localhost | PASS | Relative Pamana QR validation preserves the local application base path; insecure non-local HTTP receives HTTPS guidance. |
| HTTPS / Vercel | PARTIAL | Configured production-origin validation passed. Live Vercel camera permission and CDN loading were not available. |
| Console errors | PARTIAL | No exceptions occurred in the seven isolated scanner scenarios or static headless renders. Live camera/CDN console behavior remains a device check. |

### Scanner bug fixed

- Camera permission denial now tells the visitor to allow access and retry **or upload a QR image instead**.
