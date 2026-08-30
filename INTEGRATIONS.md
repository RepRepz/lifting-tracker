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

## Off-site backups are active and recovery-tested

See [the backup setup and recovery runbook](scripts/backup/README.md).

- R2 enrollment and the private `the-lab-backups` bucket are complete. A bucket-scoped
  S3 credential is stored in the GitHub `backups` environment and passed a live
  write/head/delete probe on 2026-08-29 (Actions run `33272395115`). No billing alert
  is configured yet.
- The GitHub `backups` environment now exists and its deployment branch policy permits
  only `main`. All seven workflow secrets are configured: the database URL, database
  CA certificate, bucket-scoped R2 key pair, restic repository, restic password, and
  server-only Supabase Storage key. The Cloudflare plugin grant is not a substitute
  for these unattended GitHub Actions credentials.
- Two production snapshots completed on 2026-08-29. Run `33274406635` exported the
  database and media, encrypted and uploaded them, downloaded them again, and passed
  a full restic repository check with data reads. Run `33274467489` repeated the normal
  export/upload/download/integrity-verification path successfully.
- Synthetic recovery run `33274567765` also created two encrypted test snapshots and
  restored one into an isolated PostgreSQL database, validating row counts, RLS, a
  policy, a trigger, a grant, and sequence state without using production data.
- Production recovery run `33291575809` restored the latest real encrypted snapshot
  into an isolated Supabase PostgreSQL 17 container, verified every manifest table
  count and RLS, rechecked the archive/media hashes, and published no private artifact.
  The earlier run `33291537676` failed safely during local container initialization
  before accessing a snapshot; the workflow was corrected and pinned.
- `BACKUPS_ENABLED=true` was set on 2026-08-30. The project-wide workflow is scheduled
  once daily at 09:23 UTC and still downloads/verifies every newly uploaded snapshot.
  A future full hosted Supabase application drill should additionally test Auth login
  and Storage API behavior; the database/media archive itself is recovery-tested.
- The owner has recovery copies of `RESTIC_PASSWORD` and `BACKUP_DATABASE_URL` in
  Bitwarden. Recovery copies of the dedicated Supabase Storage secret and R2 key pair
  still need to be created by rotating those credentials, saving the newly shown
  values in Bitwarden, updating the GitHub secrets, retesting, and revoking the old
  credentials. GitHub cannot reveal existing secret values.
- Usage monitoring and an independent stale-backup alert are not configured. A
  Cloudflare budget notification is not a spending cap. Do not promise zero charges
  or continuous monitoring just because an assistant is connected.
- Do not add age-based R2 expiration to restic objects; retained snapshots can still
  reference older chunks. No automatic pruning is currently enabled.

Keep secrets in the appropriate secret store/password manager, never in chat,
frontend variables, handoff files, or commits. Old handoff references to local
credential files are not evidence that those credentials still work.

Reference: [Cloudflare MCP authorization](https://developers.cloudflare.com/agent-setup/visual-studio-code/).
