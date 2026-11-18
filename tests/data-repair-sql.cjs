// 003_data_repair.sql against a real Postgres (PGlite).
//
// The migration re-keys a primary key that foreign keys all over the schema
// point at, so "it looks right" is not good enough. These tests reproduce the
// exact failure a member hits - sync_current_user() returning
// 'profile_conflict' - repair it, and check that every dependent row followed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { PGlite } = require('@electric-sql/pglite');
const enabled = !!PGlite;
const sqltest = (name, fn) => test(name, { skip: !enabled }, fn);

const AUTH  = '00000000-0000-4000-8000-00000000aa01'; // drifted account's auth id
const STALE = '00000000-0000-4000-8000-00000000bb01'; // the public.users id that owns its email
const OK    = '00000000-0000-4000-8000-00000000cc01'; // healthy account, but role IS NULL

let db;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args = []) => (await rows(sql, args))[0];

if (enabled) test.before(async () => {
  db = new PGlite();

  // The parts of the live schema 002 and 003 actually touch.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $f$ SELECT gen_random_uuid() $f$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $f$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE public.users(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) NOT NULL UNIQUE,
      password_hash varchar(255), name varchar(255), role varchar(50) DEFAULT 'member',
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid REFERENCES public.users(id), updated_by uuid REFERENCES public.users(id));
    CREATE TABLE public.members(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
      first_name varchar(100), last_name varchar(100),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id uuid NOT NULL REFERENCES public.members(id), note text);
    CREATE TABLE public.audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      performed_by uuid REFERENCES public.users(id), action text);
    ALTER TABLE public.users ADD CONSTRAINT users_role_check
      CHECK (role IN ('member','trainer','admin','super_admin')) NOT VALID;
    CREATE FUNCTION public.is_api_caller() RETURNS boolean LANGUAGE sql STABLE AS $f$
      SELECT current_user IN ('authenticated','anon') $f$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $f$
      SELECT coalesce((SELECT role IN ('admin','super_admin') FROM public.users
                        WHERE id = auth.uid() AND is_active), false) $f$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $f$
      SELECT coalesce((SELECT role = 'super_admin' FROM public.users
                        WHERE id = auth.uid() AND is_active), false) $f$;
  `);

  await db.exec(fs.readFileSync('database/migrations/002_user_sync.sql', 'utf8'));

  // Reproduce the drift. 002 installs a sync trigger on auth.users, so silence
  // it while seeding - otherwise the conflict repairs itself before we start.
  // Note the mixed-case auth email: the conflict is matched case-insensitively.
  await db.exec(`
    ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
    ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_updated;
    INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
      ('${AUTH}', 'Yogesh@KeyPurpose.test', '{"full_name":"yogesh keypurpose"}'),
      ('${OK}',   'fine@keypurpose.test',   '{"full_name":"Fine Person"}');
    INSERT INTO public.users(id, email, name, role)
      VALUES ('${STALE}', 'yogesh@keypurpose.test', 'yogesh keypurpose', 'admin');
    INSERT INTO public.members(user_id, first_name) VALUES ('${STALE}', 'yogesh');
    INSERT INTO public.memberships(member_id, note)
      SELECT id, 'carried' FROM public.members WHERE user_id = '${STALE}';
    INSERT INTO public.audit_logs(performed_by, action) VALUES ('${STALE}', 'did a thing');
    INSERT INTO public.users(id, email, name, role)
      VALUES ('${OK}', 'fine@keypurpose.test', 'Fine Person', 'member');
    INSERT INTO public.members(user_id, first_name) VALUES ('${OK}', 'Fine');
    UPDATE public.users SET role = NULL WHERE id = '${OK}';
    ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
    ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_updated;
  `);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [AUTH]);
});

if (enabled) test.after(async () => db.close());

sqltest('the drift reproduces the profile_conflict a member actually sees', async () => {
  const before = (await one('select public.sync_current_user() as r')).r;
  assert.equal(before.success, false);
  assert.equal(before.error, 'profile_conflict');
  assert.equal((await one('select count(*)::int n from public.members where user_id = $1', [AUTH])).n, 0);
});

sqltest('repair re-keys the account and every dependent row follows the cascade', async () => {
  await db.exec(fs.readFileSync('database/migrations/003_data_repair.sql', 'utf8'));

  assert.equal((await one('select count(*)::int n from public.users where id = $1', [AUTH])).n, 1);
  assert.equal((await one('select count(*)::int n from public.users where id = $1', [STALE])).n, 0);
  // members, memberships and audit rows must have come along, not been orphaned.
  assert.equal((await one('select count(*)::int n from public.members where user_id = $1', [AUTH])).n, 1);
  assert.equal((await one('select count(*)::int n from public.memberships')).n, 1);
  assert.equal((await one('select count(*)::int n from public.audit_logs where performed_by = $1', [AUTH])).n, 1);

  const after = (await one('select public.sync_current_user() as r')).r;
  assert.equal(after.success, true);
  assert.ok(after.member_id);
});

sqltest('repair never changes a role that was already set', async () => {
  // The drifted row was an admin. A repair that silently demoted it would be
  // a privilege change nobody asked for.
  assert.equal((await one('select role from public.users where id = $1', [AUTH])).role, 'admin');
});

sqltest('a null role is backfilled to member, the least privilege', async () => {
  assert.equal((await one('select role from public.users where id = $1', [OK])).role, 'member');
});

sqltest('constraints left open by earlier migrations are closed', async () => {
  assert.equal((await one(
    "select convalidated as v from pg_constraint where conname = 'users_role_check'")).v, true);
  assert.equal((await one(
    "select count(*)::int n from pg_constraint where conname = 'members_user_id_unique'")).n, 1);
  // Every FK onto users(id) can now carry an id change.
  assert.equal((await one(`select count(*)::int n from pg_constraint c
      JOIN pg_class rt ON rt.oid = c.confrelid
      JOIN pg_namespace rn ON rn.oid = rt.relnamespace
     WHERE c.contype = 'f' AND rn.nspname = 'public'
       AND rt.relname = 'users' AND c.confupdtype <> 'c'`)).n, 0);
});

sqltest('open sync issues are closed once the account really works', async () => {
  assert.equal((await one(
    'select count(*)::int n from public.auth_sync_issues where resolved_at is null')).n, 0);
});

sqltest('re-running the repair changes nothing', async () => {
  const before = await one(`select
      (select count(*) from public.users)   as users,
      (select count(*) from public.members) as members,
      (select role from public.users where id = '${AUTH}') as role`);
  await db.exec('DROP TABLE IF EXISTS repair_log');
  await db.exec(fs.readFileSync('database/migrations/003_data_repair.sql', 'utf8'));
  const after = await one(`select
      (select count(*) from public.users)   as users,
      (select count(*) from public.members) as members,
      (select role from public.users where id = '${AUTH}') as role`);
  assert.deepEqual(after, before);
  // Nothing left for a human to resolve.
  assert.equal((await one(
    "select count(*)::int n from repair_log where step in ('conflict_manual','duplicate_members','invalid_role','sync_failed','fk_skipped')")).n, 0);
});
