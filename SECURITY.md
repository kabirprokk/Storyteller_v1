# Security deployment notes

## Required Supabase rollout

The browser client detects whether the hardened schema exists, so this repository can be deployed before the database migration without downtime. The live database is not hardened until both steps below are completed:

1. Apply `supabase/migrations/202607220002_security_hardening.sql` in the Supabase SQL Editor.
2. Configure and deploy `supabase/functions/record-story-view` using its README.

After the migration, anonymous clients can read only the deliberately minimized public views. Direct anonymous access to account metadata, author UUIDs, social-graph rows, and the privileged view-count RPC is revoked.

## HTTP security headers

GitHub Pages does not provide repository-controlled response headers. The site includes a restrictive CSP meta policy and a deny-by-default frame guard, but a reverse proxy such as Cloudflare should additionally send these response headers:

```text
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; form-action 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://syemkwyfefzdmogtsvmi.supabase.co; connect-src 'self' https://syemkwyfefzdmogtsvmi.supabase.co wss://syemkwyfefzdmogtsvmi.supabase.co; upgrade-insecure-requests
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

The `frame-ancestors` and `X-Frame-Options` protections must be HTTP headers; browsers do not enforce `frame-ancestors` from a CSP meta element.

## Dependencies

Browser security dependencies are pinned and self-hosted:

- Supabase JS 2.110.7
- DOMPurify 3.4.12

Update them deliberately, review release notes, and change the versioned filenames and HTML references together.
