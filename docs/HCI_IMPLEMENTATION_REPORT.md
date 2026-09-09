# Pamana - HCI implementation and verification report

## Delivery status

Implemented in the uploaded `pamana-ui-polished.zip` codebase. **Local and isolated acceptance checks pass; live Supabase acceptance is pending.** This is an HCI/functionality update, not another visual redesign. No database migration is required.

## HCI principles and changes

| Principle | Implemented behavior |
| --- | --- |
| Visibility of status | Shared spinners and specific signing-in, creating, uploading, submitting, saving, reviewing and QR feedback; pending actions disabled and restored in finally blocks |
| Error prevention | Shared field rules; confirmation matching; image metadata/signature/decode checks; duplicate-action guards; required publication classification and rejection notes |
| Consistency | Reused Bootstrap 5.3.3 modal, shared field feedback, common friendly error mapper, common busy-state helper; existing Pamana visual tokens retained |
| Recognition | Visible password checklist, story/name/description counters, automatic-slug preview/warning, contextual helper text and photo preview |
| User control | Cancel/Escape/Close on confirmations, Back/Return links, Clear Search, remove selected local image; no forced new navigation model |
| Error recovery | Preserved form entries after failures, first-invalid focus, readable network/credential/permission/rate-limit messages, saved-record vs failed-photo distinction |
| Accessibility | Password toggles with 44px targets and updated accessible names, field labels and described errors, aria-invalid, live status, focus return/trapping through Bootstrap, reduced motion |

## Authentication UX

Added `forgot-password.html` and `reset-password.html`, both using the existing Supabase client. Implemented generic reset-request success, verified recovery context, matching new-password confirmation, URL-fragment cleanup, local recovery-session sign-out and Return to Login. Admin access continues to use the existing shared login page, including password visibility and recovery.

New-password rule: 8-64 characters, upper/lowercase and a number; symbols allowed. Passwords are not trimmed/truncated. The rule is checked in the registration/reset UI and again immediately before Auth requests. **Existing-password login is intentionally not blocked by this new rule.** Supabase's hosted password/email settings are separate and were not changed.

## Validation and media

Story title: 5-100. Body: 50-3000. Heritage name: 3-150. Short description: 1-500. Existing location, period and background requirements remain. Supported statuses/classifications remain exact; contributor suggestions stay optional. Final publication classification is required; rejection now requires explanatory notes as requested.

JPG/JPEG, PNG and WebP retain the original 5 MiB limit. Added zero-byte/signature checks and browser decoding when available. Previews use revocable local object URLs; choosing a photo does not upload it. A successfully inserted story/site remains recognized as saved when a later photo step fails. Existing table/column names, bucket, paths, queries and storage permissions remain unchanged.

## Deliberate actions and feedback

One reusable confirmation modal handles Publish, Reject, Archive, Activate, related-photo removal and optional sign-out confirmation. Cancel, Escape, backdrop and Close do not commit a write. Missing Bootstrap fails closed for the confirmation rather than silently performing the action. Publish and Reject retain distinct visual treatment.

Success remains inline or carried across the existing redirect; native alert() was not added. Unknown provider errors are mapped to safe messages. Logs contain a context plus sanitized code/status, not raw tokens/passwords/provider details. Read-only review and failed-load messages are no longer overwritten with unconditional success.

QR payload/URL rules and original qrcodejs import/size/correction level remain unchanged. QR feedback, open-address link, readiness controls and bitmap-based print preparation were improved. The filename/export flow is retained.

## Verification actually completed

| Check | Result |
| --- | --- |
| Pure Node unit tests | **59 passed, 0 failed** |
| Isolated browser scenarios | **39 passed, 0 failed**, including the two requested simulated journeys |
| Responsive matrix | **102 passed**: 17 pages x six widths; no page-level horizontal overflow in tested states |
| Original-page contracts | **15 original pages passed**; existing IDs, data hooks, form defaults, links, selector classes and original script relative order retained |
| Protected files | **10 hashes match**: configuration, database SQL, existing queries/search algorithm and other unchanged scripts |
| Application JavaScript syntax | **24 files passed** |
| CSS / SVG | CSS syntax and **69 SVG files passed** |
| Browser exceptions | No uncaught application page exceptions in the final isolated scenarios; expected injected-error logs and test-harness parser warnings are recorded separately |

E2E-001 exercised contributor registration/login -> valid story/photo -> contributor tracking -> admin review/publication -> signed-out heritage/story view. E2E-002 exercised admin login -> create -> QR/modal/download/print-document -> signed-out public view -> edit -> archive -> public exclusion. Test data are fictional, isolated and not present in production.

### Limits of this evidence

The browser environment blocks normal page navigation. Tests therefore use actual HTML/controllers in an about:blank DOM, in-memory location/history/storage adapters, simulated Supabase responses, offline Bootstrap **5.3.6** and a test-only QR matrix encoder. SVG symbols and the secure-context UUID method are adapted only for this offline test document. The delivered application still uses **Bootstrap 5.3.3** and its original SDK/QR imports. No adapter is imported by production HTML.

The test encoder's downloaded bitmap decoded to the expected URL; this does not prove that the original CDN encoder or a physical printed QR works. A print document was checked but the operating-system print dialog was stubbed. Actual RLS, hosted Auth, trigger behavior, reset-email delivery, SDK token exchange, real storage and live database writes were **not** verified.

The available Supabase connection was used for project metadata only. No live account/role/schema/policy/record was created or modified. No administrator password or service-role key was used or added.

## Preservation and intentional behavior changes

Preserved: both SQL files, Supabase configuration/client setup, all existing repository queries, search matching, role names/routes, status and classification values, ownership model, QR payload rules, storage bucket/path structure and all original public URLs/hooks. No frontend framework or runtime dependency was added.

JavaScript was intentionally edited in **14 existing files**, plus two new shared modules, to implement this request. Accordingly, this delivery does **not** repeat the previous UI-only claim that all JavaScript/business behavior is byte-identical. Requested validation bounds, rejection-note requirement, recovery actions, pending guards, feedback and confirmations are intentional changes. The historical UI manifest remains intact; the HCI preservation checker has an explicit new baseline/authorized-edit list.

## Remaining setup and recommendations

Before deployment, follow `docs/PASSWORD_RECOVERY_SETUP.md`: allow the exact reset URL, verify the email template/inbox flow and configure the hosted password policy deliberately. Client validation alone is not server enforcement. Keep the existing account-confirmation and RLS protections.

Run the live acceptance checklist in `TEST_CASES.md` with authorized staging identities. Verify exact CDN versions, two live workflows, physical QR scanning, real storage and screen-reader/touch behavior. No outstanding failure remains in the executed isolated suites; live acceptance is **NOT RUN**, not PASS.

Existing limitations deliberately retained: editing a site's name can regenerate its slug, so the form warns to regenerate distributed QR codes; archiving a site does not automatically change the publication status of its existing stories; there is no new contributor attachment-edit workflow, so partial story/photo failures direct the contributor to tracking/admin help instead of inventing an unsupported retry operation.

## Files and reproducibility

All original 15 HTML pages receive the shared interaction module; login, registration, contribution, heritage form, review, QR and admin access markup receive targeted help/links. `css/style.css` gains HCI styles. Added the two recovery pages, `js/ui.js`, `js/password-recovery.js`, eye/eye-slash SVGs and sprite symbols, tests, requirements and HCI documentation. Complete modified/created inventory is in `docs/HCI_CHANGE_MANIFEST.json`.

Run:

```bash
python tests/check_ui_contracts.py
node --test tests/unit.test.cjs
python -m pip install -r tests/requirements.txt
python tests/check_assets.py
python -m playwright install chromium
python tests/browser_hci.py
```

The test adapters/fixtures belong only in development and should not be included in a production public folder. Final reports and screenshots are actual offline test output, not live backend evidence. No fabricated AI-prompt history or Supabase screenshots were created.
