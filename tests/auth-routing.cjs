const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(path, dependencies={}) {
 const output=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};new Function('require','exports','module',output)(name=>{
  if(name in dependencies)return dependencies[name];throw new Error(`Unexpected dependency ${name}`);
 },mod.exports,mod);return mod.exports;
}
const routing=load('src/lib/auth-redirect.ts');
const navigation=load('src/components/shell/nav.ts',{'lucide-react':require('lucide-react')});
test('all roles have the correct default landing page',()=>{
 for(const [role,home] of [['member','/dashboard'],['trainer','/dashboard'],[null,'/dashboard'],['admin','/admin'],['super_admin','/super-admin']]) {
  for(const requested of ['', '/', '/dashboard']) assert.equal(routing.loginDestination(role,requested),home);
 }
});
test('redirects respect role boundaries and preserve authorized destinations',()=>{
 assert.equal(routing.loginDestination('admin','/admin/memberships?status=pending'),'/admin/memberships?status=pending');
 assert.equal(routing.loginDestination('super_admin','/super-admin/users'),'/super-admin/users');
 assert.equal(routing.loginDestination('super_admin','/admin/members/new'),'/admin/members/new');
 assert.equal(routing.loginDestination('member','/profile/edit'),'/profile/edit');
 assert.equal(routing.loginDestination('member','/admin/members'),'/dashboard');
 assert.equal(routing.loginDestination('member','/super-admin/users'),'/dashboard');
 assert.equal(routing.loginDestination('admin','/super-admin/users'),'/admin');
 assert.equal(routing.loginDestination('admin','/admin/members/new'),'/admin');
 assert.equal(routing.loginDestination('admin','/courses'),'/admin');
});
test('unsafe external redirects and authentication loops fall back to role home',()=>{
 for(const role of ['member','admin','super_admin']) for(const requested of ['https://evil.example','//evil.example','/\\evil.example','/%5Cevil.example','/%2Fadmin','/login','/login/admin','/signup','/auth/callback','/api/activity','/reset-password','/admin/../login','/%00','/%xx']) {
  assert.equal(routing.loginDestination(role,requested),routing.roleHome(role),requested);
 }
});
function response(location=null) { return {location,cookies:{getAll:()=>[],set(){}}}; }
function proxyFor(role,user=true,active=true) {
 const db={auth:{getUser:async()=>({data:{user:user?{id:'test-user'}:null},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role,is_active:active}})})})})};
 return load('src/proxy.ts',{'next/server':{NextResponse:{next:()=>response(),redirect:url=>response(url.toString())}},'@supabase/ssr':{createServerClient:()=>db},'@/lib/auth-redirect':routing}).proxy;
}
const request=path=>({url:`http://localhost:3000${path}`,nextUrl:new URL(`http://localhost:3000${path}`),cookies:{getAll:()=>[],set(){}}});

test('every visible admin destination survives both login routing and the server gate',async()=>{
 for(const role of ['admin','super_admin']) for(const group of navigation.groupsForRole(role)) for(const link of group.links){
  assert.equal(routing.loginDestination(role,link.href),link.href,`${role}: ${link.href}`);
  assert.equal((await proxyFor(role)(request(link.href))).location,null,`${role}: ${link.href}`);
 }
});

test('expanded admin tools still reject members, unknown sections and account creation',async()=>{
 for(const path of ['/admin/resources','/admin/events','/admin/documents','/admin/settings']){
  assert.equal((await proxyFor('member')(request(path))).location,'http://localhost:3000/admin/unauthorized');
 }
 for(const path of ['/admin/members/new','/admin/members/new/','/admin/unknown']){
  assert.equal(routing.loginDestination('admin',path),'/admin');
  assert.equal((await proxyFor('admin')(request(path))).location,'http://localhost:3000/admin');
 }
});
test('every protected area sends unauthenticated visitors to the shared login',async()=>{
 for(const path of ['/dashboard','/admin/memberships','/super-admin/users']) {
  const result=await proxyFor(null,false)(request(path));const url=new URL(result.location);
  assert.equal(url.pathname,'/login');assert.equal(url.searchParams.get('redirect'),path);
 }
});

test('temporary auth outages stop at an explicit retry page rather than a login loop',async()=>{
 const db={auth:{getUser:async()=>({data:{user:null},error:{name:'AuthRetryableFetchError',status:0}})}};
 const gate=load('src/proxy.ts',{'next/server':{NextResponse:{next:()=>response(),redirect:url=>response(url.toString())}},'@supabase/ssr':{createServerClient:()=>db},'@/lib/auth-redirect':routing}).proxy;
 const result=await gate(request('/dashboard'));
 const target=new URL(result.location);
 assert.equal(target.searchParams.get('error'),'auth_unavailable');
 assert.equal(target.searchParams.get('redirect'),'/dashboard');
 assert.equal(routing.authServiceUnavailable({status:503}),true);
 assert.equal(routing.authServiceUnavailable({status:401}),false);
 assert.equal(routing.authServiceUnavailable(null),false);
});
test('server routing enforces roles, defaults and disabled account handling',async()=>{
 assert.equal((await proxyFor('admin')(request('/dashboard'))).location,'http://localhost:3000/admin');
 assert.equal((await proxyFor('super_admin')(request('/dashboard'))).location,'http://localhost:3000/super-admin');
 assert.equal((await proxyFor('member')(request('/dashboard'))).location,null);
 assert.equal((await proxyFor('member')(request('/admin/memberships'))).location,'http://localhost:3000/admin/unauthorized');
 assert.equal((await proxyFor('admin')(request('/super-admin/users'))).location,'http://localhost:3000/admin');
 assert.equal((await proxyFor('super_admin')(request('/super-admin/users'))).location,null);
 assert.equal((await proxyFor('admin',true,false)(request('/admin'))).location,'http://localhost:3000/login?error=disabled');
});
test('legacy admin URL redirects to the shared login and preserves return destination',async()=>{
 const legacy=load('src/app/login/admin/page.tsx',{'next/navigation':{redirect:path=>{throw new Error(path);}}}).default;
 await assert.rejects(legacy({searchParams:Promise.resolve({})}),{message:'/login'});
 await assert.rejects(legacy({searchParams:Promise.resolve({redirect:'/admin/memberships'})}),{message:'/login?redirect=%2Fadmin%2Fmemberships'});
});

test('OAuth callback uses trusted roles for all accounts and blocks disabled accounts',async()=>{
 for(const [role,active,target] of [['member',true,'/dashboard'],['admin',true,'/admin'],['super_admin',true,'/super-admin'],['admin',false,'/login?error=disabled']]) {
  const db={auth:{exchangeCodeForSession:async()=>({error:null}),getUser:async()=>({data:{user:{id:'test-user',app_metadata:{provider:'google'}}}})},from:table=>{
   if(table==='users')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{role,is_active:active}})})})};
   if(table==='members')return {select:()=>({eq:()=>({order:()=>({limit:()=>({maybeSingle:async()=>({data:{id:'member-id'}})})})})})};
   return {insert:async()=>({error:null})};
  }};
  const callback=load('src/app/auth/callback/route.ts',{'next/server':{NextResponse:{redirect:url=>response(url.toString())}},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/auth-redirect':routing}).GET;
  const result=await callback(new Request('http://localhost:3000/auth/callback?code=test&next=/dashboard'));
  assert.equal(result.location,'http://localhost:3000'+target);
 }
});

test('retired organization links always return to the correct role home',async()=>{
 for(const role of ['member','trainer','admin','super_admin']) {
  for(const path of ['/organizations','/organizations/fsp/settings']) {
   assert.equal(routing.loginDestination(role,path),routing.roleHome(role));
   assert.equal((await proxyFor(role)(request(path))).location,'http://localhost:3000'+routing.roleHome(role));
  }
 }
});

test('task progress allows both admin roles and rejects member access',async()=>{
 for(const role of ['admin','super_admin']) {
  assert.equal(routing.loginDestination(role,'/admin/task-progress'),'/admin/task-progress');
  assert.equal((await proxyFor(role)(request('/admin/task-progress'))).location,null);
 }
 assert.equal(routing.loginDestination('member','/admin/task-progress'),'/dashboard');
 assert.equal((await proxyFor('member')(request('/admin/task-progress'))).location,'http://localhost:3000/admin/unauthorized');
});

test('challenge community uses role-specific routes and keeps admin moderation protected',async()=>{
 for(const role of ['admin','super_admin']){
  assert.equal(routing.loginDestination(role,'/admin/challenge-community'),'/admin/challenge-community');
  assert.equal((await proxyFor(role)(request('/admin/challenge-community'))).location,null);
 }
 assert.equal(routing.loginDestination('member','/challenge-community'),'/challenge-community');
 assert.equal((await proxyFor('member')(request('/challenge-community'))).location,null);
 assert.equal((await proxyFor('member')(request('/admin/challenge-community'))).location,'http://localhost:3000/admin/unauthorized');
});
