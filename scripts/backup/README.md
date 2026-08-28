# The Lab: encrypted off-site recovery

## Status and scope

The workflow is **not active** until the private destination and secrets are configured,
a first production backup verifies, and `BACKUPS_ENABLED=true` is set. A green synthetic
test is NOT evidence that production data is backed up. No live restore has been tested
until a production archive has been restored into a disposable compatible Supabase stack.

This uses PostgreSQL's consistent snapshot export and `pg_dump`, then restic encryption,
compression and deduplication. Restic encrypts content and filenames before upload. It
stores only new chunks, although each run still reads the database and existing media
from Supabase. This is not an incremental source export.

The database archive preserves all dumpable schemas, rows, functions, triggers, RLS,
grants, sequences and auth users/password hashes. Separate `roles.sql` omits database-role
passwords. Standard Storage objects (including private exercise images/GIFs) are copied
with an encrypted mapping from file hash to bucket/name. Nothing is uploaded as a GitHub
artifact, committed to git, or printed as SQL/JSON in public Actions logs.

Provider configuration is NOT in pg_dump: OAuth/email/Turnstile settings, function secrets,
database-role passwords, Supabase encryption root keys and service/API keys must be kept
in a password manager. Keep source code/migrations separately as well. Vector/analytics
storage is not supported by this standard-object exporter; don't enable it without
extending and testing recovery coverage.

## One-time setup (owner)

1. Use an existing Cloudflare account or create one yourself. R2 enrollment can require
   billing details; the workflow does not enroll you or buy anything. Create a private
   Standard-storage bucket named `the-lab-backups`. Do NOT enable r2.dev, public access,
   or a public custom domain. Do NOT apply an object-age lifecycle to restic pack files:
   an old pack may still be needed by a recent snapshot.
2. Create an S3-compatible credential restricted to this one bucket. Put it in the
   GitHub **backups environment secrets**, not frontend variables, commits or chat.
3. Get the Supabase **session pooler** connection string (port 5432) from Connect, using
   the existing database password. Do not reset a production password casually. Direct
   connections also work where IPv6 is supported. Use the built-in postgres account for
   complete logical export unless you have tested a restricted role's permissions across
   auth/storage/private schemas. This credential is powerful: protect the environment.
4. Generate a random backup password (32+ characters) in your password manager. Keep an
   offline recovery copy. Losing it means losing access to all encrypted snapshots.
5. Configure these environment secrets:

   | Secret | Value |
   | --- | --- |
   | `BACKUP_DATABASE_URL` | `postgresql://postgres.PROJECT:URL_ENCODED_PASSWORD@SESSION_POOLER_HOST:5432/postgres` (no query string) |
   | `BACKUP_DB_CA_PEM` | Supabase's database CA certificate, if required by its TLS chain |
   | `BACKUP_STORAGE_SERVICE_KEY` | Server-only service-role/secret API key; required whenever Storage contains files |
   | `RESTIC_REPOSITORY` | `s3:https://ACCOUNT_ID.r2.cloudflarestorage.com/the-lab-backups` |
   | `RESTIC_PASSWORD` | Independent randomly generated encryption password |
   | `BACKUP_S3_ACCESS_KEY_ID` | Bucket-scoped R2 access key |
   | `BACKUP_S3_SECRET_ACCESS_KEY` | Bucket-scoped R2 secret |

   The URL must identify project `ylwibyjwzjdzhiorujla`; TLS certificates and hostnames
   are verified, never silently bypassed. PostgreSQL 18 clients must be available.
   Use GitHub environment branch restrictions permitting only main. Protect changes
   to workflow/scripts: code on main with these secrets could read production data.
6. Run **Encrypted off-site backup** manually with `initialize=true` once. A normal run
   NEVER initializes a missing repository: a deleted/mistyped repository fails loudly.
7. Run it a second time normally, then restore a production archive into an isolated,
   compatible Supabase test instance. Verify logs, auth, RLS, steps and media before
   declaring the deployment fully recovery-tested.
8. Only then set repository variable `BACKUPS_ENABLED=true`. The schedule is 05:23 and
   17:23 UTC (roughly every 12 hours). GitHub scheduling can be delayed and public-repo
   schedules can be disabled after inactivity. Enable failure notifications for this
   workflow and use an independent dead-man monitor with a 26-hour threshold before
   relying on unattended operation. No independent monitor is configured by this repo.

No owner setup step should expose secrets in chat. `gh secret set NAME --env backups`
can accept a value privately from stdin; do not put values in command-line arguments.

## Success means

- All required account/log/step/group/history/auth/storage tables are readable and present.
- Database counts and the dump use the same repeatable-read snapshot.
- Missing media, size mismatches, or concurrent Storage updates cause failure.
- Database + downloaded media cannot exceed 64 MiB per run (about 4 GiB/31 days at
  twice daily, before protocol overhead). This is a safety ceiling, not a quota meter:
  normal app traffic and other exports ALSO consume Supabase egress. Review actual usage.
- The encrypted archive is downloaded again and every recorded file's SHA-256/size is
  checked. `pg_restore --list` checks archive readability; it is NOT a real DB restore.
- On Sundays, the repository also gets `restic check --read-data`.
- Large log drops or missing accounts compared with the last verified copy are archived
  as `suspect`, not `verified`, and fail the run. Legitimate account deletions can trigger
  this alert too; investigate rather than automatically resetting the baseline.

Temporary plaintext is confined to a private temporary directory and removed in `finally`.
Hosted runners are ephemeral, but filesystem removal is not a forensic secure erase.
No old off-site copies are ever deleted by the scheduled backup job.

## Retention and cost

Initially **no automatic deletion**: keep the last good recovery copy safe while validating
the new system. Restic deduplicates/compresses repeated data. Review growth monthly; do
not promise zero cost solely from this configuration. R2 Standard currently includes
10 GB-month and request allowances, while overages can be billed.

After a verified restore and a privacy/retention review, the intended off-site window is
90 days. An administrator can preview `restic forget --host the-lab-backup --tag
project-ylwibyjwzjdzhiorujla --group-by host --keep-within 90d --dry-run`. Do not actually
forget/prune while any loss investigation is unresolved, the most recent verified copy
is stale, or fewer than two good independent snapshots exist. Enabling automated pruning
is a separate explicit change, not part of this initial rollout. Deletion requests must
include this off-site retention window in the published privacy explanation before enabling
the schedule. Deleted records must not be resurrected during a restore; keep deletion
requests/tombstones in the recovery review.

The repository password authenticates encryption, not immutability. A stolen bucket write
credential could still erase backups. For stronger protection add a second independently
credentialed copy or a tested append-only backend; do not claim this bucket is immutable.

## Disaster recovery (admin only)

1. Stop writes on the affected account/project and preserve current data/device caches.
   Do not delete the bad copy or overwrite production as the first step.
2. Access the private repository using the password-manager credentials on a trusted
   machine. Use `restic snapshots --host the-lab-backup --tag project-ylwibyjwzjdzhiorujla`
   and choose a verified snapshot from before the incident. Download it into an empty
   private directory using `restic restore SNAPSHOT_ID --target RECOVERY_DIRECTORY --verify`.
3. Verify the manifest hashes, project, dates and table counts. Keep the original archive
   unchanged. The manifest maps hashed media filenames to their original bucket and path.
4. Restore into a **disposable matching Supabase stack**, not the production database.
   Full pg_dump archives include Supabase-managed schemas/extensions/owners. A stock
   PostgreSQL install may lack these extensions/roles. Review roles.sql, archive contents
   and provider-specific restoration steps before importing. Do not blindly run
   `--clean`, recreate managed schemas, or replay setup migrations against live data.
5. Validate exact table counts, representative account logs, sequence positions, functions,
   trigger behavior, RLS/grants and that users cannot read each other's private rows. A
   successful `pg_restore` alone does not prove the app/security is correct.
6. Restore standard media through the Storage API into a separate test project, preserving
   bucket privacy, names, MIME types and ownership metadata. Database metadata alone does
   not restore file bytes. Verify both owner access and non-owner denial.
7. For a partial loss, extract and merge only the missing records into the current account.
   Retain newer entries and respect later deletions/account-deletion requests. Obtain owner
   confirmation for the exact production changes. For total loss, review auth/provider
   settings, rotate credentials where appropriate and test the new project before cutover.

`restore-drill.mjs` deliberately accepts ONLY a loopback `lab_backup_drill` database and
refuses a nonempty target. CI runs an actual encrypted synthetic round trip and checks row
counts, policies, grants, triggers and sequence state. It does not claim production
extensions, auth login or real media recovery have already been tested.

References:
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/platform/backups
- https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html
- https://restic.readthedocs.io/en/stable/060_forget.html
- https://developers.cloudflare.com/r2/pricing/
