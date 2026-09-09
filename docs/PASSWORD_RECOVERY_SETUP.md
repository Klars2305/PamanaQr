# Password recovery: setup and live acceptance

This update adds the UI and Supabase Auth calls. It does not change your hosted Supabase settings, schema, policies, keys, or email configuration.

## 1. Deploy the two new pages

Deploy `forgot-password.html`, `reset-password.html`, `js/ui.js`, and `js/password-recovery.js` with the rest of this package. Keep the existing script order. Recovery pages intentionally load `password-recovery.js` after `core.js` and before `supabase.js`, so the original recovery fragment can be recognized before the SDK processes it.

Serve the site over HTTPS in production, or a local development server on localhost. Do not open HTML through `file://`. No database migration is needed for this update, and existing databases should not be reinitialized.

## 2. Allow the exact reset destination

In your own Supabase project, open **Authentication > URL Configuration**. Keep the correct production Site URL. Add the exact `reset-password.html` URL to the Redirect URLs allowlist, including any subfolder and development port you actually use.

Examples only; replace with your real deployment:

```text
https://your-pamana-domain.example/reset-password.html
http://localhost:5500/reset-password.html
http://localhost/pamana/reset-password.html
```

The implementation calls `resetPasswordForEmail(email, { redirectTo: toAppUrl('reset-password.html') })`. It uses the current app's origin/subfolder; it does not accept an arbitrary return URL from a query parameter. Supabase requires the requested redirect to match its allowlist. Use exact production paths, not an unrestricted wildcard. [1][2]

Check the recovery email template as well. Its link must go through Supabase's verification link and respect the requested redirect; do not replace it with a plain link directly to the form. A custom template hardcoded to a Site URL can defeat the intended destination. The stock verification-link flow is appropriate for this static client. A custom `token_hash` callback or a PKCE migration would need its own separately tested integration. [1][2]

## 3. Check the Auth password policy

The application enforces the requested **8-64 characters, uppercase, lowercase, and a number** on registration and password reset, using the same validator in the form handler and immediately before the Auth request. Symbols and spaces are allowed; passwords are neither trimmed nor silently shortened. Login intentionally accepts an existing account's nonempty password without applying new-account complexity rules.

In Supabase Auth settings, have the project owner configure an appropriate minimum length and character policy for new/updated passwords. Supabase supports server-side password requirements. **No hosted Auth policy was changed or verified by this update.** The application's 64-character maximum is a client/request-helper rule, not a newly installed server constraint. Someone calling the API outside this application remains subject to the server's actual policy, not its JavaScript validators. [3]

Keep existing email confirmation, RLS, and storage restrictions. Do not disable them just to make a demonstration pass. Never put a service-role key, database password, or administrator password in browser code.

## 4. Test with an inbox you control

Use an authorized staging project and contributor/admin test accounts. The `example.com` addresses and passwords in the automated fixtures are fictional; they cannot prove email delivery.

1. Open Login, choose **Forgot password?**, enter the owned test email, and send a link.
2. Check inbox/spam. The UI must use the same generic success message for an unknown address; it must not claim that account exists.
3. Open the newest email link. The reset form must remain disabled until Supabase verifies the recovery session. Expired, malformed, or ordinary direct visits should not unlock it.
4. Check weak-password, mismatch, visibility-toggle, and keyboard behavior. Save a valid password once.
5. Confirm success, local recovery-session sign-out, and Return to Login. Verify the new password signs in and the previous password no longer does.
6. Test expired/reused links, disconnected network, rate limiting, existing-session conflicts, and both supported account roles. Redact tokens, emails, and credentials from any submitted evidence.

The reset implementation listens for `PASSWORD_RECOVERY`, checks the authenticated user, and uses `auth.updateUser({ password })`. It schedules SDK calls outside the auth-state callback to avoid reentrant SDK calls. A short-lived sessionStorage marker contains only user ID/expiry for same-tab reload convenience; it does not contain a raw recovery token and is **not** an authorization boundary. Supabase Auth remains the password authority. [1]

## 5. QR and deployment checks

Keep the existing `productionBaseUrl` configuration appropriate for your deployed public site before printing QR codes. A localhost QR address is not a public address. Verify the original Bootstrap **5.3.3**, Supabase SDK, and QR CDN scripts load on the actual hosting environment.

## References

These are implementation references, not evidence that your hosted project has been configured:

[1] Supabase JavaScript `resetPasswordForEmail`: https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail

[2] Supabase redirect URLs and email template considerations: https://supabase.com/docs/guides/auth/redirect-urls

[3] Supabase password security and configurable requirements: https://supabase.com/docs/guides/auth/password-security
