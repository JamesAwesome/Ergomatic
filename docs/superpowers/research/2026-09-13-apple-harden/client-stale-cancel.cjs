const fs=require('node:fs');const vm=require('node:vm');const {createRequire}=require('node:module');
const root='/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/apple-client-plan-scratch/app';
const r=createRequire(root+'/package.json');const ts=r('typescript');
let resolveApple;let calls=0;let serverAttempt=true;const views=[];const requests=[];
const apple={authorize:()=>++calls===1?new Promise(resolve=>resolveApple=resolve):Promise.reject({code:'busy'})};
const api=async(path,init)=>{requests.push(path);if(path.endsWith('/cancel')){serverAttempt=false;return new Response(null,{status:204});}return new Response(JSON.stringify({error:'attempt_expired'}),{status:410});};
const source=fs.readFileSync(root+'/src/adapters/authFlow.ts','utf8')+'\nexport {authorizeNative};';
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const loaded={};const ctx={exports:loaded,require:(id)=> id==='react'?{}:id==='../api'?{api}:id==='../platform'?{isNative:()=>true}:id==='./webNavigate'?{}:id==='../native/appleAuth'?{AppleAuth:apple}:r(id),Response,console,URL,Set};

const step={outcome:'authorize',purpose:'link',stage:'target',provider:'apple',targetProvider:'apple',attemptId:'one',nonce:'nonce',state:'state'};
const context={native:true,generation:{current:1},operation:{current:{step,bindingSecret:'binding'}},setView:v=>views.push(v),onSignedIn:{current:()=>{}}};
(async()=>{
let finishCancel;let cancelStarted;const started=new Promise(r=>cancelStarted=r);
ctx.require=(id)=>id==='react'?{}:id==='../api'?{api:async(path)=>{requests.push(path);cancelStarted();return new Promise(r=>finishCancel=()=>r(new Response(null,{status:204})));}}:id==='../platform'?{isNative:()=>true}:id==='./webNavigate'?{}:id==='../native/appleAuth'?{AppleAuth:{authorize:async()=>{throw {code:'cancelled'};}}}:r(id);
vm.runInNewContext(js,ctx);
const pending=loaded.authorizeNative(context,step,'binding',1);await started;
context.generation.current=2;context.operation.current={step:{...step,attemptId:'new'},bindingSecret:'new-binding'};views.push({kind:'link_confirm',targetProvider:'apple'});
finishCancel();await pending;
console.log(JSON.stringify({currentGeneration:context.generation.current,operation:context.operation.current.step.attemptId,views}));
})();
