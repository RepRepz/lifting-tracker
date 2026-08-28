import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { configuration, PROJECT, REQUIRED_TABLES, validateInventory, suspiciousLoss, safeFile,
  storageFingerprint, sha } from './core.mjs';
import { verifyPayload } from './run.mjs';
import { normalizeSaveError } from '../../src/lib/save-errors.js';

const valid = { BACKUP_DATABASE_URL: `postgresql://postgres.${PROJECT}:secret@aws-0-us-east-2.pooler.supabase.com:5432/postgres`,
  RESTIC_REPOSITORY: 's3:https://example.r2.cloudflarestorage.com/the-lab-backups',
  RESTIC_PASSWORD: 'random-password-placeholder-32-characters', AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test' };
test('scheduled backups run once daily and remain opt-in', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/offsite-backup.yml', import.meta.url), 'utf8');
  assert.deepEqual([...workflow.matchAll(/cron:\s*'([^']+)'/g)].map(m => m[1]), ['23 9 * * *']);
  assert.ok(workflow.includes("vars.BACKUPS_ENABLED == 'true'"));
});
test('production requires TLS off-site and the correct Supabase project', () => {
  assert.equal(configuration(valid).port, 5432);
  for (const db of [valid.BACKUP_DATABASE_URL.replace('5432', '6543'),
    valid.BACKUP_DATABASE_URL.replace(PROJECT, 'wrong-project'), valid.BACKUP_DATABASE_URL + '?sslmode=disable'])
    assert.throws(() => configuration({ ...valid, BACKUP_DATABASE_URL: db }));
  assert.throws(() => configuration({ ...valid, RESTIC_REPOSITORY: '/tmp/not-offsite' }));
  assert.throws(() => configuration({ ...valid, RESTIC_PASSWORD: 'short' }));
});
test('fixture mode cannot reach a live database', () => {
  assert.throws(() => configuration(valid, true));
  assert.equal(configuration({ ...valid, BACKUP_DATABASE_URL: 'postgres://postgres:test@127.0.0.1/lab',
    RESTIC_REPOSITORY: path.join(os.tmpdir(), 'lab-test') }, true).fixture, true);
});
test('empty accounts or a missing table cannot be certified', () => {
  const tables = Object.fromEntries(REQUIRED_TABLES.map(t => [t, 1]));
  validateInventory(tables);
  assert.throws(() => validateInventory({ ...tables, 'auth.users': 0 }));
  assert.throws(() => validateInventory({ ...tables, 'auth.users': NaN }));
  delete tables['private.user_state_versions'];
  assert.throws(() => validateInventory(tables));
});
test('loss detection preserves last good backup for missing users or shrinking logs', () => {
  const a = { tables: { 'public.user_state': 10 }, users: { abc: { log: 100, cardio: 8, bodyweight: 10 } } };
  assert.deepEqual(suspiciousLoss(a, structuredClone(a)), []);
  assert.ok(suspiciousLoss(a, { tables: { 'public.user_state': 5 }, users: {} }).length);
  const b = structuredClone(a); b.users.abc.log = 72;
  assert.ok(suspiciousLoss(a, b).length);
  b.users.abc.log = 99;
  assert.deepEqual(suspiciousLoss(a, b), []);
});
test('restore paths reject traversal and platform-specific escapes', () => {
  for (const rel of ['../secret', '/etc/passwd', 'C:/secret', 'media/../../secret', 'media\\secret', ''])
    assert.throws(() => safeFile(os.tmpdir(), rel));
  assert.ok(safeFile(os.tmpdir(), 'media/abc').startsWith(os.tmpdir()));
});
test('storage changes are detected, list order does not matter', () => {
  const a = { id: '1', bucket_id: 'media', name: 'one', updated_at: '2026', version: 'a', size: '5' };
  const b = { ...a, id: '2', name: 'two' };
  assert.equal(storageFingerprint([a, b]), storageFingerprint([b, a]));
  assert.notEqual(storageFingerprint([a]), storageFingerprint([{ ...a, version: 'b' }]));
});
test('shrink errors stop saving instead of entering conflict merge', () => {
  assert.equal(normalizeSaveError({ code: 'P0001', message: 'STATE_SHRINK_BLOCKED' }).code, 'STATE_SHRINK_BLOCKED');
  assert.equal(normalizeSaveError({ code: 'P0001', message: 'STATE_CONFLICT' }).code, 'STATE_CONFLICT');
  const unknown = { code: 'P0001', message: 'Other validation error' };
  assert.equal(normalizeSaveError(unknown), unknown);
});
test('downloaded archives reject corrupted files and incomplete media inventories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lab-backup-unit-'));
  try {
    await mkdir(path.join(root, 'recovery'));
    await mkdir(path.join(root, 'media'));
    const files = { 'database.dump': 'synthetic dump', 'roles.sql': 'synthetic roles',
      'recovery/README.md': 'recovery steps', 'media/abc': 'synthetic media' };
    const manifest = { project: PROJECT, format: 1, tables: Object.fromEntries(REQUIRED_TABLES.map(t => [t, 1])),
      files: {}, storage: [{ file: 'media/abc', size: '15' }] };
    for (const [name, text] of Object.entries(files)) {
      await writeFile(safeFile(root, name), text);
      manifest.files[name] = { bytes: Buffer.byteLength(text), sha256: sha(text) };
    }
    await verifyPayload(root, manifest);
    await assert.rejects(verifyPayload(root, { ...manifest, storage: [] }));
    await assert.rejects(verifyPayload(root, { ...manifest, storage: [{ file: 'media/missing', size: '15' }] }));
    await writeFile(path.join(root, 'database.dump'), 'corrupted dump');
    await assert.rejects(verifyPayload(root, manifest));
  } finally { await rm(root, { recursive: true, force: true }); }
});
