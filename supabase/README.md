# Backend security and recovery setup

## Encrypted off-site backups

See [backup setup and recovery runbook](../scripts/backup/README.md). The pipeline is
implemented but is **not active until production credentials, a private repository,
first-run verification and an isolated restore drill are complete**. Existing in-database
history continues unchanged. No production backup is implied by a successful CI fixture test.

The SQL in `migrations/` is the source of truth for the production database. Apply migrations in filename order through the Supabase CLI or dashboard before deploying matching frontend code.

## Public signup rollout

Public email signup is intentionally off until both services below are configured:

1. Configure a custom SMTP provider in Supabase Auth (for example, Resend) and verify the sender domain.
2. Create a Cloudflare Turnstile widget for the production domain, configure its secret in Supabase Auth, and expose only the public site key as `VITE_TURNSTILE_SITE_KEY`.
3. Test signup, email confirmation, password recovery, legacy backup-code recovery, and abuse throttling.
4. Set the Supabase Auth `disable_signup` setting to `false` and the deployment variable `VITE_PUBLIC_SIGNUPS_ENABLED` to `true`.

## Deletion email

The `account-deletion` Edge Function sends a 30-minute confirmation link and requires the same user to be signed in before it deletes anything. Configure the Edge Function secrets `RESEND_API_KEY`, `DELETE_EMAIL_FROM`, and `PUBLIC_SITE_URL`, deploy the function, test it, and only then set `VITE_ACCOUNT_EMAIL_ENABLED` to `true`. The direct database deletion RPC is intentionally removed.

Never put an SMTP password, Turnstile secret, Supabase service-role key, or management token in a frontend environment variable or GitHub Pages bundle. The Supabase anon key is designed to be public; authorization is enforced by RLS and narrowly granted RPC functions.

## Apple Health

Apple Health import uses a write-only bearer token stored in the iPhone Shortcut. Rotating the token invalidates the old Shortcut until the new token is pasted into it. Disconnecting removes the token and can delete imported step history. A web app cannot continuously read HealthKit in the background; fully automatic syncing requires a native iOS app.

## Hosting headers

`index.html` includes a restrictive CSP and referrer policy for GitHub Pages. GitHub Pages does not support project-specific response headers, so `frame-ancestors`/`X-Frame-Options` and `Permissions-Policy` must be added at the CDN or host when the app moves to its own domain.
