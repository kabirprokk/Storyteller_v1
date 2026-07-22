<p align="center">
  <img src="assets/storyteller-mark.png" alt="Storyteller logo" width="120">
</p>

<h1 align="center">Storyteller</h1>

<p align="center">
  A secure, cinematic publishing platform for honest voices, untold worlds, and stories that stay.
</p>

<p align="center">
  <a href="https://kabirprokk.github.io/Storyteller_v1/">Live website</a>
</p>

![Storyteller cinematic artwork](assets/hero-stories.png)

## About

Storyteller is a responsive writing and reading platform built as a static single-page application with a Supabase backend. Writers can publish richly formatted stories, build a profile, interact with readers, and manage their personal library. Administrators receive a dedicated moderation and editorial dashboard.

## Features

- Cinematic rotating homepage artwork with reduced-motion support
- Email/password and social authentication
- Rich editor with live preview, autosave, TXT import, tags, categories, and cover uploads
- Draft and publication workflows with publication-integrity safeguards
- Recently published, featured, trending, search, sorting, and category discovery
- Reader mode, likes, bookmarks, comments, sharing, reports, and reading history
- Public writer profiles, global avatars, follows, and notifications
- Responsive dark and light themes
- Optional low-volume local theme music, mute control, click feedback, and stateful interaction icons
- Session-only human-verification gate with 512 local sentence combinations and typing-rhythm checks
- Role-protected administration with expandable account records, report evidence, moderation controls, and metrics
- Integrated Help Centre for questions, problem reports, suggestions, and administrator email
- Detailed Privacy Policy, Terms and Conditions, and Community Rules
- Rate-limited view counting through a Supabase Edge Function

## Architecture

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS, and vanilla JavaScript |
| Authentication | Supabase Auth |
| Database | Supabase Postgres with Row Level Security |
| Media | Supabase Storage |
| Server-side logic | Supabase Edge Functions |
| Hosting | GitHub Pages |
| Content sanitization | DOMPurify 3.4.12 |
| Browser client | Supabase JS 2.110.7 |

The frontend has no build step. Browser dependencies are pinned and self-hosted in `vendor/` to avoid floating CDN versions.

## Project structure

```text
.
|-- assets/                       Brand and hero artwork
|-- css/
|   |-- styles.css                Responsive design system
|   `-- human-verification.css    Verification-gate presentation
|-- js/
|   |-- app-v2.js                 UI, routing, editor, and interactions
|   |-- audio-controller.js       Local theme music, mute preference, and click feedback
|   |-- config.js                 Public Supabase browser configuration
|   |-- frame-guard.js            Clickjacking fallback protection
|   |-- human-verification.js     Session-only verification logic
|   `-- supabase-service.js       Data-access layer
|-- supabase/
|   |-- functions/                Protected view-count Edge Function
|   `-- migrations/               Ordered production database migrations
|-- vendor/                       Pinned browser dependencies
|-- index.html                    Application shell and CSP
`-- manifest.json                 Installable web-app metadata
```

## Local development

Clone the repository and serve it over HTTP:

```sh
git clone https://github.com/kabirprokk/Storyteller_v1.git
cd Storyteller_v1
python -m http.server 8000
```

Open `http://localhost:8000`. A `file://` URL is not recommended because browser security rules differ from production.

## Supabase setup

1. Create a Supabase project.
2. Put only the project URL and publishable browser key in `js/config.js`.
3. Apply every file in `supabase/migrations/` in filename order.
4. Create the `VIEW_COUNT_SALT` and `ALLOWED_ORIGINS` Edge Function secrets.
5. Deploy the protected counter:

```sh
supabase functions deploy record-story-view --no-verify-jwt
```

`SUPABASE_SERVICE_ROLE_KEY`, `VIEW_COUNT_SALT`, database passwords, and access tokens must never be placed in browser code or committed to Git. Hosted Supabase functions receive server credentials through protected environment variables.

## Human verification

The entry gate is built entirely with local HTML, CSS, and vanilla JavaScript. It combines 512 unique sentence combinations with a minimum reading delay, exact character matching, typing-speed checks, typing-rhythm checks, and short-lived passive interaction analysis. Behavior samples remain only in memory and are discarded when the gate closes; a successful result is remembered only in `sessionStorage`, so it lasts for the current browser tab session.

This feature adds friction for basic automation; it is not a security boundary because all client-side code can be inspected or bypassed. Authorization, ownership, roles, and protected data remain enforced by Supabase Row Level Security and server-side functions.

## Security

- Row Level Security enforces ownership and administration in Postgres, not only in the UI.
- Anonymous readers use minimized public views that omit account UUIDs and internal profile state.
- Direct anonymous execution of the legacy view counter is revoked.
- Sensitive account-directory data is exposed only through an administrator-checked RPC.
- View events are deduplicated in hourly windows using a salted one-way visitor hash.
- Story HTML is sanitized before rendering.
- Storage uploads require authenticated, user-owned paths and approved image types.
- A restrictive Content Security Policy limits scripts, connections, media, forms, frames, and objects.
- GitHub Pages excludes backend migrations and Edge Function sources from the public website artifact.

The `sb_publishable_...` key in `js/config.js` is intentionally public. It identifies the Supabase project but does not bypass Row Level Security. Never replace it with a secret or service-role key.

## Deployment

Production deploys from `main` through GitHub Pages. `_config.yml` excludes repository-only backend files from the generated website while keeping required application assets available.

After deployment, verify the public feed, authentication, publishing, comments, follows, personal libraries, administration, anonymous permission boundaries, and view-count deduplication.

## Maintainer

Built and maintained by [kabirprokk](https://github.com/kabirprokk).
