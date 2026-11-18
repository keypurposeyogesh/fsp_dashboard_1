const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function harness({error=null,resources=[]}={}) {
  let cursor=0,result={data:[],error:null};
  const state=[false,error,resources];
  const deps={
    react:{...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=value;}];},useEffect(){},useCallback:fn=>fn},
    '@/lib/supabase/client':{createClient:()=>({from:()=>({select:()=>({returns:async()=>result})})})},
    '@/lib/data/errors':{toDataError:err=>({message:err.message})},
    '@/lib/activity-log':{logMemberActivity:async()=>{}},
    '@/components/ui/Card':{Card:({children})=>React.createElement('div',null,children)},
    '@/components/ui/Button':{Button:({children,disabled})=>React.createElement('button',{disabled},children)},
    '@/components/ui/Badge':{Badge:({children})=>React.createElement('span',null,children)},
  };
  const mod={exports:{}};
  const code=ts.transpileModule(fs.readFileSync('src/components/pages/ResourcesView.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','exports','module',code)(name=>name in deps?deps[name]:require(name),mod.exports,mod);
  function tree(){cursor=0;return mod.exports.ResourcesView();}
  function find(node){if(!node||typeof node!=='object')return null;if(Array.isArray(node))return node.map(find).find(Boolean);return node.props?.['data-action']==='refresh'?node:find(node.props?.children);}
  return {html:()=>renderToStaticMarkup(tree()),refresh:()=>find(tree()).props.onClick(),respond(value){result=value;}};
}
test('a resource permission error is never presented as an empty library',()=>{
  const h=harness({error:"You don't have permission to do that."});
  assert.match(h.html(),/role="alert"/);
  assert.doesNotMatch(h.html(),/No training guides/);
});
test('only a successful empty response shows the empty library message',()=>{
  const h=harness();assert.match(h.html(),/No training guides/);assert.doesNotMatch(h.html(),/role="alert"/);
});
test('retry clears the prior error and displays the returned resources',async()=>{
  const h=harness({error:'Permission denied'});
  h.respond({error:null,data:[{id:'r',title:'Facilitation handbook',url:'https://example.test/guide.pdf',courses:{title:'Core skills'}}]});
  await h.refresh();
  assert.match(h.html(),/Facilitation handbook/);
  assert.match(h.html(),/Core skills/);
  assert.doesNotMatch(h.html(),/role="alert"|No training guides/);
});
test('a failed refresh hides stale resource cards and keeps the error visible',async()=>{
  const h=harness({resources:[{id:'r',title:'Previous handbook',url:'https://example.test'}]});
  h.respond({data:null,error:{message:'Permission denied'}});
  await h.refresh();assert.match(h.html(),/Permission denied/);assert.doesNotMatch(h.html(),/Previous handbook|No training guides/);
});
