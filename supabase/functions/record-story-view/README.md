# Deploying the protected view counter

1. Apply `supabase/migrations/202607220002_security_hardening.sql` first.
2. Set a long random `VIEW_COUNT_SALT` secret.
3. Set `ALLOWED_ORIGINS` to the production origin (comma-separated if needed).
4. Deploy with JWT verification disabled so signed-out readers can be counted; the function itself validates the origin, input, and rate-limit fingerprint.

```sh
supabase secrets set VIEW_COUNT_SALT="replace-with-at-least-32-random-characters"
supabase secrets set ALLOWED_ORIGINS="https://kabirprokk.github.io"
supabase functions deploy record-story-view --no-verify-jwt
```

Never place the service-role key or `VIEW_COUNT_SALT` in browser code. Hosted Edge Functions receive the service-role key as a server-side environment secret.
