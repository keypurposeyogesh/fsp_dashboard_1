const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
function harness(result){
 let cursor=0;const state=[];let calls=0,notifications=0,refreshed=0;
 const react={...React,useState(initial){const index=cursor++;if(!(index in state))state[index]=initial;return [state[index],v=>{state[index]=v;}];}};
 const code=ts.transpileModule(fs.readFileSync('src/components/admin/EnrollmentManagement.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};
 const deps={'./CourseAccessReview':{},react,'@/lib/enrollment-refresh':{notifyEnrollmentChanged(){notifications++;}},'@/lib/data/enrollments':{feeLabel:()=> 'INR 100',enrollmentError:e=>e.message,enrollmentAction:async()=>{calls++;if(result instanceof Error)throw result;return result;}}};
 new Function('require','module','exports',code)(name=>name in deps?deps[name]:name.startsWith('@/')?new Proxy({},{get:(_,key)=>key}):require(name),mod,mod.exports);
 function tree(){cursor=0;return mod.exports.PaymentReview({row:{id:'enrollment-1',amount:100,currency:'INR'},onReviewed:async()=>{refreshed++;}});}
 function nodes(node,predicate){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>nodes(n,predicate));return [...(predicate(node)?[node]:[]),...nodes(node.props?.children,predicate)];}
 function approve(){return nodes(tree(),n=>n.type==='Button')[0].props.onClick();}
 return {state,tree,approve,verify(){state[1]=true;},stats:()=>({calls,notifications,refreshed})};
}
test('approval requires explicit payment verification',async()=>{const h=harness({id:'enrollment-1',status:'active'});h.tree();await h.approve();assert.equal(h.stats().calls,0);});
test('confirmed approval refreshes the view and broadcasts to member tabs',async()=>{const h=harness({id:'enrollment-1',status:'active'});h.tree();h.verify();await h.approve();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(h.stats(),{calls:1,notifications:1,refreshed:1});assert.equal(h.state[3],'');});
test('unconfirmed activation is surfaced and never broadcasts success',async()=>{const h=harness({id:'enrollment-1',status:'payment_review'});h.tree();h.verify();await h.approve();await new Promise(resolve=>setImmediate(resolve));assert.match(h.state[3],/could not be confirmed/);assert.equal(h.stats().notifications,0);assert.equal(h.stats().refreshed,0);});
test('server approval errors remain visible without claiming activation',async()=>{const h=harness(new Error('Administrator access required.'));h.tree();h.verify();await h.approve();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.state[3],'Administrator access required.');assert.equal(h.stats().notifications,0);});
