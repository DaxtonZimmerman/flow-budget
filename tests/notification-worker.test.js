const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function worker(){const handlers={},shown=[],messages=[],opens=[];const existing={url:'https://example.invalid/flow/index.html',postMessage:m=>messages.push(m),focus:async()=>{}};
 const self={registration:{scope:'https://example.invalid/flow/',showNotification:async(...a)=>shown.push(a)},clients:{matchAll:async()=>[existing],openWindow:async url=>opens.push(url)},addEventListener:(n,fn)=>handlers[n]=fn};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../scripts/sw-template.js','utf8').replace('__FLOW_FILES__','[]'),{self,URL,Map,Set,Response,Request});
 const emit=async(type,event)=>{let work;handlers[type]({...event,waitUntil:p=>work=p});await work;};return {emit,shown,messages,opens,existing};
}
test('service-worker push only displays approved generic text and ignores injected titles, amounts and external links',async()=>{
 const x=worker();await x.emit('push',{data:{json:()=>({title:'PRIVATE NAME',body:'PRIVATE $500',href:'https://evil.invalid',tag:'private-account'})}});
 assert.equal(x.shown[0][0],'Flow.');assert.equal(x.shown[0][1].body,'Open Flow to check your reminders.');assert.equal(x.shown[0][1].data.href,'https://example.invalid/flow/index.html#notifications');assert.equal(JSON.stringify(x.shown).includes('PRIVATE'),false);
});
test('tapping a notification focuses an existing app without navigating away from an unsaved edit',async()=>{
 const x=worker();x.existing.url='https://example.invalid/flow/add-transaction.html';let closed=false;await x.emit('notificationclick',{notification:{close:()=>closed=true}});assert.equal(closed,true);assert.equal(x.messages[0].type,'FLOW_OPEN_NOTIFICATIONS');assert.equal(x.opens.length,0);
});
