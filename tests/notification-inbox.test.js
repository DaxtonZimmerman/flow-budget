const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function app({demo=true}={}) {
 const handlers=new Map(),windowHandlers=new Map(),tasks=[],saved=new Map();let account='owner',data;
 class Node {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.handlers=new Map();this.textContent='';this.className='';this.isConnected=true;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  appendChild(node){this.append(node);return node;}
  insertBefore(node,before){node.parentElement=this;let at=this.children.indexOf(before);if(at<0)at=this.children.length;this.children.splice(at,0,node);}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  get firstChild(){return this.children[0];}
  set innerHTML(value){this.html=value;if(value.includes('notification-dot')){const dot=new Node('span');dot.className='notification-dot';dot.hidden=true;this.append(dot);}}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='id')this.id=v;}
  matches(s){if(s.includes(','))return s.split(',').some(s=>this.matches(s.trim()));if(s.startsWith('.'))return this.className.split(' ').includes(s.slice(1));if(s.startsWith('#'))return this.id===s.slice(1);if(s.startsWith('[')){const [_,name,value]=s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)||[];if(!name)return false;const v=name.startsWith('data-')?this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:this.attributes[name];return value===undefined?v!==undefined:v===value;}return this.tagName===s.toUpperCase();}
  closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}
  querySelectorAll(s){return this.children.flatMap(n=>[...(n.matches(s)?[n]:[]),...n.querySelectorAll(s)]);}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  addEventListener(n,fn){this.handlers.set(n,[...(this.handlers.get(n)||[]),fn]);}
  showModal(){this.open=true;}
  close(){this.open=false;for(const fn of this.handlers.get('close')||[])fn();}
  focus(){doc.activeElement=this;}
 }
 const body=new Node('body'),toolbar=new Node('div'),profile=new Node('button');toolbar.className='toolbar-actions';profile.dataset.openAccount='';toolbar.append(profile);body.append(toolbar);
 const doc={body,activeElement:body,createElement:tag=>new Node(tag),querySelector:s=>body.querySelector(s),addEventListener:(n,fn)=>handlers.set(n,[...(handlers.get(n)||[]),fn]),dispatchEvent:e=>{for(const fn of handlers.get(e.type)||[])fn(e);}};
 const context={Date,Intl,URL,Event,Promise,document:doc,navigator:{userAgent:''},flowDemoMode:demo,flowStorage:{getItem:k=>k==='flow_user_id'?account:saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},location:{href:'https://sample.invalid/flow/'+(demo?'demo/':'')+'index.html',pathname:'/flow/index.html',hash:'',search:''},history:{replaceState:()=>{}},matchMedia:()=>({matches:false}),queueMicrotask:fn=>tasks.push(fn),setInterval:()=>{},setTimeout,clearTimeout,addEventListener:(n,fn)=>windowHandlers.set(n,fn)};context.window=context;context.FlowAuth={authorized:true,user:{id:account}};
 const c=vm.createContext(context);for(const file of ['planning-data','product-data','bill-data','money-data','budget-data','notification-data'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${file}.js`,'utf8'),c);
 const day=c.flowToday();data={flowPlanning:{...c.defaultFlowPlanning(),setup:{step:5,completed:true},periodStartedOn:c.addPlanDays(day,-3),payday:{nextDate:c.addPlanDays(day,7),frequency:'weekly'},bills:[{id:'phone',name:'Phone',amountCents:1000,nextDate:c.addPlanDays(day,1),frequency:'monthly'}],billsConfirmed:true,reservesConfirmed:true},transactions:[],bankAccounts:[],budgets:[{category:'Food',limit:100}],budgetsByMonth:{}};
 c.getFlowSnapshot=()=>data;c.loadFlowPlanning=()=>data.flowPlanning;c.saveFlowPlanning=p=>{data.flowPlanning=p;doc.dispatchEvent(new Event('flow-planning-updated'));};c.getFlowClient=()=>({functions:{invoke:async()=>({data:{ready:false}})}});
 vm.runInContext(fs.readFileSync(`${__dirname}/../js/notifications.js`,'utf8'),c);
 const flush=()=>{for(let i=0;tasks.length&&i<40;i++)tasks.shift()();assert.equal(tasks.length,0);};flush();
 async function emit(type,target){for(const fn of handlers.get(type)||[])await fn({type,target});flush();}
 const findAction=action=>body.querySelector('[data-notification-action="'+action+'"]');
 return {body,saved,c,data,flush,findAction,click:action=>emit('click',findAction(action)),change:async(key,checked)=>{const input=body.querySelector('[data-notification-preference="'+key+'"]');input.checked=checked;await emit('change',input);},switch:()=>{account='other';c.FlowAuth.user={id:'other'};windowHandlers.get('storage')();flush();},refresh:()=>{doc.dispatchEvent(new Event('flow-planning-updated'));flush();}};
}
test('inbox opens without a permission prompt, marks reminders read, and snoozes until tomorrow without altering money',async()=>{
 const x=app(),original=JSON.stringify(x.data);assert.match(x.findAction('open').attributes['aria-label'],/1 unread/);
 await x.click('open');const dialog=x.body.querySelector('#flow-notifications-dialog');assert.equal(dialog.open,true);assert.equal(dialog.querySelectorAll('.notification-row').length,1);
 await x.click('read-all');assert.equal(x.findAction('open').attributes['aria-label'],'Notifications');assert.equal(JSON.stringify(x.data),original);
 await x.click('snooze');assert.equal(dialog.querySelectorAll('.notification-row').length,0);assert.equal(x.data.flowPlanning.bills[0].amountCents,1000);assert.equal(x.data.flowPlanning.features.reminders[0].until,x.c.flowToday());
});
test('notification preferences save, pause the inbox, and preserve bill and budget data',async()=>{
 const x=app();await x.click('open');await x.change('remindersEnabled',false);const dialog=x.body.querySelector('#flow-notifications-dialog');assert.equal(dialog.querySelectorAll('.notification-row').length,0);assert.equal(x.data.flowPlanning.preferences.remindersEnabled,false);assert.equal(x.data.budgets[0].limit,100);
 await x.change('remindersEnabled',true);assert.equal(dialog.querySelectorAll('.notification-row').length,1);await x.change('billReminders',false);assert.equal(dialog.querySelectorAll('.notification-row').length,0);
});
test('an account change closes the previous inbox and clears its read state from the active view',async()=>{
 const x=app({demo:false});await x.click('open');const dialog=x.body.querySelector('#flow-notifications-dialog');assert.equal(dialog.open,true);await x.click('read-all');x.switch();assert.equal(dialog.open,false);assert.equal(x.saved.has('flow-notifications-read:owner'),true);assert.match(x.findAction('open').attributes['aria-label'],/1 unread/);
});
