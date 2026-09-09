# Pamana Formal Test Cases

Use these test cases against the deployed or locally functioning Pamana application. Do not mark PASS or FAIL until the test is actually performed.

| Test ID | User Role | Feature | Input/Action | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- | --- | --- |
| TC01 | Visitor / New Contributor | Contributor Registration | Open `register.html`, enter valid display name, valid email, password, and matching confirm password. Submit the form. | Supabase Auth account is created. A matching `profiles` record is created with `role = contributor`. User is redirected to login or the configured post-registration page. | Not yet tested. | Pending |
| TC02 | Contributor | Contributor Login | Open `login.html`, enter valid contributor email and password, then submit. | Login succeeds and the user is redirected to `contributor/dashboard.html`. Contributor dashboard shows the contributor display name and story counts. | Not yet tested. | Pending |
| TC03 | Contributor | Contributor Story Submission | Log in as contributor. Open `contribute.html`, select a heritage site, enter valid title, story content, classification, optional source/reference, optional valid image, then submit. | Story is inserted into `stories` with `contributor_id = logged-in user ID` and `status = submitted`. Story does not appear on public heritage/story pages until approved. | Not yet tested. | Pending |
| TC04 | Visitor | Protected Story Submission | Log out. Manually open `contribute.html`. | Visitor is redirected to `login.html` and sees a friendly message such as `You need to log in before submitting a story.` | Not yet tested. | Pending |
| TC05 | Contributor | Admin Page Protection | Log in as contributor. Manually open `admin/dashboard.html`. | Contributor is denied access or redirected away from the admin dashboard. Admin data/actions are not shown. | Not yet tested. | Pending |
| TC06 | Administrator | Admin Login | Open `login.html`, enter valid administrator email and password, then submit. | Login succeeds and the user is redirected to `admin/dashboard.html`. Admin dashboard statistics and actions are shown. | Not yet tested. | Pending |
| TC07 | Administrator / Visitor | Publish Story | As admin, open pending submissions, review a submitted story, choose final classification, and publish. Then open the public story link as a visitor. | Story is updated with `status = published`, `reviewed_by = current admin`, `reviewed_at` set, and `published_at` set. Story becomes visible publicly. | Not yet tested. | Pending |
| TC08 | Contributor | Invalid Story Form | Log in as contributor. Open `contribute.html`, leave story title blank, complete other required fields, then submit. | Submission is blocked. Friendly field validation appears near the title field. No story record is inserted. | Not yet tested. | Pending |
| TC09 | Visitor | QR Code Access | Generate/view QR code for an active heritage site. Scan the QR code using a phone camera. | Browser opens the correct public URL, such as `heritage.html?site=fort-san-pedro`, and displays the active heritage site details. | Not yet tested. | Pending |
| TC10 | Contributor | Contributor Privacy / RLS | Log in as Contributor A. Attempt to access or query Contributor B's private submitted/rejected story record through the frontend or browser console. | Database/RLS denies access. Contributor A cannot view Contributor B's private submission, contributor ID, review notes, or unpublished content. | Not yet tested. | Pending |

## Screenshot and Evidence Recommendations

For each test, collect evidence only after running the test:

- Screenshot of the page before submitting the form.
- Screenshot of the success, validation, or error message.
- Screenshot of the redirected dashboard or protected page result.
- Supabase Table Editor screenshot showing important database values, such as `role`, `contributor_id`, and `status`.
- Browser console screenshot only when checking developer logs or errors.
- For QR testing, screenshot of the QR code and a phone screenshot showing the opened heritage page.
- For privacy/RLS testing, screenshot of the denied result or empty query result.

## Bug Log

Record discovered bugs here after testing.

| Bug ID | Related Test ID | Description | Steps to Reproduce | Expected | Actual | Severity | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BUG01 |  |  |  |  |  |  |  |

## Testing Notes

- Use separate test accounts for contributor and administrator.
- Keep one unpublished story available for moderation tests.
- Test as logged out, contributor, and admin in separate browser profiles or incognito windows.
- Do not use the Supabase service-role key in browser testing.
- Confirm database results in Supabase after each create/update test.


## UI polish verification addendum

This addendum records only the checks performed for this presentation update. Earlier manual checklists above are not asserted to have been rerun against a live Supabase project.

### Completed

- Static contract checker: 15 pages; all original IDs, data hooks, functional selector classes, field/form defaults, select values, hrefs, and script references retained.
- 22 application JavaScript files and 2 SQL files hash-identical to the uploaded project. All application JS passed `node --check`.
- CSS parse, SVG XML, local assets, ARIA reference targets, and textarea-default checks passed.
- 135 isolated viewport checks across 15 pages and nine widths: 320, 375, 430, 576, 768, 992, 1200, 1440, 1680px.
- 30 mocked-data UI interaction checks passed. Detailed cases and actual results are recorded in `docs/UI_QA_RESULTS.json`.
- 10 selected text/background token pairs meet 4.5:1. This is not a full accessibility conformance audit.

### Important environment limitation

The offline rendering harness used locally available Bootstrap 5.3.6, mock Supabase responses, and injected URL helpers because browser navigation/CDN access was restricted. The website still uses the original Bootstrap 5.3.3 imports. The QR drawing library was stubbed for modal tests, so scannability and image output were not verified. Neither the rendering substitute nor mock records are shipped as application code.

### Live acceptance checklist - not yet run

| Scenario | Expected result | Actual result | Status |
| --- | --- | --- | --- |
| Load each page with real Bootstrap 5.3.3 and the original CDN scripts | No new console errors, layout defects, or failed asset loads | Not run in connected browser | NEEDS MANUAL VERIFICATION |
| Visitor: browse, search, clear, open site and published story | Correct public records and unchanged URLs | Not run against live records | NEEDS MANUAL VERIFICATION |
| Contributor: register/confirm email, sign in, refresh session, sign out | Existing account and session behavior preserved | Not run with real account | NEEDS MANUAL VERIFICATION |
| Contributor: submit valid story and image, check My Submissions | Submitted status, correct ownership, image stored and displayed | Mocked handler checked only | NEEDS MANUAL VERIFICATION |
| Contributor: invalid/oversize image and missing required fields | Existing validation, errors, and restored controls | Local invalid-input checks only | NEEDS MANUAL VERIFICATION |
| Administrator: sign in, open protected pages | Existing role checks and real RLS permissions enforced | Mocked UI role only | NEEDS MANUAL VERIFICATION |
| Add/edit a heritage record and related photo | Existing fields, slug, storage paths, and media behavior retained | UI population/validation only | NEEDS MANUAL VERIFICATION |
| Archive/activate | Record visibility changes as originally implemented | Mocked handler checked only | NEEDS MANUAL VERIFICATION |
| Publish/reject and reopen reviewed story | Existing transition, classification, and read-only rules | Mocked handlers checked only | NEEDS MANUAL VERIFICATION |
| Generate/regenerate/save/print a QR code and scan it on a real phone | Correct public site URL and readable output | Modal/URL plumbing only | NEEDS MANUAL VERIFICATION |
| Keyboard and screen reader on mobile/desktop | Meaningful labels, focus, feedback, table scrolling, and modal behavior | Basic local structural checks only | NEEDS MANUAL VERIFICATION |

Do not test destructive/live-write cases against valuable production records. Use an authorized staging project and test accounts.
