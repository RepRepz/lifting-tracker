import { Client } from 'pg';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, stat, readdir, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT, HOST, TAG, LIMIT, REQUIRED_TABLES, configuration, quote, sha,
  validateInventory, suspiciousLoss, storageFingerprint, safeFile, archivePath } from './core.mjs';

// Never forward child stderr: pg_dump/HTTP errors can contain connection credentials or user data.
export function command(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(program, args, { env: options.env || process.env,
      cwd: options.cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', overflow = false;
    proc.stdout.on('data', chunk => {
      if (output.length + chunk.length > 8 * 1024 * 1024) { overflow = true; proc.kill(); }
      else output += chunk;
    });
    proc.stderr.resume();
    const timer = setTimeout(() => proc.kill(), options.timeout || 15 * 60_000);
    proc.on('error', () => { clearTimeout(timer); reject(new Error(`${program} could not start`)); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || overflow) reject(new Error(`${program} failed (${code ?? 'timeout'})`));
      else resolve(output);
    });
  });
}

export async function digestFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function findManifest(root) {
  const found = [];
  async function scan(dir, depth) {
    if (depth > 20) throw new Error('Unexpected restore directory depth');
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in backup');
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(p, depth + 1);
      else if (entry.name === 'manifest.json') found.push(p);
    }
  }
  await scan(root, 0);
  if (found.length !== 1) throw new Error('Expected exactly one backup manifest');
  return found[0];
}

export async function verifyPayload(root, manifest) {
  if (manifest.project !== PROJECT || manifest.format !== 1) throw new Error('Wrong backup project or format');
  validateInventory(manifest.tables);
  for (const required of ['database.dump', 'roles.sql', 'recovery/README.md'])
    if (!manifest.files?.[required]) throw new Error(`Missing archive file: ${required}`);
  for (const [name, info] of Object.entries(manifest.files)) {
    const file = safeFile(root, name);
    if ((await stat(file)).size !== info.bytes || await digestFile(file) !== info.sha256)
      throw new Error('Restored file failed integrity verification');
  }
  if (manifest.storage.length !== Object.keys(manifest.files).filter(n => n.startsWith('media/')).length)
    throw new Error('Missing storage objects');
  const mediaPaths = new Set();
  for (const object of manifest.storage) {
    if (!object.file?.startsWith('media/') || !manifest.files[object.file] || mediaPaths.has(object.file))
      throw new Error('Missing or duplicate media file');
    if (manifest.files[object.file].bytes !== Number(object.size)) throw new Error('Media size does not match inventory');
    mediaPaths.add(object.file);
  }
}

const objectsSQL = `select id::text,bucket_id,name,updated_at::text,
  to_jsonb(o)->>'version' as version,coalesce((metadata->>'size')::bigint,0)::text as size
  from storage.objects o order by bucket_id,name`;

export async function runBackup({ fixture = false, initialize = false, fullCheck = false } = {}) {
  const config = configuration(process.env, fixture);
  const taskRoot = await mkdtemp(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'the-lab-backup-'));
  let client, stage = 'preflight';
  try {
    const root = path.join(taskRoot, 'payload');
    await mkdir(root, { mode: 0o700 });
    const ca = process.env.BACKUP_DB_CA_PEM;
    const caPath = path.join(taskRoot, 'database-ca.pem');
    if (ca) await writeFile(caPath, ca, { mode: 0o600 });
    const pgEnv = { ...process.env, PGHOST: config.host, PGPORT: String(config.port),
      PGUSER: config.user, PGPASSWORD: config.password, PGDATABASE: config.database,
      PGSSLMODE: fixture ? 'disable' : 'verify-full', PGSSLROOTCERT: ca ? caPath : 'system',
      PGCONNECT_TIMEOUT: '20', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=900000' };
    const resticEnv = { ...process.env, RESTIC_CACHE_DIR: path.join(taskRoot, 'cache') };
    const restic = args => command('restic', args, { env: resticEnv, cwd: taskRoot });
    if (initialize) await restic(['init']); // Explicit only; a missing repo during normal runs MUST fail.
    const oldSnapshots = JSON.parse(await restic(['snapshots', '--json', '--host', HOST, '--tag', `${TAG},verified`]));
    const previous = oldSnapshots.sort((a, b) => a.time.localeCompare(b.time)).at(-1);
    let oldManifest;
    if (previous) oldManifest = JSON.parse(await restic(['dump', previous.id, archivePath(previous, 'manifest.json')]));
    stage = 'database export';
    client = new Client({ ...config, ssl: fixture ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
      connectionTimeoutMillis: 20_000, statement_timeout: 900_000 });
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = (await client.query('SELECT pg_export_snapshot() as id')).rows[0].id;
    const tableRows = (await client.query(`select n.nspname as schema,c.relname as name
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind in ('r','p') and n.nspname in ('public','private','auth','storage','supabase_migrations')
      order by 1,2`)).rows;
    const tables = {};
    for (const table of tableRows) {
      const name = `${quote(table.schema)}.${quote(table.name)}`;
      tables[`${table.schema}.${table.name}`] = Number((await client.query(`select count(*)::text as n from ${name}`)).rows[0].n);
    }
    validateInventory(tables);
    const users = {};
    for (const row of (await client.query(`select user_id::text,
      jsonb_array_length(coalesce(value->'log','[]')) as log,
      jsonb_array_length(coalesce(value->'bodyweight','[]')) as bodyweight,
      jsonb_array_length(coalesce(value->'cardio','[]')) as cardio from public.user_state`)).rows) {
      users[sha(row.user_id)] = { log: row.log, bodyweight: row.bodyweight, cardio: row.cardio };
    }
    const objects = (await client.query(objectsSQL)).rows;
    if (objects.reduce((sum, o) => sum + Number(o.size), 0) > LIMIT)
      throw new Error('Media export exceeds configured transfer budget');
    const roles = (await client.query("select rolname from pg_roles where rolname not like 'pg\\_%' escape '\\' order by rolname")).rows.map(r => r.rolname);
    const serverVersion = (await client.query('show server_version')).rows[0].server_version;
    await command('pg_dump', ['--format=custom', '--compress=0', '--lock-wait-timeout=30s',
      `--snapshot=${snapshot}`, '--file', path.join(root, 'database.dump')], { env: pgEnv });
    // Auth password hashes ARE in auth.users; database-role passwords are intentionally omitted.
    await command('pg_dumpall', ['--roles-only', '--no-role-passwords', '--file', path.join(root, 'roles.sql')], { env: pgEnv });
    await command('pg_restore', ['--list', path.join(root, 'database.dump')]);
    stage = 'media export';
    await mkdir(path.join(root, 'media'));
    let usedBytes = (await stat(path.join(root, 'database.dump'))).size;
    if (usedBytes > LIMIT) throw new Error('Database export exceeds configured transfer budget');
    if (objects.length && !process.env.BACKUP_STORAGE_SERVICE_KEY) throw new Error('Storage download credential is missing; refusing incomplete backup');
    const storage = [];
    for (const object of objects) {
      const file = `media/${sha(`${object.bucket_id}/${object.name}`)}`;
      const url = `https://${PROJECT}.supabase.co/storage/v1/object/${encodeURIComponent(object.bucket_id)}/${object.name.split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetch(url, { headers: { apikey: process.env.BACKUP_STORAGE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.BACKUP_STORAGE_SERVICE_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(120_000) });
      if (!response.ok || !response.body) throw new Error('A storage object could not be downloaded');
      let bytes = 0;
      const budget = new Transform({ transform(chunk, encoding, callback) {
        bytes += chunk.length; usedBytes += chunk.length;
        callback(usedBytes > LIMIT ? new Error('Backup exceeds 64 MiB source transfer budget') : null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), budget, createWriteStream(safeFile(root, file), { mode: 0o600 }));
      if (bytes !== Number(object.size)) throw new Error('Storage object size changed while backing up');
      storage.push({ ...object, file });
    }
    await client.query('COMMIT');
    // Database and Storage cannot be atomically snapshotted together. Detect concurrent changes.
    if (storageFingerprint(objects) !== storageFingerprint((await client.query(objectsSQL)).rows))
      throw new Error('Storage changed during export; retry to obtain a consistent copy');
    await client.end(); client = null;
    stage = 'recovery instructions';
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    await mkdir(path.join(root, 'recovery/migrations'), { recursive: true });
    await writeFile(path.join(root, 'recovery/README.md'), await readFile(path.join(repoRoot, 'scripts/backup/README.md')));
    for (const file of await readdir(path.join(repoRoot, 'supabase/migrations'))) {
      if (file.endsWith('.sql')) await writeFile(path.join(root, 'recovery/migrations', file), await readFile(path.join(repoRoot, 'supabase/migrations', file)));
    }
    const manifest = { format: 1, project: PROJECT, createdAt: new Date().toISOString(), serverVersion,
      commit: process.env.GITHUB_SHA || 'local', tables, users, roles, storage, files: {},
      limitations: ['Provider settings, external secrets, and encryption root keys must be preserved separately.',
        'Snapshot covers PostgreSQL data/schema/ACLs and standard Storage objects, not vectors or analytics buckets.'] };
    async function listFiles(dir, prefix = '') {
      for (const item of await readdir(dir, { withFileTypes: true })) {
        const rel = prefix + item.name, full = path.join(dir, item.name);
        if (item.isDirectory()) await listFiles(full, rel + '/');
        else manifest.files[rel] = { bytes: (await stat(full)).size, sha256: await digestFile(full) };
      }
    }
    await listFiles(root);
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    const losses = suspiciousLoss(oldManifest, manifest);
    stage = 'encrypted off-site upload';
    const output = await restic(['backup', '--json', '--host', HOST, '--tag', TAG,
      '--tag', 'candidate', '--force', 'payload']);
    const summary = output.trim().split('\n').map(line => JSON.parse(line)).find(line => line.message_type === 'summary');
    if (!summary?.snapshot_id) throw new Error('No completed off-site snapshot returned');
    const id = summary.snapshot_id;
    stage = 'download and integrity verification';
    const target = path.join(taskRoot, 'verification');
    await restic(['restore', id, '--target', target, '--verify']);
    const restoredManifestPath = await findManifest(target);
    const restored = JSON.parse(await readFile(restoredManifestPath, 'utf8'));
    if (sha(JSON.stringify(restored)) !== sha(JSON.stringify(manifest))) throw new Error('Restored manifest differs');
    await verifyPayload(path.dirname(restoredManifestPath), restored);
    await command('pg_restore', ['--list', path.join(path.dirname(restoredManifestPath), 'database.dump')]);
    if (fullCheck) await restic(['check', '--read-data']);
    await restic(['tag', '--remove', 'candidate', '--add', losses.length ? 'suspect' : 'verified', id]);
    if (losses.length) throw new Error('Saved suspect snapshot; data-loss warning requires review. Prior verified backups retained.');
    // No automatic forgetting/pruning: suspected loss must NEVER delete the last good copy.
    console.log('Encrypted backup uploaded, downloaded, and integrity-verified. No backup history was deleted.');
  } catch (error) {
    // Only operational stage is public; row values, account IDs and upstream error text stay private.
    throw new Error(`Backup failed during ${stage}. No old backups were deleted. Check credentials/configuration and investigate privately.`, { cause: error });
  } finally {
    if (client) await client.end().catch(() => {});
    // Only remove the uniquely-created temporary directory, never caller-provided paths.
    if (path.basename(taskRoot).startsWith('the-lab-backup-')) await rm(taskRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBackup({ fixture: process.argv.includes('--fixture'), initialize: process.argv.includes('--init'),
    fullCheck: process.argv.includes('--full-check') }).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
