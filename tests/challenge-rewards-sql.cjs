const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
let PGlite;
try { ({PGlite}=require('../.test-tools/node_modules/@electric-sql/pglite')); } catch {}
const enabled=!!PGlite;
const member='00000000-0000-4000-8000-000000000001', admin='00000000-0000-4000-8000-000000000002', stranger='00000000-0000-4000-8000-000000000003';
const offering='00000000-0000-4000-8000-000000000010', enrollment='00000000-0000-4000-8000-000000000020', pending='00000000-0000-4000-8000-000000000021';
let db;
const scalar=async(sql,args=[])=> (await db.query(sql,args)).rows[0].value;
const identity=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
if(enabled) test.before(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE public.users(id uuid PRIMARY KEY,role text,is_active boolean DEFAULT true);
 CREATE TABLE public.members(id uuid PRIMARY KEY,user_id uuid REFERENCES public.users(id));
 CREATE TABLE public.offerings(id uuid PRIMARY KEY,code text);
 CREATE TABLE public.offering_enrollments(id uuid PRIMARY KEY,member_id uuid REFERENCES public.members(id),offering_id uuid REFERENCES public.offerings(id),status text,reviewed_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT coalesce((SELECT role IN ('admin','super_admin') FROM public.users WHERE id=auth.uid() AND is_active),false) $$;
 CREATE FUNCTION public._audit(text,text,uuid,jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
 INSERT INTO public.users VALUES('${member}','member',true),('${admin}','super_admin',true),('${stranger}','member',true);
 INSERT INTO public.members VALUES('${member}','${member}'); INSERT INTO public.offerings VALUES('${offering}','FSP-30DC');`);
 await db.exec(fs.readFileSync('database/migrations/016_course_daily_tasks.sql','utf8'));
 await db.exec(fs.readFileSync('database/migrations/022_challenge_rewards.sql','utf8'));
 await db.exec(`INSERT INTO public.offering_enrollments(id,member_id,offering_id,status) VALUES('${enrollment}','${member}','${offering}','active'),('${pending}','${member}','${offering}','payment_review')`);
 await identity(member);
});
if(enabled)test.after(async()=>db.close());
const sqltest=(name,fn)=>test(name,{skip:!enabled},fn);
sqltest('migration reruns preserve approval-based windows and pending enrollments have no window',async()=>{
 const before=await scalar('select started_at::text as value from challenge_reward_windows where enrollment_id=$1',[enrollment]);
 await db.exec(fs.readFileSync('database/migrations/022_challenge_rewards.sql','utf8'));
 assert.equal(await scalar('select started_at::text as value from challenge_reward_windows where enrollment_id=$1',[enrollment]),before);
 assert.equal(await scalar('select count(*)::int as value from challenge_reward_windows'),1);
 assert.equal(await scalar("select ((deadline_at at time zone 'Asia/Kolkata')::date-(started_at at time zone 'Asia/Kolkata')::date)::int as value from challenge_reward_windows where enrollment_id=$1",[enrollment]),40);
});
sqltest('deadline boundaries distinguish 3000 on-time points and 1500 late points',async()=>{
 const calculate=async(count,finished,now)=>scalar("select public._challenge_reward_values($1,$2::timestamptz,'2026-12-24T00:00:00+05:30',$3::timestamptz,0) as value",[count,finished,now]);
 const early=await calculate(30,'2026-12-23T23:59:59+05:30','2027-01-01T00:00:00Z');assert.equal(early.available_points,3000);assert.equal(early.on_time,true);assert.equal(early.window_open,false);
 const late=await calculate(30,'2026-12-24T00:00:00+05:30','2026-12-25T00:00:00Z');assert.equal(late.available_points,1500);assert.equal(late.on_time,false);
 const partial=await calculate(29,'2026-12-20T00:00:00Z','2026-12-25T00:00:00Z');assert.equal(partial.earned_points,2900);assert.equal(partial.available_points,0);
});
sqltest('task skipping fails and duplicate completion awards only 100 points',async()=>{
 const tasks=(await db.query('select id from offering_daily_tasks order by day_number')).rows;
 await assert.rejects(db.query('select complete_daily_task($1,$2)',[enrollment,tasks[1].id]),/current day/);
 await db.query('select complete_daily_task($1,$2)',[enrollment,tasks[0].id]);await db.query('select complete_daily_task($1,$2)',[enrollment,tasks[0].id]);
 const reward=(await scalar('select get_challenge_rewards($1) as value',[enrollment]))[0];assert.equal(reward.earned_points,100);assert.equal(reward.available_points,0);
 await identity(stranger);assert.deepEqual(await scalar('select get_challenge_rewards($1) as value',[enrollment]),[]);
 await assert.rejects(db.query('select complete_daily_task($1,$2)',[enrollment,tasks[1].id]),/active course enrollment/);await identity(member);
});
sqltest('30 completions unlock reward and reactivation cannot reset the deadline',async()=>{
 const tasks=(await db.query('select id from offering_daily_tasks order by day_number')).rows;
 for(const task of tasks)await db.query('select complete_daily_task($1,$2)',[enrollment,task.id]);
 const before=(await scalar('select get_challenge_rewards($1) as value',[enrollment]))[0];assert.equal(before.completed_tasks,30);assert.equal(before.available_points,3000);
 await db.query("update offering_enrollments set status='active' where id=$1",[enrollment]);
 const after=(await scalar('select get_challenge_rewards($1) as value',[enrollment]))[0];assert.equal(after.started_at,before.started_at);assert.equal(after.deadline_at,before.deadline_at);
});
sqltest('admin discount recording is idempotent, rejects overdrafts and blocks members',async()=>{
 const id='00000000-0000-4000-8000-000000000050';
 await assert.rejects(db.query('select redeem_challenge_points($1,500,$2,$3)',[enrollment,'Invoice-1',id]),/Administrator access/);
 await identity(admin);
 assert.equal((await scalar('select redeem_challenge_points($1,500,$2,$3) as value',[enrollment,'Invoice-1',id])).success,true);
 assert.equal((await scalar('select redeem_challenge_points($1,500,$2,$3) as value',[enrollment,'Invoice-1',id])).duplicate,true);
 assert.equal((await scalar('select redeem_challenge_points($1,500,$2,$3) as value',[enrollment,'invoice-1','00000000-0000-4000-8000-000000000051'])).duplicate,true);
 await assert.rejects(db.query('select redeem_challenge_points($1,2600,$2,$3)',[enrollment,'Invoice-2','00000000-0000-4000-8000-000000000052']),/Not enough/);
 assert.equal((await scalar('select get_challenge_rewards($1) as value',[enrollment]))[0].available_points,2500);
});
sqltest('authenticated users cannot alter points, deadlines, or completion timestamps directly',async()=>{
 await db.exec('SET ROLE authenticated');
 for(const sql of ['delete from challenge_reward_windows','delete from challenge_point_redemptions','delete from offering_task_completions']) await assert.rejects(db.exec(sql),/permission denied/);
 await db.exec('RESET ROLE');
});
sqltest('completed challenge task definitions cannot be removed or renumbered',async()=>{
 await assert.rejects(db.exec('update offering_daily_tasks set day_number=31 where day_number=1'),/cannot be removed or renumbered/);
 await assert.rejects(db.exec('delete from offering_daily_tasks where day_number=1'),/cannot be removed or renumbered/);
});

sqltest('a real late completion unlocks only 1500 while keeping all task history',async()=>{
 await db.query("update offering_enrollments set status='active' where id=$1",[pending]);
 await db.query("update challenge_reward_windows set started_at=now()-interval '41 days',deadline_at=now()-interval '1 day' where enrollment_id=$1",[pending]);
 await identity(member);
 const tasks=(await db.query('select id from offering_daily_tasks order by day_number')).rows;
 for(const task of tasks)await db.query('select complete_daily_task($1,$2)',[pending,task.id]);
 const reward=(await scalar('select get_challenge_rewards($1) as value',[pending]))[0];assert.equal(reward.available_points,1500);assert.equal(reward.earned_points,3000);assert.equal(reward.window_open,false);assert.equal(reward.completion_dates.length,30);
});
sqltest('anonymous and disabled accounts cannot obtain balances',async()=>{
 await identity('');await assert.rejects(db.query('select get_challenge_rewards()'),/active account/);
 await identity(member);await db.query('update public.users set is_active=false where id=$1',[member]);
 await assert.rejects(db.query('select get_challenge_rewards()'),/active account/);
 await db.query('update public.users set is_active=true where id=$1',[member]);
});
