// Real restore into disposable LOCAL Postgres. No production target is accepted.
import { Client } from 'pg';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HOST, TAG, quote } from './core.mjs';
import { command, findManifest, verifyPayload } from './run.mjs';

const target = new URL(process.env.RESTORE_DRILL_DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/lab_backup_drill' || target.search)
  throw new Error('Restore drill accepts only localhost/lab_backup_drill');
const taskRoot = await mkdtemp(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'the-lab-drill-'));
const config = { host: target.hostname, port: Number(target.port || 5432), database: 'lab_backup_drill',
  user: decodeURIComponent(target.username), password: decodeURIComponent(target.password), ssl: false };
const client = new Client(config);
try {
  const snapshots = JSON.parse(await command('restic', ['snapshots', '--json', '--host', HOST, '--tag', `${TAG},verified`]));
  const snapshot = snapshots.sort((a, b) => a.time.localeCompare(b.time)).at(-1);
  if (!snapshot) throw new Error('No verified backup available');
  await command('restic', ['restore', snapshot.id, '--target', taskRoot, '--verify']);
  const file = await findManifest(taskRoot), root = path.dirname(file), manifest = JSON.parse(await readFile(file, 'utf8'));
  await verifyPayload(root, manifest);
  await client.connect();
  const count = await client.query("select count(*)::int as n from pg_tables where schemaname not in ('pg_catalog','information_schema')");
  if (count.rows[0].n) throw new Error('Restore drill database must be empty');
  // Local test roles only; actual disaster recovery requires reviewing roles.sql and provider roles.
  for (const name of manifest.roles) {
    if (!(await client.query('select 1 from pg_roles where rolname=$1', [name])).rowCount)
      await client.query(`create role ${quote(name)}`);
  }
  await command('pg_restore', ['--exit-on-error', '--single-transaction', '--dbname', 'lab_backup_drill',
    path.join(root, 'database.dump')], { env: { ...process.env, PGHOST: config.host, PGPORT: String(config.port),
    PGUSER: config.user, PGPASSWORD: config.password, PGSSLMODE: 'disable' } });
  for (const [table, expected] of Object.entries(manifest.tables)) {
    const [schema, name] = table.split('.');
    const actual = Number((await client.query(`select count(*)::text as n from ${quote(schema)}.${quote(name)}`)).rows[0].n);
    if (actual !== expected) throw new Error('Restored row counts do not match manifest');
  }
  const state = await client.query("select relrowsecurity from pg_class where oid='public.user_state'::regclass");
  if (!state.rows[0]?.relrowsecurity) throw new Error('Restored user data is missing RLS');
  if (process.env.BACKUP_FIXTURE_TEST === 'true') {
    if (!(await client.query("select 1 from pg_policy where polname='fixture_read'")).rowCount) throw new Error('RLS policy not restored');
    if (!(await client.query("select 1 from pg_trigger where tgname='fixture_guard'")).rowCount) throw new Error('Trigger not restored');
    if (!(await client.query("select has_table_privilege('lab_fixture_reader','public.user_state','SELECT') as ok")).rows[0].ok)
      throw new Error('Grant not restored');
    const next = await client.query('insert into public.steps(steps) values(1) returning id');
    if (Number(next.rows[0].id) !== 2) throw new Error('Sequence not restored');
  }
  console.log('Disposable restore passed: table counts, RLS, and fixture security checks.');
} finally {
  await client.end().catch(() => {});
  if (path.basename(taskRoot).startsWith('the-lab-drill-')) await rm(taskRoot, { recursive: true, force: true });
}
