const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const mod = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/gamification.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(mod.exports);
const { growthProgress } = mod.exports;
const now = new Date('2026-11-14T12:00:00+05:30');
const row = (day, id = day) => ({ enrollment_id:'e', task_id:id, completed_at:`2026-11-${day}T10:00:00+05:30` });
test('new members start at level one with no fabricated progress', () => {
 const p = growthProgress(20, [], now); assert.equal(p.xp,0); assert.equal(p.level,1); assert.equal(p.streak,0); assert.equal(p.badges.filter(b=>b.earned).length,0);
});
test('saved tasks are counted once and levels roll over at 250 XP', () => {
 const records = Array.from({length:8}, (_,i)=>row('14',String(i)));
 const p = growthProgress(100, [...records,records[0]], now);
 assert.equal(p.xp,250); assert.equal(p.level,2); assert.equal(p.levelXP,0); assert.equal(p.nextXP,250);
});
test('streak survives until today ends, resets after a missed day, and badges persist', () => {
 const records = ['07','08','09','10','11','12','13'].map(d=>row(d));
 assert.equal(growthProgress(0,records,now).streak,7);
 const later = growthProgress(0,records,new Date('2026-11-16T10:00:00+05:30'));
 assert.equal(later.streak,0); assert.equal(later.badges[3].earned,true);
});
test('calendar uses Indian midnight and ignores future completions', () => {
 const p = growthProgress(0,[{...row('14'),completed_at:'2026-11-13T19:00:00Z'},row('15')],now);
 assert.equal(p.completedTasks,1); assert.equal(p.week.at(-1).key,'2026-11-14'); assert.equal(p.week.at(-1).complete,true); assert.equal(p.streak,1);
});

