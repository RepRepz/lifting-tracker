// Synthetic CI data only. This script MUST NEVER connect to a non-loopback database.
import { Client } from 'pg';
import { configuration } from './core.mjs';
const config = configuration(process.env, true);
if (config.database !== 'lab_backup_source') throw new Error('Fixture requires lab_backup_source');
const client = new Client({ ...config, ssl: false });
await client.connect();
try {
  await client.query(`
    create schema private; create schema auth; create schema storage;
    create role lab_fixture_reader;
    create table auth.users(id uuid primary key, encrypted_password text);
    create table public.profiles(user_id uuid primary key references auth.users(id), username text);
    create table public.user_state(user_id uuid primary key references auth.users(id), value jsonb, updated_at timestamptz default now());
    create table public.steps(id bigint generated always as identity primary key, steps integer);
    create table public.groups(id bigint primary key);
    create table public.group_members(id bigint primary key);
    create table public.duels(id bigint primary key);
    create table public.user_state_history(id bigint primary key, value jsonb);
    create table private.user_state_versions(id bigint primary key, value jsonb);
    create table storage.buckets(id text primary key);
    create table storage.objects(id uuid primary key, bucket_id text, name text, updated_at timestamptz, version text, metadata jsonb);
    insert into auth.users values ('00000000-0000-4000-8000-000000000001','fixture-hash-not-a-real-user');
    insert into public.profiles values ('00000000-0000-4000-8000-000000000001','synthetic');
    insert into public.user_state(user_id,value) values ('00000000-0000-4000-8000-000000000001','{"log":[{"id":1}],"cardio":[],"bodyweight":[]}');
    insert into public.steps(steps) values (10000);
    insert into private.user_state_versions values(1,'{"log":[{"id":1}]}');
    alter table public.user_state enable row level security;
    create policy fixture_read on public.user_state for select to lab_fixture_reader using (true);
    grant select on public.user_state to lab_fixture_reader;
    create function private.fixture_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger fixture_guard before update on public.user_state for each row execute function private.fixture_trigger();
  `);
} finally { await client.end(); }
console.log('Synthetic fixture ready.');
