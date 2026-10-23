const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function model(){const c=vm.createContext({Date,Event,localStorage:{getItem:()=>null},document:{dispatchEvent:()=>{}}});for(const file of ['planning-data','bill-data'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${file}.js`,'utf8'),c);return c;}
const today='2026-10-23',now=Date.parse('2026-10-23T16:00:00Z');
function plan(c,extra={}){return {...c.defaultFlowPlanning(),setup:{step:5,completed:true},periodStartedOn:'2026-10-09',selectedAccountIds:['conn:cash'],manualBalance:{cents:12446,date:'2026-10-22'},payday:{nextDate:today,frequency:'biweekly'},billsConfirmed:true,reservesConfirmed:true,essentials:[{id:'food',name:'Food',category:'Food',amountCents:4000},{id:'gas',name:'Transport',category:'Transport',amountCents:4000}],cushionCents:3000,...extra};}
const choices=(extra={})=>({nextDate:'2026-11-06',frequency:'biweekly',balanceMode:'manual',balanceCents:100000,essentialAmounts:[15000,5000],cushionCents:10000,...extra});
const account=(extra={})=>({id:'conn:cash',accountId:'cash',bankConnectionId:'conn',name:'Checking',type:'depository',subtype:'checking',currency:'USD',availableCents:100000,currentCents:100000,retrievedAt:'2026-10-23T15:00:00Z',bankUpdatedAt:'2026-10-23T12:00:00Z',...extra});
test('check-in waits until the end of payday without changing saved money or assuming pay arrived',()=>{
 const c=model(),p=plan(c),before=JSON.stringify(p);
 assert.equal(c.paydayCheckInDue(p,'2026-10-22'),false);assert.equal(c.paydayCheckInDue(p,today,now),false);assert.equal(c.paydayCheckInDue(p,'2026-10-24'),true);
 assert.equal(c.suggestNextPayday(p,today),'2026-11-06');assert.equal(JSON.stringify(p),before);
 assert.equal(c.paydayEstimate(p,[],[],today,now).ready,false);
 assert.equal(c.paydayCheckInDue({...p,setup:{step:1,completed:false}},today),false);
});
test('schedule suggestions skip passed dates but require a choice for irregular income',()=>{
 const c=model(),p=plan(c,{payday:{nextDate:'2026-09-25',frequency:'biweekly'}});assert.equal(c.suggestNextPayday(p,today),'2026-11-06');
 for(const frequency of ['irregular','once'])assert.equal(c.suggestNextPayday({...p,payday:{...p.payday,frequency}},today),'');
 assert.equal(c.suggestNextPayday({...p,payday:{nextDate:'2026-11-01',frequency:'monthly'}},today),'');
});
test('a new payday plan resets only confirmed reserves and balance; schedules, matches and preferences carry forward',()=>{
 const c=model(),p=plan(c,{bills:[{id:'phone',name:'Phone',amountCents:6000,nextDate:'2026-10-25',frequency:'monthly',anchorDay:25}],dismissedBillSuggestions:[{key:'source',label:'Not a bill'}]});
 const before=JSON.stringify(p),next=c.preparePaydayCheckIn(p,choices(),today);
 assert.equal(JSON.stringify(p),before);assert.equal(JSON.stringify(next.bills),JSON.stringify(p.bills));assert.equal(JSON.stringify(next.preferences),JSON.stringify(p.preferences));assert.equal(JSON.stringify(next.dismissedBillSuggestions),JSON.stringify(p.dismissedBillSuggestions));
 assert.equal(next.periodStartedOn,today);assert.equal(next.manualBalance.date,today);assert.equal(next.manualBalance.cents,100000);assert.equal(next.essentials[0].amountCents,15000);assert.equal(next.cushionCents,10000);assert.equal(c.validFlowPlanning(next),true);
 assert.equal(next.lastPaydayCheckIn.previousPayday,today);assert.equal(c.paydayCheckInDue(next,today),false);
 const e=c.paydayEstimate(next,[],[],today,now);assert.equal(e.ready,true);assert.equal(e.leftCents,64000);assert.equal(e.billsCents,6000);
 assert.throws(()=>c.preparePaydayCheckIn(next,choices(),today),/still running/);
});
test('fresh reserves do not carry old purchases into the new period or inflate cash with future income',()=>{
 const c=model(),p=plan(c),next=c.preparePaydayCheckIn(p,choices({balanceMode:'bank'}),today),rows=[{id:'old',source:'bank',bankConnectionId:'conn',accountId:'cash',bankTransactionId:'old',name:'Groceries',amount:-40,type:'Expense',category:'Food',date:'2026-10-22',status:'posted'},{name:'Expected pay',amount:2000,type:'Income',date:'2026-10-30'}];
 const e=c.paydayEstimate(next,[account()],rows,today,now);assert.equal(e.balanceCents,100000);assert.equal(e.essentialsCents,20000);assert.equal(e.leftCents,70000);assert.equal(next.manualBalance,null);
});
test('unpaid old bills remain due and stale or missing bank balances still block a new estimate',()=>{
 const c=model(),p=plan(c,{bills:[{id:'rent',name:'Rent',amountCents:10000,nextDate:'2026-10-21',frequency:'monthly'}]}),next=c.preparePaydayCheckIn(p,choices({balanceMode:'bank'}),today);
 assert.equal(c.paydayEstimate(next,[account()],[],today,now).ready,false);assert.equal(c.paydayEstimate(next,[account()],[],today,now).billsCents,10000);
 const noBills=c.preparePaydayCheckIn(plan(c),choices({balanceMode:'bank'}),today);
 for(const accounts of [[],[account({retrievedAt:'2026-10-01T00:00:00Z'})],[account({availableCents:null})],[account({type:'credit'})]])assert.equal(c.paydayEstimate(noBills,accounts,[],today,now).ready,false);
});
test('monthly and twice-monthly payday suggestions preserve month ends and leap-day anchors',()=>{
 const c=model();let p=plan(c,{payday:{nextDate:'2027-01-31',frequency:'monthly'}});
 assert.equal(c.suggestNextPayday(p,'2027-01-31'),'2027-02-28');p=c.preparePaydayCheckIn(p,choices({nextDate:'2027-02-28',frequency:'monthly'}),'2027-01-31');assert.equal(p.payday.anchorDay,31);
 assert.equal(c.suggestNextPayday(p,'2027-02-28'),'2027-03-31');
 p.payday={nextDate:'2026-10-15',frequency:'semimonthly'};assert.equal(c.suggestNextPayday(p,today),'2026-10-31');assert.equal(c.suggestNextPayday(p,'2026-10-31'),'2026-11-15');
});
test('invalid, duplicate or incomplete check-ins cannot silently replace the current plan',()=>{
 const c=model(),p=plan(c),before=JSON.stringify(p);
 for(const extra of [{nextDate:today},{nextDate:'2026-02-31'},{nextDate:'2028-01-01'},{frequency:'weekly-unrecognized'},{essentialAmounts:[100]},{essentialAmounts:[-1,10]},{cushionCents:1.5},{balanceCents:NaN},{balanceMode:'other'}])assert.throws(()=>c.preparePaydayCheckIn(p,choices(extra),today));
 assert.throws(()=>c.preparePaydayCheckIn({...p,selectedAccountIds:[]},choices({balanceMode:'bank'}),today),/spending account/);assert.equal(JSON.stringify(p),before);
 const next=c.preparePaydayCheckIn(p,choices({balanceCents:-100}),today);assert.equal(c.paydayEstimate(next,[],[],today,now).leftCents,-30100);
 assert.equal(c.validFlowPlanning({...p,payday:{...p.payday,anchorDay:32}}),false);
 assert.equal(c.validFlowPlanning({...p,lastPaydayCheckIn:{date:today,previousPayday:today,nextPayday:'invalid'}}),false);
});
