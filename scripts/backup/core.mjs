import { createHash } from 'node:crypto';
import path from 'node:path';

export const PROJECT = 'ylwibyjwzjdzhiorujla';
export const HOST = 'the-lab-backup';
export const TAG = `project-${PROJECT}`;
export const LIMIT = 64 * 1024 * 1024;
export const REQUIRED_TABLES = ['public.user_state', 'public.profiles', 'public.steps',
  'public.groups', 'public.group_members', 'public.duels', 'public.user_state_history',
  'private.user_state_versions', 'auth.users', 'storage.objects', 'storage.buckets'];
export const sha = value => createHash('sha256').update(value).digest('hex');
export const quote = identifier => '"' + identifier.replaceAll('"', '""') + '"';

export function storageRequestHeaders(key) {
  if (!key) throw new Error('Storage download credential is missing');
  const headers = { apikey: key };
  // Modern sb_secret keys are opaque API keys, not JWTs. Legacy service_role keys
  // still need the bearer header for Storage authorization.
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export function safeFailureStage(stage, error) {
  if (stage !== 'database connection') return stage;
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  if (code === '28P01' || /password authentication failed|SASL.*password/i.test(message))
    return 'database authentication (password rejected)';
  if (/tenant or user not found/i.test(message)) return 'database pooler identity';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED'].includes(code))
    return 'database network connection';
  if (/certificate|self[- ]signed|unable to verify/i.test(message) || code.includes('CERT'))
    return 'database TLS verification';
  return stage;
}

export function configuration(env, fixture = false) {
  const required = ['BACKUP_DATABASE_URL', 'RESTIC_REPOSITORY', 'RESTIC_PASSWORD'];
  for (const name of required) if (!env[name]) throw new Error(`Missing ${name}`);
  const db = new URL(env.BACKUP_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.password || db.search)
    throw new Error('Database URL must contain credentials and no query parameters; TLS is enforced separately');
  const user = decodeURIComponent(db.username);
  if (fixture) {
    if (!['localhost', '127.0.0.1'].includes(db.hostname) || !path.isAbsolute(env.RESTIC_REPOSITORY))
      throw new Error('Fixture mode accepts only a loopback database and local repository');
  } else {
    const direct = db.hostname === `db.${PROJECT}.supabase.co` && user === 'postgres';
    const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(db.hostname) && user === `postgres.${PROJECT}`;
    if (!(direct || pooler) || (db.port && db.port !== '5432'))
      throw new Error('Use this project’s direct connection or session pooler on port 5432');
    const repo = env.RESTIC_REPOSITORY;
    if (!repo.startsWith('s3:https://')) throw new Error('Off-site repository must use S3 over HTTPS');
    const destination = new URL(repo.slice(3));
    if (!destination.pathname.includes('/the-lab-backups') || destination.hostname.endsWith('.supabase.co') || destination.username || destination.password)
      throw new Error('Use a dedicated off-site the-lab-backups bucket/prefix, without URL credentials');
    for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])
      if (!env[name]) throw new Error(`Missing ${name}`);
    if (env.RESTIC_PASSWORD.length < 32) throw new Error('Use an independent random backup password of at least 32 characters');
  }
  return { host: db.hostname, port: Number(db.port || 5432), user,
    password: decodeURIComponent(db.password), database: decodeURIComponent(db.pathname.slice(1)) || 'postgres', fixture };
}

export function validateInventory(tables) {
  if (!tables || Object.values(tables).some(n => !Number.isSafeInteger(n) || n < 0))
    throw new Error('Invalid backup table counts');
  for (const name of REQUIRED_TABLES) if (!(name in tables)) throw new Error(`Backup missing required table: ${name}`);
  if (tables['public.profiles'] < 1 || tables['public.user_state'] < 1 || tables['auth.users'] < 1)
    throw new Error('Refusing to label an empty account database as a healthy backup');
}

export function suspiciousLoss(previous, next) {
  if (!previous) return [];
  const reasons = [];
  for (const name of ['public.user_state', 'public.profiles', 'auth.users', 'public.steps']) {
    const before = previous.tables[name] || 0, after = next.tables[name] || 0;
    if (before >= 3 && after < before * .8) reasons.push(`row-count decrease in ${name}`);
  }
  for (const [id, before] of Object.entries(previous.users || {})) {
    const after = next.users?.[id];
    if (!after) { reasons.push('account missing compared with last verified backup'); continue; }
    for (const key of ['log', 'bodyweight', 'cardio']) {
      if (before[key] >= 5 && before[key] - after[key] >= 2 && after[key] < before[key] * .85)
        reasons.push(`large ${key} decrease in a saved account`);
    }
  }
  return [...new Set(reasons)];
}

export function safeFile(root, relative) {
  if (!relative || relative.includes('\\') || path.posix.isAbsolute(relative) || relative.split('/').some(p => p === '..' || p === '' || p.includes(':')))
    throw new Error('Unsafe archive path');
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('Path escapes archive');
  return resolved;
}

export function storageFingerprint(objects) {
  return sha(JSON.stringify(objects.map(o => [o.id, o.bucket_id, o.name, o.updated_at, o.version, o.size])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))));
}

export function archivePath(snapshot, filename) {
  if (snapshot.paths?.length !== 1) throw new Error('Unexpected snapshot root');
  return path.posix.join(snapshot.paths[0].replaceAll('\\', '/'), filename);
}
