const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const today='2026-10-29',now=Date.parse('2026-10-29T18:00:00Z');
function model(){const c=vm.createContext({Date,Intl});for(const n of ['planning-data','product-data','bill-data','money-data','budget-data'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${n}.js`,'utf8'),c);return c;}
function plan(c){return {...c.defaultFlowPlanning(),setup:{step:5,completed:true},periodStartedOn:'2026-10-23',selectedAccountIds:['bank:cash'],manualBalance:null,payday:{nextDate:'2026-11-06',frequency:'biweekly'},billsConfirmed:true,reservesConfirmed:true,essentials:[{id:'food',name:'Food',category:'Food',amountCents:10000}],cushionCents:0};}
const account={id:'bank:cash',accountId:'cash',bankConnectionId:'bank',name:'Checking',type:'depository',subtype:'checking',currency:'USD',availableCents:100000,currentCents:100000,retrievedAt:'2026-10-29T18:00:00Z',bankUpdatedAt:null};
const purchase=(id,extra={})=>({id,bankTransactionId:id,bankConnectionId:'bank',accountId:'cash',source:'bank',type:'Expense',name:'Market',amount:-30,category:'Food',date:today,status:'posted',...extra});
test('recorded budget use appears without a bank balance date while cash reserve math stays unchanged',()=>{
 const c=model(),p=plan(c),tx=[purchase('lunch')],before=JSON.stringify([p,tx]);
 const e=c.paydayEstimate(p,[account],tx,today,now),r=e.reserves[0];assert.equal(r.usedCents,3000);assert.equal(r.budgetRemainingCents,7000);assert.equal(r.spentCents,0);assert.equal(r.remainingCents,10000);assert.equal(e.leftCents,90000);assert.equal(JSON.stringify([p,tx]),before);
});
test('period spending includes its start day and manual payments; refunds reduce use and splits keep their actual categories',()=>{
 const c=model(),p=plan(c);const split=c.flowSplitTransaction(purchase('split',{amount:-50,category:'Other'}),[{category:'Food',cents:2000},{category:'Transport',cents:3000}]);
 const rows=[purchase('start',{date:p.periodStartedOn,amount:-10}),purchase('manual',{source:'manual',amount:-5}),purchase('refund',{type:'Refund',amount:3}),split,purchase('old',{date:'2026-10-22'}),purchase('future',{date:'2026-10-30'}),purchase('transfer',{type:'Transfer'}),purchase('unselected',{accountId:'savings'})];
 const r=c.paydayEstimate(p,[account],rows,today,now).reserves[0];assert.equal(r.usedCents,3200);assert.equal(r.budgetRemainingCents,6800);
});
test('pending spending is separate and its replacement cannot be counted twice; duplicate and conflicting records are handled',()=>{
 const c=model(),p=plan(c),pending=purchase('pending',{status:'pending',amount:-12}),posted=purchase('posted',{pendingTransactionId:'pending',amount:-12});
 let r=c.paydayEstimate(p,[account],[pending],today,now).reserves[0];assert.equal(r.usedCents,0);assert.equal(r.pendingCents,1200);assert.equal(r.budgetRemainingCents,8800);
 r=c.paydayEstimate(p,[account],[pending,posted,{...posted}],today,now).reserves[0];assert.equal(r.usedCents,1200);assert.equal(r.pendingCents,0);
 r=c.paydayEstimate(p,[account],[posted,{...posted,amount:-999}],today,now).reserves[0];assert.equal(r.usedCents,0);
});
test('confirmed bill payments are not also shown as everyday budget use',()=>{
 const c=model(),p=plan(c),t=purchase('meal',{date:'2026-10-28',amount:-30});p.bills=[{id:'meal',name:'Market',amountCents:3000,nextDate:'2026-10-28',frequency:'monthly',tracking:{merchant:'market',bankConnectionId:'bank',accountId:'cash',currency:'USD'}}];
 const e=c.paydayEstimate(p,[account],[t],today,now);assert.equal(e.reserves[0].usedCents,0);
});
