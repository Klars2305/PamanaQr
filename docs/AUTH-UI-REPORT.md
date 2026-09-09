Implemented the heritage authentication design and refined the spacing and navbar to match Pamana's shared site header.

1. Modified: `login.html`, `register.html`, `forgot-password.html`, `css/style.css`, `assets/icons/sprite.svg`, and `js/validation.js` (button icon preservation only).
2. Created: the two heritage WebP images, `assets/images/auth-botanical.svg`, seven SVG icon files, `docs/AUTH-ARTWORK.md`, this report, and browser screenshots/results in `test-results/auth/`. Local verification scripts and development-only dependencies are in the workspace's `.auth-tools/` directory.
3. Generated images: `assets/images/auth-login-heritage.webp` and `assets/images/auth-register-heritage.webp`. Both are original 1536 × 1024 images made with the built-in image generator; combined optimized size is approximately 488 KiB. Exact prompts are in `AUTH-ARTWORK.md`.
4. Icons: added `email.svg`, `lock.svg`, `user.svg`, `check.svg`, `people.svg`, `heritage.svg`, and `eye-off.svg`, with matching sprite symbols. Reused existing eye/eye-slash, arrow-right, location, sun, and botanical logo assets.
5. Login: right-side desktop form, supporting copy on the left, heritage artwork, consistent field spacing, recovery link, and reusable card/button styling. Remember me was omitted because the existing form does not support it.
6. Registration: left-side desktop form, supporting copy on the right, original contributor artwork, stacked readable fields, live password checklist, and both visibility controls. The duplicate password rule summary remains associated with the field for assistive technology; the visible checklist retains every rule.
7. Responsive: tested 320, 375, 390, 430, 576, 768, 992, 1024, 1200, and 1440px on all three pages. No horizontal scrolling or broken image assets. Mobile uses a compact image and stacked content. Desktop form positions are verified. Navbar markup, gutters, logo dimensions and sticky behavior reuse the home page implementation.
8. Accessibility: preserved labels, required attributes, autocomplete, feedback associations, live status regions, modal feedback and keyboard toggles. Added scoped focus states and reduced-motion styling. Inputs/buttons remain at least 44px high. Decorative SVGs are hidden from assistive technology.
9. Tests: all 59 existing unit tests pass. Browser tests with a local mocked Supabase provider pass required/email/password/mismatch validation, both registration toggles, keyboard login toggle, loading, field disabling, duplicate prevention, error/success feedback, contributor/admin redirect destinations, original signup payload, and forgot-password recovery destination. No uncaught browser errors. Screenshot evidence and machine-readable checks are in `test-results/auth/`.
10. Issues found and fixed: auth-only navbar width/sticky overrides differed from the site; accumulated margins and duplicate password guidance inflated the forms; validation before loading removed the arrow icon. Shared navbar styling, uniform form gaps, and a small presentation-only button restoration fix resolve these issues.
11. Remaining manual checks: real contributor/admin sign-in, actual signup/email confirmation, password-reset delivery and reset completion, Safari/iOS rendering, and screen-reader review. Browser provider simulations do not establish live backend/email delivery success. Only a login mockup was supplied visually; registration follows the written companion design brief.
12. Preserved: all original form/input/status IDs, data attributes, ordered script imports, password validation rules, Supabase configuration and calls, signup metadata, role logic, permissions, URL parameters, and redirect destinations. No database/schema/RLS/storage-policy changes. `auth.js`, `session.js`, `supabase.js`, `config.js`, and `password-recovery.js` are unchanged.

Verification commands used:

```text
node --test pamana/tests/unit.test.cjs
python .auth-tools/verify.py
node .auth-tools/check.cjs
node .auth-tools/nav-check.cjs
```

Browser checks require the local preview server (`node .auth-tools/preview.cjs`), installed Playwright, and access to the existing Bootstrap CDN. Authentication requests are intercepted by a local fixture; no test accounts are created.
