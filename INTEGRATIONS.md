# Integration access and backup handoff

Last checked: 2026-08-28. These are setup notes, not credentials or a guarantee of future access.

## Cloudflare: Codex connected; Claude not connected for now

- The owner connected the Cloudflare plugin to Codex. Its `cloudflare_api` tools are
  available in this Codex session; use the connected tools rather than hunting for
  a token in this repository.
- **Claude has not been connected to Cloudflare, per the owner.** Reading these files
  does not share Codex's OAuth grant with Claude. Do not assume Claude can perform
  Cloudflare operations until it is separately connected and access is verified.
- This is an integration-access distinction, not a filesystem restriction: both
  assistants may read this note. No OAuth token or secret belongs in these files.
- Verified: listing R2 buckets succeeds. The selected account returned zero buckets.
- Blocked: creating the planned private `the-lab-backups` Standard bucket returned
  Cloudflare error `10000: Authentication error`. A subsequent list still returned
  zero buckets. Reading notification policies also returned `9109: Unauthorized to
  access requested resource`. The connection does not currently authorize the
  required setup operations; do not describe it as full administrative access.
- Next: the owner must reauthorize the Cloudflare connection with the necessary
  R2 write permissions for the intended account. Use a narrowly scoped Custom grant
  where available; notification/analytics access must be checked separately. Do not
  bypass a denied operation using another credential or assume reconnecting grants
  every permission. Recheck before making changes.

## Off-site backups are NOT active

See [the backup setup and recovery runbook](scripts/backup/README.md).

- R2 enrollment is complete per the owner, but no bucket, S3 credential, billing
  alert, or production backup was created by this setup attempt.
- The GitHub `backups` environment secret-list request returned 404; its setup still
  needs verification/completion. The repository variable `BACKUPS_ENABLED` is absent.
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
