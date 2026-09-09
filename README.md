# Pamana Heritage Information System

Pamana is a mobile-first heritage information system for public visitors, community contributors, and administrators.

Visitors can browse active heritage sites, search public heritage information, scan QR codes, and read published community stories without creating an account. Contributors can register, log in, submit stories and photographs, and track their own submissions. Administrators can manage heritage records, QR codes, media, and story review decisions.

## Technology Stack

- HTML
- CSS
- JavaScript
- Bootstrap
- Supabase PostgreSQL
- Supabase Authentication
- Supabase Storage
- QR code JavaScript library
- GitHub
- Vercel or Netlify

## Project Structure

```text
pamana/
├── admin/
│   ├── dashboard.html
│   ├── heritage-form.html
│   ├── heritage-sites.html
│   ├── login.html
│   ├── review-story.html
│   └── submissions.html
├── assets/
│   └── images/
├── contributor/
│   ├── dashboard.html
│   └── submissions.html
├── css/
│   └── style.css
├── database/
│   ├── schema.sql
│   └── storage.sql
├── js/
│   ├── config.js                 Supabase URL, publishable key, production URL
│   ├── config.example.js         Template for config.js
│   ├── core.js                   Constants, errors, safe markup, DOM and URL helpers
│   ├── supabase.js               Supabase client and the shared query wrapper
│   ├── queries.js                All database access, grouped by domain
│   ├── session.js                Session, roles and protected-page rules
│   ├── storage.js                Image validation, upload, signed URLs
│   ├── validation.js             Field reading and form validation
│   ├── search-matching.js        Pure search normalisation and matching
│   ├── auth.js                   Role navigation and the login/registration forms
│   ├── search.js                 Home and browse pages
│   ├── heritage-details.js       Public heritage site page
│   ├── stories.js                Public story page
│   ├── story-submit.js           Contributor submission form
│   ├── story-lists.js            Contributor and administrator story tables
│   ├── story-review.js           Administrator story review
│   ├── heritage-list.js          Administrator heritage table
│   ├── heritage-form.js          Administrator heritage add/edit form
│   ├── heritage-photos.js        Related heritage photograph manager
│   ├── qr.js                     QR code generation, printing and saving
│   ├── admin-dashboard.js        Administrator statistics
│   └── contributor-dashboard.js  Contributor statistics
├── browse.html
├── contribute.html
├── heritage.html
├── index.html
├── login.html
├── register.html
├── story.html
└── TEST_CASES.md
```

### How the scripts load

Every page loads the same base in this order, then its own page scripts:

```text
config.js → core.js → supabase.js → queries.js → session.js
          → storage.js → validation.js → search-matching.js → auth.js
```

`core.js` must come before `supabase.js`, which reads a shared message constant
while starting up. Everything else is resolved when it is called, not when it
loads.

Two rules are worth knowing before changing this code:

- All database access goes through `js/queries.js`. Nothing else calls Supabase
  tables directly.
- All generated markup is built with the `` html`` `` tag in `js/core.js`, which
  escapes interpolated values. `trustedHtml` is the only way to opt out.

## Safe Configuration

Edit `js/config.js` before running or deploying:

```js
const PAMANA_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabasePublishableKey: 'YOUR_SUPABASE_PUBLISHABLE_KEY',
  productionBaseUrl: 'https://your-deployed-domain.vercel.app/'
};
```

Important:

- `productionBaseUrl` must be set before generating QR codes. While it is
  empty, QR codes encode whatever host the browser is on, which for local
  development is the XAMPP address and will not resolve for anyone else.
- The Supabase publishable/anon key is allowed in frontend code. Row Level
  Security in `database/schema.sql` is what actually protects the data.
- Never place the service-role key in this project.
- Never commit real user passwords.
- Never place database passwords in browser JavaScript.
- Keep `productionBaseUrl` updated so QR codes point to the deployed site.

## Supabase Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run `database/schema.sql`.
4. Run `database/storage.sql`.
5. Create at least one admin account in Supabase Auth.
6. In the `profiles` table, set that admin user's role to `admin`.
7. Confirm Row Level Security is enabled on:
   - `profiles`
   - `heritage_sites`
   - `stories`
   - `media`
   - `storage.objects`

## Supabase Production Configuration

In Supabase, open Authentication settings and add your deployed domain.

Recommended settings:

- Site URL: your production URL, for example `https://your-pamana-site.vercel.app`
- Redirect URLs:
  - `https://your-pamana-site.vercel.app/`
  - `https://your-pamana-site.vercel.app/login.html`
  - `https://your-pamana-site.vercel.app/register.html`
  - `https://your-pamana-site.vercel.app/contributor/dashboard.html`
  - `https://your-pamana-site.vercel.app/admin/dashboard.html`

If testing locally, also keep local URLs such as:

- `http://localhost/pamana/`
- `http://localhost/pamana/login.html`
- `http://localhost/pamana/register.html`

## GitHub Preparation

1. Review `js/config.js`.
2. Confirm it contains only the Supabase URL, anon/public key, and production base URL.
3. Confirm there is no service-role key in any file.
4. Initialize Git if needed:

```bash
git init
git add .
git commit -m "Prepare Pamana for deployment"
```

5. Create a GitHub repository.
6. Connect the local repository:

```bash
git remote add origin https://github.com/YOUR_USERNAME/pamana.git
git branch -M main
git push -u origin main
```

## Deploy With Vercel

1. Log in to Vercel.
2. Choose Add New Project.
3. Import the GitHub repository.
4. Use these settings:
   - Framework Preset: Other
   - Build Command: leave blank
   - Output Directory: leave blank or root
5. Deploy.
6. Copy the production URL.
7. Update `PAMANA_CONFIG.productionBaseUrl` in `js/config.js`.
8. Commit and push the updated config.
9. Redeploy if Vercel does not redeploy automatically.

## Deploy With Netlify

1. Log in to Netlify.
2. Choose Add New Site from Git.
3. Select the GitHub repository.
4. Use these settings:
   - Build Command: leave blank
   - Publish Directory: `.`
5. Deploy.
6. Copy the production URL.
7. Update `PAMANA_CONFIG.productionBaseUrl` in `js/config.js`.
8. Commit and push the updated config.
9. Redeploy if Netlify does not redeploy automatically.

## QR Update Procedure

1. Deploy the site first.
2. Copy the final production domain.
3. Set `productionBaseUrl` in `js/config.js`.
4. Open `admin/heritage-sites.html`.
5. Generate or regenerate QR codes.
6. Confirm each QR code opens a URL like:

```text
https://your-pamana-site.vercel.app/heritage.html?site=fort-san-pedro
```

7. Print or save only the final production QR codes.

## Final Production Testing Checklist

Public:

- Home page opens.
- Browse page shows active heritage sites only.
- Search works by name, location, historical period, and published story title.
- QR code opens the correct public heritage page.
- Heritage page shows active heritage information only.
- Story page shows published stories only.
- Submitted or rejected stories are unavailable publicly.

Contributor:

- Registration creates a contributor profile.
- Login redirects to contributor dashboard.
- Dashboard shows correct story counts.
- Story submission saves with `status = submitted`.
- Submitted story is not public.
- My Submissions shows only the logged-in contributor's stories.
- Logout ends the session.

Administrator:

- Login redirects to admin dashboard.
- Dashboard loads database statistics.
- Add heritage site works.
- Edit heritage site works.
- Archive/activate works without permanent deletion.
- Submission review page loads pending stories.
- Publish updates the story to `published`.
- Reject updates the story to `rejected`.
- Logout ends the session.

Security:

- No service-role key is committed.
- No real passwords are committed.
- RLS is enabled.
- Contributors cannot access admin pages.
- Contributors cannot publish or reject stories.
- Visitors cannot submit stories.
- Public users see only active heritage sites and published stories.
- Uploaded files are restricted to JPG, JPEG, PNG, and WEBP.


## UI polish package

The shared presentation system, HTML, logo, icons, and decorative assets have been polished. Existing JavaScript and SQL are unchanged. Bootstrap remains pinned to 5.3.3 in the HTML. See [the implementation report](docs/UI_POLISH_REPORT.md), [design-system guide](docs/DESIGN_SYSTEM.md), and [asset notes](docs/ASSET_PROVENANCE.md).

Run the optional read-only preservation check from the project root:

```bash
python tests/check_ui_contracts.py
```

This Python-standard-library utility checks the original JS/SQL hashes, DOM contracts, form defaults, and local asset references. It is not loaded by the website. It does not test live Supabase behavior. Read the verification limitations and complete the live checklist in `TEST_CASES.md` before deployment. Do not reinitialize the database just to install this visual update.
