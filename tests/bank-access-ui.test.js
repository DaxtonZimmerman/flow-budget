const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const root=__dirname+'/../';
async function screen(t,state={status:'none',is_owner:false},connections=[]) {
 const {JSDOM}=await import('jsdom'),dom=new JSDOM(fs.readFileSync(root+'account.html','utf8'),{url:'https://flow.example/account.html',runScripts:'outside-only'}),w=dom.window;
 t.after(()=>w.close());w.localStorage.setItem('flow_user_id','signed-in-user');
 w.getFlowClient=()=>({auth:{getUser:async()=>({data:{user:{id:'signed-in-user'}}})}});
 const calls=[];let current=state;
 w.bankRequest=async(action,body)=>{
  calls.push({action,body});
  if(action==='request-bank-access') {current={status:'pending',is_owner:false};return current;}
  if(action==='decide-bank-access') {current={...current,requests:current.requests.map(r=>({...r,status:body.decision}))};return {saved:true};}
  if(action==='bank-access')return current;
  if(action==='connections')return {connections,new_connection_environment:current.status==='approved'?'production':null};
  throw new Error('Unexpected bank action');
 };
 w.eval(fs.readFileSync(root+'js/bank-connections.js','utf8'));
 await new Promise(resolve=>setTimeout(resolve,10));
 return {w,calls,dom};
}
test('request first, pending disables Link, no bank credentials or Plaid opened',async t=>{
 const {w,calls}=await screen(t),button=w.document.querySelector('#connect-bank');
 assert.equal(button.textContent,'Request bank access');assert.equal(button.disabled,false);
 button.click();await new Promise(r=>setTimeout(r,10));
 assert.equal(button.textContent,'Request sent');assert.equal(button.disabled,true);
 assert.equal(calls.filter(c=>c.action==='request-bank-access').length,1);
 assert.equal(calls.some(c=>c.action==='create-link-token'),false);
 assert.equal(w.document.querySelector('#bank-access-admin').hidden,true);
});
test('owner sees safe request identity and can approve the selected person',async t=>{
 const {w,calls}=await screen(t,{status:'owner',is_owner:true,requests:[{user_id:'person',email:'<img src=x onerror=bad()>',status:'pending'}]});
 const panel=w.document.querySelector('#bank-access-admin');assert.equal(panel.hidden,false);assert.equal(panel.querySelector('img'),null);
 const approve=[...panel.querySelectorAll('button')].find(b=>b.textContent==='Approve');approve.click();await new Promise(r=>setTimeout(r,10));
 assert.equal(calls.find(c=>c.action==='decide-bank-access').body.user_id,'person');
 assert.match(panel.textContent,/Approved · one connection/);assert.match(panel.textContent,/Cancel approval/);
});
test('approved user sees Connect my bank; denied and used approvals do not enable new linking',async t=>{
 for(const status of ['approved','denied','connected']) {
  const {w}=await screen(t,{status,is_owner:false}),button=w.document.querySelector('#connect-bank');
  if(status==='approved') {assert.equal(button.textContent,'Connect my bank');assert.equal(button.disabled,false);}
  else assert.ok(button.disabled||button.hidden);
 }
});
