# Integration access and backup handoff

Last checked: 2026-08-29. These are setup notes, not credentials or a guarantee of future access.

## Cloudflare: Codex connected; Claude not connected for now

- The owner connected the Cloudflare plugin to Codex. Its `cloudflare_api` tools are
  available in this Codex session; use the connected tools rather than hunting for
  a token in this repository.
- **Claude has not been connected to Cloudflare, per the owner.** Reading these files
  does not share Codex's OAuth grant with Claude. Do not assume Claude can perform
  Cloudflare operations until it is separately connected and access is verified.
- This is an integration-access distinction, not a filesystem restriction: both
  assistants may read this note. No OAuth token or secret belongs in these files.
- Reauthorized and verified 2026-08-29: R2 read/write operations now succeed. The
  private Standard bucket `the-lab-backups` was created in ENAM. Its managed r2.dev
  domain is disabled, it has no custom domains, and it has no age-based object
  expiration rule. The default seven-day incomplete multipart-upload abort rule is
  enabled and does not delete completed backup objects.
- The owner temporarily selected the Full access OAuth template to complete setup.
  After the required R2 configuration is finished and verified, revoke this grant and
  reconnect with read-only access for monitoring. The unattended backup must use its
  own bucket-scoped S3 credential, not this interactive OAuth grant.

## Off-site backups are NOT active

See [the backup setup and recovery runbook](scripts/backup/README.md).

- R2 enrollment and the private `the-lab-backups` bucket are complete. A bucket-scoped
  S3 credential is stored in the GitHub `backups` environment and passed a live
  write/head/delete probe on 2026-08-29 (Actions run `33272395115`). No billing alert
  or production backup has been created yet.
- The GitHub `backups` environment now exists and its deployment branch policy permits
  only `main`. `RESTIC_REPOSITORY`, `BACKUP_S3_ACCESS_KEY_ID`, and
  `BACKUP_S3_SECRET_ACCESS_KEY` are configured; the remaining required secrets are not.
  The repository variable `BACKUPS_ENABLED` remains absent so scheduled backups cannot
  run prematurely.
- The prepared workflow runs once daily only after explicit activation. It still
  needs the production database connection, bucket-scoped S3 credentials, independent
  restic encryption password with an owner-held recovery copy, and a server-only
  Storage key when media is present. The Cloudflare plugin grant is not a substitute
  for these unattended GitHub Actions credentials.
- First complete an encrypted production backup, download verification, a second
  backup, and an isolated compatible Supabase restore test. Synthetic CI tests alone
  do not prove real user data is recoverable.
- Usage monitoring and an independent stale-backup alert are not configured. A
  Cloudflare budget notification is not a spending cap. Do not promise zero charges
  or continuous monitoring just because an assistant is connected.
- Do not add age-based R2 expiration to restic objects; retained snapshots can still
  reference older chunks. No automatic pruning is currently enabled.

Keep secrets in the appropriate secret store/password manager, never in chat,
frontend variables, handoff files, or commits. Old handoff references to local
credential files are not evidence that those credentials still work.

Reference: [Cloudflare MCP authorization](https://developers.cloudflare.com/agent-setup/visual-studio-code/).
