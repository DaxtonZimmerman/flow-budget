const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function model() {
    const saved = new Map(); let failKey = null;
    const context = vm.createContext({Date, Event, crypto:require('node:crypto'), localStorage:{
        getItem:key=>saved.get(key) ?? null,
        setItem:(key,value)=>{if(key===failKey){failKey=null;throw Error('Storage full');}saved.set(key,value);},
        removeItem:key=>saved.delete(key)
    },document:{querySelector:()=>({addEventListener:()=>{}}),dispatchEvent:()=>{},addEventListener:()=>{}},window:{addEventListener:()=>{}},flowCloudUrl:'',flowCloudKey:''});
    for (const file of ['planning-data','money-data','review-data','cloud-sync','backup']) vm.runInContext(fs.readFileSync(`${__dirname}/../js/${file}.js`,'utf8'),context);
    return {saved, run:s=>vm.runInContext(s,context), evaluate:(name,...args)=>context[name](...args), fail:key=>failKey=key};
}
function plan(m) { const p=m.evaluate('defaultFlowPlanning'); return {...p,setup:{step:5,completed:true},periodStartedOn:'2026-10-17',manualBalance:{cents:100000,date:'2026-10-20'},payday:{nextDate:'2026-10-30',frequency:'biweekly'},billsConfirmed:true,reservesConfirmed:true,essentials:[{id:'food',name:'Food',category:'Food',amountCents:10000}],cushionCents:20000}; }
const now=Date.parse('2026-10-20T16:00:00Z');
const account=(extra={})=>({id:'conn:cash',accountId:'cash',bankConnectionId:'conn',name:'Checking',type:'depository',subtype:'checking',currency:'USD',availableCents:100000,currentCents:120000,retrievedAt:'2026-10-20T15:00:00Z',bankUpdatedAt:'2026-10-20T12:00:00Z',...extra});
function estimate(m,p,accounts=[],transactions=[]) {return m.evaluate('paydayEstimate',p,accounts,transactions,'2026-10-20',now);}
test('payday estimate subtracts unpaid bills and reserves from available money, excluding future income',()=>{
 const m=model(),p=plan(m);p.bills=[{id:'rent',name:'Rent',amountCents:40000,nextDate:'2026-10-25',frequency:'monthly'},{id:'later',name:'Later',amountCents:99999,nextDate:'2026-11-01',frequency:'once'}];
 const e=estimate(m,p,[],[{type:'Income',amount:2000,date:'2026-10-25'}]);assert.equal(e.ready,true);assert.equal(e.leftCents,30000);assert.equal(e.days,10);assert.equal(e.bills.length,1);
 p.bills[0].amountCents=90000;assert.equal(estimate(m,p).leftCents,-20000);
});
test('missing, stale, foreign, credit, and partial account balances cannot produce a spending estimate',()=>{
 const m=model(),p=plan(m);p.manualBalance=null;p.selectedAccountIds=['conn:cash'];
 for(const accounts of [[],[account({availableCents:null})],[account({currency:'EUR'})],[account({type:'credit'})],[account({retrievedAt:'2026-10-16T00:00:00Z'})],[account({bankUpdatedAt:'2026-10-10T00:00:00Z'})]])assert.equal(estimate(m,p,accounts).ready,false);
 assert.equal(estimate(m,p,[account()]).balanceCents,100000);
 p.selectedAccountIds.push('disconnected:account');assert.equal(estimate(m,p,[account()]).ready,false);
});
test('manual balance must be confirmed today, and an overdraft remains a shortfall',()=>{
 const m=model(),p=plan(m);p.manualBalance.date='2026-10-19';assert.equal(estimate(m,p).ready,false);
 p.manualBalance={cents:-1200,date:'2026-10-20'};assert.equal(estimate(m,p).ready,true);assert.equal(estimate(m,p).leftCents,-31200);
});
test('reserves only release once for posted purchases reflected in a dated balance of the selected account',()=>{
 const m=model(),p=plan(m);p.manualBalance=null;p.selectedAccountIds=['conn:cash'];
 const purchase={id:'t',bankTransactionId:'t',accountId:'cash',bankConnectionId:'conn',source:'bank',amount:-20,type:'Expense',category:'Food',date:'2026-10-19',status:'posted'};
 const rows=[purchase,{...purchase},{...purchase,id:'pending',bankTransactionId:'pending',status:'pending'},{...purchase,id:'transfer',bankTransactionId:'transfer',type:'Transfer'},{...purchase,id:'today',bankTransactionId:'today',date:'2026-10-20'},{...purchase,id:'other',bankTransactionId:'other',bankConnectionId:'different'}];
 assert.equal(estimate(m,p,[account()],rows).essentialsCents,8000);
 assert.equal(estimate(m,p,[account({bankUpdatedAt:null})],rows).essentialsCents,10000);
 const refund={...purchase,id:'refund',bankTransactionId:'refund',type:'Refund',amount:200};
 assert.equal(estimate(m,p,[account()],[purchase,refund]).essentialsCents,10000);
});
test('monthly bills keep month-end anchors and weekly bills repeat through the planning date',()=>{
 const m=model(),p=plan(m);p.bills=[{id:'month',name:'Month',amountCents:100,nextDate:'2027-01-31',frequency:'monthly',anchorDay:31}];
 const occurrences=m.evaluate('planBillOccurrences',p,'2027-03-31');assert.deepEqual(Array.from(occurrences,b=>b.dueDate),['2027-01-31','2027-02-28','2027-03-31']);
 p.bills=[{id:'week',name:'Weekly',amountCents:100,nextDate:'2026-10-20',frequency:'weekly'}];assert.equal(m.evaluate('planBillOccurrences',p,'2026-11-03').length,3);
 p.bills[0].nextDate='2026-10-19';assert.equal(estimate(m,p).ready,false);
});
test('malformed, duplicate and unknown-version planning data is rejected without replacing saved data',()=>{
 const m=model(),p=plan(m);m.evaluate('saveFlowPlanning',p);const original=m.saved.get('flowPlanning');
 for(const bad of [{...p,version:2},{...p,cushionCents:1.1},{...p,payday:{nextDate:'2026-02-31',frequency:'monthly'}},{...p,essentials:[...p.essentials,...p.essentials]}]){assert.equal(m.evaluate('validFlowPlanning',bad),false);assert.throws(()=>m.evaluate('saveFlowPlanning',bad));assert.equal(m.saved.get('flowPlanning'),original);}
});
test('cloud snapshots and backups keep the plan and dated accounts, and failed storage rolls back all fields',()=>{
 const m=model(),p=plan(m),a=[account()];m.evaluate('replaceFlowSnapshot',{transactions:[],flowPlanning:p,bankAccounts:a});
 const snapshot=m.evaluate('getFlowSnapshot');assert.equal(snapshot.flowPlanning.manualBalance.cents,100000);assert.equal(snapshot.bankAccounts[0].availableCents,100000);
 assert.equal(m.evaluate('validBackup',{version:1,...snapshot}),true);
 assert.equal(m.evaluate('validBackup',{version:1,...snapshot,flowPlanning:{...p,version:2}}),false);
 const before=JSON.stringify([...m.saved]);m.fail('flowPlanning');assert.throws(()=>m.evaluate('replaceFlowSnapshot',{transactions:[{name:'Different'}],flowPlanning:{...p,cushionCents:0},bankAccounts:[]}));assert.equal(JSON.stringify([...m.saved]),before);
 m.evaluate('replaceFlowSnapshot',{transactions:[],budgets:[],budgetsByMonth:{}});assert.equal(m.saved.has('flowPlanning'),false);assert.equal(m.saved.get('bankAccounts'),'[]');
});
test('account snapshot conversion preserves unavailable values and never includes tokens or account numbers',()=>{
 const m=model();const rows=m.evaluate('bankAccountSnapshot','conn',[{account_id:'cash',name:'Checking',type:'depository',subtype:'checking',access_token:'private',mask:'1234',balances:{available:null,current:12.34,iso_currency_code:'USD'}}],'2026-10-20T15:00:00Z');
 assert.equal(rows[0].availableCents,null);assert.equal(rows[0].currentCents,1234);assert.equal(JSON.stringify(rows).includes('private'),false);assert.equal('mask' in rows[0],false);
});
test('old review is optional and does not block the recent activity inbox',()=>{
 const m=model(),p=plan(m);m.evaluate('saveFlowPlanning',p);
 assert.equal(m.evaluate('needsCurrentTransactionReview',{source:'bank',reviewStatus:'needs-review',date:'2026-10-01',category:'Other'}),false);
 assert.equal(m.evaluate('needsCurrentTransactionReview',{source:'bank',reviewStatus:'needs-review',date:'2026-10-19',category:'Other'}),true);
});
