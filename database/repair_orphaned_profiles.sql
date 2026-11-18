-- Run as postgres in Supabase SQL Editor. Repairs only the two reviewed pairs.
-- All changes, including temporary constraint changes, are transactional.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TEMP TABLE profile_repair_pairs (old_id uuid PRIMARY KEY, new_id uuid UNIQUE) ON COMMIT DROP;
INSERT INTO profile_repair_pairs VALUES
 ('5d66e1a8-deea-4bdb-af47-7768f5a41e56', '300a3c79-7b29-4a2d-be98-b14b713f6e88'),
 ('37ca9556-f4d4-4e53-9dd4-f6c395f5bf59', '2e09714b-bc09-4f05-9969-309645100f6a');

LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT * FROM profile_repair_pairs LOOP
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = p.old_id)
       OR EXISTS (SELECT 1 FROM public.users WHERE id = p.new_id)
       OR NOT EXISTS (
         SELECT 1 FROM public.users u JOIN auth.users a
           ON lower(trim(u.email)) = lower(trim(a.email))
         WHERE u.id = p.old_id AND a.id = p.new_id
       ) THEN
      RAISE EXCEPTION 'Repair precondition failed for %. No changes committed.', p.old_id;
    END IF;
  END LOOP;
END $$;

-- Save exact foreign-key definitions and temporarily defer their checks.
CREATE TEMP TABLE profile_repair_fks ON COMMIT DROP AS
SELECT conrelid, conname, pg_get_constraintdef(oid) AS definition,
       condeferrable, condeferred,
       (SELECT attname FROM pg_attribute
        WHERE attrelid = conrelid AND attnum = conkey[1]) AS column_name,
       cardinality(conkey) AS column_count
FROM pg_constraint
WHERE contype = 'f' AND confrelid = 'public.users'::regclass;

DO $$
DECLARE c record;
BEGIN
  IF EXISTS (SELECT 1 FROM profile_repair_fks WHERE column_count <> 1
     OR definition NOT LIKE '%REFERENCES %users(id)%') THEN
    RAISE EXCEPTION 'Unexpected foreign-key structure; repair cancelled';
  END IF;
  FOR c IN SELECT * FROM profile_repair_fks LOOP
    EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED', c.conrelid::regclass, c.conname);
  END LOOP;
END $$;
SET CONSTRAINTS ALL DEFERRED;

-- This append-only trigger otherwise rejects rewriting the actor reference.
-- Save its original mode and restore it before committing.
CREATE TEMP TABLE profile_repair_triggers ON COMMIT DROP AS
SELECT tgrelid, tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'public.audit_logs'::regclass AND tgname = 'guard_audit_logs';
ALTER TABLE public.audit_logs DISABLE TRIGGER guard_audit_logs;

UPDATE public.users u SET id = p.new_id
FROM profile_repair_pairs p WHERE u.id = p.old_id;

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM profile_repair_fks LOOP
    EXECUTE format('UPDATE %s AS t SET %I = p.new_id FROM profile_repair_pairs p WHERE t.%I = p.old_id',
      c.conrelid::regclass, c.column_name, c.column_name);
  END LOOP;
END $$;

-- Create a missing member row through the existing trusted implementation.
DO $$
DECLARE p record; member_id uuid;
BEGIN
  FOR p IN SELECT * FROM profile_repair_pairs LOOP
    SELECT public._sync_user(a) INTO member_id FROM auth.users a WHERE a.id = p.new_id;
    IF member_id IS NULL THEN
      RAISE EXCEPTION 'Member sync failed for %. Repair rolled back.', p.new_id;
    END IF;
  END LOOP;
END $$;

UPDATE public.auth_sync_issues i SET resolved_at = now()
FROM profile_repair_pairs p
WHERE i.auth_user_id = p.new_id AND i.issue = 'email_conflict' AND i.resolved_at IS NULL;

SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM profile_repair_fks LOOP
    EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I %s', c.conrelid::regclass, c.conname,
      CASE WHEN NOT c.condeferrable THEN 'NOT DEFERRABLE'
           WHEN c.condeferred THEN 'DEFERRABLE INITIALLY DEFERRED'
           ELSE 'DEFERRABLE INITIALLY IMMEDIATE' END);
  END LOOP;
  FOR c IN SELECT * FROM profile_repair_triggers LOOP
    EXECUTE format('ALTER TABLE %s %s TRIGGER %I', c.tgrelid::regclass,
      CASE c.tgenabled WHEN 'D' THEN 'DISABLE' WHEN 'R' THEN 'ENABLE REPLICA'
           WHEN 'A' THEN 'ENABLE ALWAYS' ELSE 'ENABLE' END, c.tgname);
  END LOOP;
END $$;

COMMIT;

SELECT u.id, u.role, m.id AS member_id
FROM public.users u
LEFT JOIN public.members m ON m.user_id = u.id
WHERE u.id IN ('300a3c79-7b29-4a2d-be98-b14b713f6e88', '2e09714b-bc09-4f05-9969-309645100f6a');
