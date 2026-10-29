const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function model(){const c=vm.createContext({Date});for(const name of ['planning-data','product-data','money-data','transaction-details-data'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${name}.js`,'utf8'),c);return c;}
const payment=(extra={})=>({id:'fuel',name:'Fuel stop',source:'manual',type:'Expense',amount:-30,category:'Transport',date:'2026-10-21',status:'posted',notes:'',...extra});
test('category activity matches chart totals and excludes income, transfers, pending payments and other months',()=>{
 const c=model(),rows=[payment(),payment({id:'refund',type:'Refund',amount:5}),payment({id:'income',type:'Income',amount:200}),payment({id:'pending',status:'pending'}),payment({id:'transfer',type:'Transfer'}),payment({id:'old',date:'2026-09-20'}),payment({id:'other',category:'Other'}),payment()];
 const actual=c.categoryActivity(rows,'Transport','2026-10');assert.equal(actual.length,2);assert.equal(actual.reduce((n,r)=>n+r.cents,0),2500);
 assert.equal(actual.reduce((n,r)=>n+r.cents,0),Math.round(c.getSpendingBreakdown(rows,'2026-10',31).categorySpending.Transport*100));
 assert.equal(c.categoryActivity(rows,'Transport','invalid').length,0);
});
test('split payments appear under their allocated categories with only that portion shown',()=>{
 const c=model();const split=c.flowSplitTransaction(payment({amount:-50,category:'Other'}),[{category:'Transport',cents:2000},{category:'Food',cents:3000}]);
 assert.equal(c.categoryActivity([split],'Transport','2026-10')[0].cents,2000);
 assert.equal(c.categoryActivity([split],'Food','2026-10')[0].cents,3000);
 assert.equal(c.categoryActivity([split],'Transport','2026-10')[0].split,true);
 assert.equal(c.categoryActivity([split],'Other','2026-10').length,0);
});
test('a single-payment category correction moves it between category lists without changing its amount or the other payments',()=>{
 const c=model(),original=payment(),other=payment({id:'second',amount:-10});
 const changed=c.transactionWithDetails(original,{type:'Expense',category:'Shopping',date:original.date,notes:'Saved-up purchase'},original);
 assert.equal(c.categoryActivity([changed,other],'Transport','2026-10').length,1);
 assert.equal(c.categoryActivity([changed,other],'Shopping','2026-10')[0].transaction.id,'fuel');
 assert.equal(changed.amount,original.amount);assert.equal(other.category,'Transport');
});

function ui(){
 const c=model(),listeners=new Map(),windows=new Map();let owner='owner',rows=[payment(),payment({id:'other',category:'Other'})],opened=[];
 class Node{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.textContent='';this.isConnected=true;this.handlers=new Map();}append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}replaceChildren(...nodes){this.children=[];this.append(...nodes);}setAttribute(k,v){this.attributes[k]=v;}querySelectorAll(s){const match=n=>s.startsWith('.')?n.className?.split(' ').includes(s.slice(1)):s.startsWith('#')?n.id===s.slice(1):s==='[aria-label="Close category"]'?n.attributes['aria-label']==='Close category':false;return this.children.flatMap(n=>[...(match(n)?[n]:[]),...n.querySelectorAll(s)]);}querySelector(s){return this.querySelectorAll(s)[0]||null;}addEventListener(name,fn){this.handlers.set(name,fn);}showModal(){this.open=true;}close(){this.open=false;this.handlers.get('close')?.();}focus(){this.focused=true;}getBoundingClientRect(){return {left:0,right:500,top:0,bottom:500};}}
 const body=new Node('body'),doc={body,createElement:tag=>new Node(tag),addEventListener:(name,fn)=>listeners.set(name,[...(listeners.get(name)||[]),fn])};
 c.document=doc;c.window={FlowAuth:{authorized:true,user:{id:owner}},FlowTransactionDetails:{open:id=>{opened.push(id);return true;}},addEventListener:(name,fn)=>windows.set(name,fn)};
 c.flowStorage={getItem:()=>owner};c.loadTransactions=()=>rows;
 vm.runInContext(fs.readFileSync(`${__dirname}/../js/category-activity.js`,'utf8'),c);
 const emit=(name,event={})=>{for(const fn of listeners.get(name)||[])fn(event);};
 const launch=category=>{const target=new Node('button');target.dataset={categoryActivity:category,categoryMonth:'2026-10'};target.closest=()=>target;emit('click',{target});return body.children[0];};
 return {launch,emit,opened,setRows:v=>rows=v,switchOwner:()=>{owner='different';windows.get('storage')({key:'flow_user_id'});}};
}
test('the category popup opens individual payments, refreshes after reclassification, and closes on an account switch',()=>{
 const app=ui(),dialog=app.launch('Transport');assert.equal(dialog.open,true);assert.equal(dialog.querySelector('#category-activity-title').textContent,'Transport');
 const row=dialog.querySelector('.category-activity-row');row.onclick();assert.deepEqual(app.opened,['fuel']);
 app.setRows([payment({category:'Shopping'})]);app.emit('flow-transaction-updated');assert.equal(dialog.querySelectorAll('.category-activity-row').length,0);
 assert.match(dialog.querySelector('.category-activity-list').children[0].textContent,/No payments/);
 app.switchOwner();assert.equal(dialog.open,false);
});
