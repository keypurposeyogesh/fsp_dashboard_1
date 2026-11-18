const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
let db;
const migration = fs.readFileSync('database/migrations/026_resource_read_permissions.sql', 'utf8');
if (PGlite) test.before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.users(id text PRIMARY KEY, role text, is_active boolean);
    CREATE FUNCTION public.current_app_role() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
      SELECT role FROM users WHERE id=current_setting('test.user_id',true) AND is_active;
    $$;
    INSERT INTO users VALUES ('member','member',true),('admin','admin',true),('disabled','member',false);
    CREATE TABLE courses(id integer PRIMARY KEY,title text);
    CREATE TABLE resources(id integer PRIMARY KEY,course_id integer REFERENCES courses(id),title text,url text);
    INSERT INTO courses VALUES (1,'Facilitation');
    INSERT INTO resources VALUES (1,1,'Handbook','https://example.test/handbook.pdf');
    ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
    ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
    CREATE POLICY course_read ON courses FOR SELECT TO authenticated USING (true);
    CREATE POLICY resource_read ON resources FOR SELECT TO authenticated USING (true);
    GRANT USAGE ON SCHEMA public TO authenticated,anon;
  `);
});
if (PGlite) test.after(async () => db.close());
const sqltest = (name, fn) => test(name, { skip: !PGlite }, fn);
async function asUser(user, query, role='authenticated') {
  await db.query("select set_config('test.user_id',$1,false)",[user]);
  await db.exec(`SET ROLE ${role}`);
  try { return await db.query(query); } finally { await db.exec('RESET ROLE'); }
}
sqltest('resource repair restores member reads and the course join without granting writes',async()=>{
  await assert.rejects(asUser('member','SELECT * FROM resources'),/permission denied/);
  await db.exec(migration);
  for(const user of ['member','admin']) {
    const result=await asUser(user,'SELECT r.title,c.title AS course FROM resources r JOIN courses c ON c.id=r.course_id');
    assert.deepEqual(result.rows,[{title:'Handbook',course:'Facilitation'}]);
  }
  await assert.rejects(asUser('member',"INSERT INTO resources VALUES(2,1,'Other','https://example.test')"),/permission denied/);
  await assert.rejects(asUser('member',"UPDATE resources SET title='Changed'"),/permission denied/);
  await assert.rejects(asUser('member','DELETE FROM resources'),/permission denied/);
});
sqltest('disabled and missing profiles cannot read; anonymous clients have no table access',async()=>{
  for(const user of ['disabled','missing']) {
    assert.equal((await asUser(user,'SELECT * FROM resources')).rows.length,0);
    assert.equal((await asUser(user,'SELECT * FROM courses')).rows.length,0);
  }
  await assert.rejects(asUser('','SELECT * FROM resources','anon'),/permission denied/);
});
sqltest('repair preserves existing row filters and is safe to repeat',async()=>{
  await db.exec('ALTER POLICY resource_read ON resources USING (id <> 1)');
  assert.equal((await asUser('member','SELECT * FROM resources')).rows.length,0);
  await db.exec(migration);
  assert.equal((await asUser('member','SELECT * FROM resources')).rows.length,0);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM resources')).rows[0].total,1);
});
