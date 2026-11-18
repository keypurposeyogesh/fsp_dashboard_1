// getMyChallengeRewards must return only the signed-in member's challenges.
//
// get_challenge_rewards() widens its filter for an admin, so a super admin's
// personal dashboard was rendering one full quest card per member, with other
// people's completion dates feeding their own XP, streak and badges.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(path, deps = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    name => (name in deps ? deps[name] : require(name)), mod, mod.exports);
  return mod.exports;
}

const errors = load('src/lib/data/errors.ts');

/** A Supabase stub: the RPC answers with `rpcRows`, the table with `ownRows`. */
function moduleWith(rpcRows, ownRows, spy = {}) {
  const table = {
    select() { return this; },
    eq(column, value) { (spy.filters ??= []).push([column, value]); return this; },
    then(resolve) { return Promise.resolve({ data: ownRows, error: null }).then(resolve); },
  };
  const client = {
    rpc(name, args) { spy.rpc = { name, args }; return Promise.resolve({ data: rpcRows, error: null }); },
    from(name) { spy.from = name; return table; },
  };
  return load('src/lib/data/challenge-rewards.ts', {
    '@/lib/supabase/client': { createClient: () => client },
    './errors': errors,
  });
}

const MINE = 'enr-mine', THEIRS = 'enr-theirs', ALSO_THEIRS = 'enr-theirs-2';
const everyone = [
  { enrollment_id: MINE, earned_points: 500 },
  { enrollment_id: THEIRS, earned_points: 3000 },
  { enrollment_id: ALSO_THEIRS, earned_points: 100 },
];

test('an admin sees only their own challenge, not every active one', async () => {
  const { getMyChallengeRewards } = moduleWith(everyone, [{ id: MINE }]);
  const rewards = await getMyChallengeRewards('member-1');
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].enrollment_id, MINE);
  assert.equal(rewards[0].earned_points, 500);
});

test('the enrollment lookup is scoped to the viewer and to active rows', async () => {
  const spy = {};
  const { getMyChallengeRewards } = moduleWith(everyone, [{ id: MINE }], spy);
  await getMyChallengeRewards('member-1');
  assert.equal(spy.from, 'offering_enrollments');
  assert.deepEqual(spy.filters, [['member_id', 'member-1'], ['status', 'active']]);
});

test('a member with several own challenges keeps all of them', async () => {
  const { getMyChallengeRewards } = moduleWith(everyone, [{ id: MINE }, { id: ALSO_THEIRS }]);
  const rewards = await getMyChallengeRewards('member-1');
  assert.deepEqual(rewards.map(r => r.enrollment_id), [MINE, ALSO_THEIRS]);
});

test('no member id returns nothing rather than everyone', async () => {
  // The profile has not loaded, or its user_id did not match the session.
  // Showing the locked state is right; showing every member is not.
  const spy = {};
  const { getMyChallengeRewards } = moduleWith(everyone, [{ id: MINE }], spy);
  assert.deepEqual(await getMyChallengeRewards(undefined), []);
  assert.equal(spy.rpc, undefined, 'must not even call the RPC without a member id');
});

test('a member with no enrollments gets nothing, not another member row', async () => {
  const { getMyChallengeRewards } = moduleWith(everyone, []);
  assert.deepEqual(await getMyChallengeRewards('member-1'), []);
});
