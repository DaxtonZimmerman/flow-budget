const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function model(){const saved=new Map();const c=vm.createContext({Date,Event,localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},document:{dispatchEvent:()=>{}}});for(const file of ['planning-data','bill-data'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${file}.js`,'utf8'),c);return c;}
const today='2026-10-20',now=Date.parse('2026-10-20T16:00:00Z');
const account=(extra={})=>({id:'conn:cash',accountId:'cash',bankConnectionId:'conn',name:'Checking',type:'depository',subtype:'checking',currency:'USD',availableCents:90000,currentCents:90000,retrievedAt:'2026-10-20T15:00:00Z',bankUpdatedAt:'2026-10-20T12:00:00Z',...extra});
const tx=(extra={})=>({id:'t',bankTransactionId:'t',source:'bank',bankConnectionId:'conn',accountId:'cash',name:'Stream service',type:'Expense',amount:-10,date:'2026-10-19',status:'posted',category:'Entertainment',...extra});
const bill=(extra={})=>({id:'b',name:'Stream service',amountCents:1000,nextDate:'2026-10-19',frequency:'monthly',anchorDay:19,tracking:{merchant:'stream service',bankConnectionId:'conn',accountId:'cash',currency:'USD'},...extra});
function plan(c,extra={}) {return {...c.defaultFlowPlanning(),setup:{step:5,completed:true},periodStartedOn:'2026-10-17',selectedAccountIds:['conn:cash'],payday:{nextDate:'2026-10-30',frequency:'biweekly'},bills:[bill()],billsConfirmed:true,reservesConfirmed:true,...extra};}
function state(c,p,rows=[tx()],accounts=[account()]){return c.getBillTrackingState(p,accounts,rows,today,now);}
function decide(c,p,rows,choice='paid',update=false){return c.decideBillPayment(p,rows,[account()], 'b','2026-10-19',choice,c.billPaymentKey(rows[0]),update,today,now);}
test('bill suggestions are scoped, show evidence, and never create obligations or change source data',()=>{
 const c=model(),p=plan(c,{bills:[]});const rows=[tx({id:'sep',bankTransactionId:'sep',date:'2026-09-19'}),tx()];const before=JSON.stringify([p,rows]);const s=c.suggestRecurringBills(p,[account()],rows,today);
 assert.equal(s.length,1);assert.equal(s[0].frequency,'monthly');assert.equal(s[0].nextDate,'2026-11-19');assert.equal(s[0].sampleCount,2);assert.equal(s[0].tracking.accountId,'cash');assert.equal(JSON.stringify([p,rows]),before);
 p.dismissedBillSuggestions=[{key:s[0].key,label:s[0].name}];assert.equal(c.suggestRecurringBills(p,[account()],rows,today).length,0);
});
test('routine shopping, person-to-person payments, pending charges and unsupported accounts are not suggested as bills',()=>{
 const c=model(),p=plan(c,{bills:[]});const pairs=extra=>[tx({...extra,bankTransactionId:'sep',date:'2026-09-19'}),tx(extra)];
 for(const extra of [{category:'Food'},{category:'Shopping'},{category:'Transport'},{name:'Venmo'},{name:'PayPal'},{type:'Transfer'},{status:'pending'}])assert.equal(c.suggestRecurringBills(p,[account()],pairs(extra),today).length,0);
 assert.equal(c.suggestRecurringBills(p,[account({type:'credit'})],pairs({}),today).length,0);
 assert.equal(c.suggestRecurringBills(p,[account({currency:'EUR'})],pairs({}),today).length,0);
 const mixed=[tx({bankTransactionId:'one',date:'2026-09-19'}),tx({accountId:'other'})];assert.equal(c.suggestRecurringBills(p,[account(),account({id:'conn:other',accountId:'other'})],mixed,today).length,0);
});
test('weekly suggestions need three occurrences and stopped patterns are not treated as active bills',()=>{
 const c=model(),p=plan(c,{bills:[]}),weekly=[0,7,14].map((days,i)=>tx({bankTransactionId:String(i),date:c.addPlanDays('2026-10-19',-days)}));
 assert.equal(c.suggestRecurringBills(p,[account()],weekly,today)[0].frequency,'weekly');assert.equal(c.suggestRecurringBills(p,[account()],weekly.slice(0,2),today).length,0);
 assert.equal(c.suggestRecurringBills(p,[account()],[tx({date:'2026-06-19'}),tx({date:'2026-05-19',bankTransactionId:'old'})],today).length,0);
});
test('a clear posted bill match releases one reservation when a fresh dated cash balance includes it',()=>{
 const c=model(),p=plan(c);const s=state(c,p);assert.equal(s.rows[0].status,'paid');assert.equal(s.rows[0].paid,true);assert.equal(s.bills[0].next.dueDate,'2026-11-19');
 const estimate=c.paydayEstimate(p,[account()],[tx()],today,now);assert.equal(estimate.ready,true);assert.equal(estimate.billsCents,0);assert.equal(estimate.leftCents,90000);
});
test('pending payments, same-day payments and balances without timestamps retain the bill reservation',()=>{
 const c=model(),p=plan(c);assert.equal(state(c,p,[tx({status:'pending'})]).rows[0].status,'pending');
 assert.equal(state(c,p,[tx({date:today})]).rows[0].status,'found');
 for(const extra of [{bankUpdatedAt:null},{bankUpdatedAt:'2026-10-10T00:00:00Z'},{availableCents:null},{type:'credit'},{currency:'EUR'}])assert.equal(state(c,p,[tx()],[account(extra)]).rows[0].paid,false);
 const e=c.paydayEstimate(p,[account({bankUpdatedAt:null})],[tx()],today,now);assert.equal(e.billsCents,1000);
});
test('matching needs the confirmed merchant, bank account, direction, and date window',()=>{
 const c=model(),p=plan(c);for(const extra of [{name:'Different service'},{accountId:'other'},{bankConnectionId:'other'},{type:'Transfer'},{type:'Refund',amount:10},{date:'2026-10-01'}])assert.equal(state(c,p,[tx(extra)]).rows[0].paid,false);
});
test('one transaction cannot automatically pay two bills, and a user choice resolves the ambiguity once',()=>{
 const c=model(),p=plan(c,{bills:[bill(),bill({id:'b2',name:'Another subscription'})]});const s=state(c,p);assert.equal(s.rows.filter(r=>r.dueDate==='2026-10-19'&&r.status==='ambiguous').length,2);
 const next=decide(c,p,[tx()]);const matched=state(c,next);assert.equal(matched.rows.filter(r=>r.paid).length,1);assert.throws(()=>c.decideBillPayment(next,[tx()],[account()],'b2','2026-10-19','paid',c.billPaymentKey(tx()),false,today,now),/changed|available|another/);
});
test('duplicates collapse, conflicting duplicate facts and multiple real candidates never silently pay a bill',()=>{
 const c=model(),p=plan(c);assert.equal(state(c,p,[tx(),tx()]).rows.filter(r=>r.paid).length,1);
 assert.equal(state(c,p,[tx(),tx({amount:-11})]).rows[0].paid,false);
 assert.equal(state(c,p,[tx(),tx({bankTransactionId:'second',id:'second'})]).rows[0].status,'ambiguous');
});
test('price changes need confirmation and changing the usual amount applies only from that occurrence onward',()=>{
 const c=model(),p=plan(c);const rows=[tx({amount:-12})];const s=state(c,p,rows);assert.equal(s.rows[0].status,'amount');assert.equal(p.bills[0].amountCents,1000);
 const once=decide(c,p,rows);assert.equal(state(c,once,rows).bills[0].next.amountCents,1000);
 const updated=decide(c,p,rows,'paid',true);assert.equal(c.billAmountAt(updated.bills[0],'2026-09-19'),1000);assert.equal(state(c,updated,rows).bills[0].next.amountCents,1200);assert.equal(updated.bills[0].amountCents,1000);
 assert.equal(c.validFlowPlanning(updated),true);
});
test('removed, changed or refunded payments reopen the bill rather than permanently inflating spendable cash',()=>{
 const c=model(),p=plan(c),confirmed=decide(c,p,[tx()]);assert.equal(state(c,confirmed,[]).rows[0].status,'changed');assert.equal(state(c,confirmed,[tx({amount:-12})]).rows[0].status,'changed');
 const refund=tx({id:'refund',bankTransactionId:'refund',type:'Refund',amount:10,date:today});assert.equal(state(c,p,[tx(),refund]).rows[0].status,'refund');assert.equal(state(c,confirmed,[tx(),refund]).rows[0].paid,false);
 const acknowledged=decide(c,p,[tx(),refund]);assert.equal(state(c,acknowledged,[tx(),refund]).rows[0].paid,true);
});
test('an incorrect match can be rejected without changing any bank transaction or hiding the next obligation',()=>{
 const c=model(),p=plan(c),rows=[tx()],before=JSON.stringify(rows);const paid=decide(c,p,rows);const ignored=decide(c,paid,rows,'ignore');assert.equal(state(c,ignored,rows).rows[0].paid,false);assert.equal(state(c,ignored,rows).rows[0].status,'overdue');assert.equal(JSON.stringify(rows),before);
});
test('bill spending does not also release an everyday essential reservation',()=>{
 const c=model(),p=plan(c,{essentials:[{id:'food',name:'Food',category:'Food',amountCents:10000}],bills:[bill({amountCents:10000})]});const e=c.paydayEstimate(p,[account()],[tx({amount:-100,category:'Food'})],today,now);
 assert.equal(e.billsCents,0);assert.equal(e.essentialsCents,10000);assert.equal(e.leftCents,80000);
});
test('manual bills remain supported, and user-confirmed paid occurrences are reversible planning records',()=>{
 const c=model(),p=plan(c,{bills:[bill({tracking:undefined,frequency:'once'})]});const next=c.decideBillPayment(p,[],[],'b','2026-10-19','manual','',false,today,now);assert.equal(state(c,next,[]).rows[0].paid,true);assert.equal(state(c,next,[]).bills[0].next,null);assert.equal(c.validFlowPlanning(next),true);
});
test('bill automation schema accepts old plans and rejects duplicate claims or malformed confirmations',()=>{
 const c=model(),p=plan(c);delete p.billPaymentDecisions;delete p.dismissedBillSuggestions;assert.equal(c.validFlowPlanning(p),true);
 const confirmed=decide(c,p,[tx()]);confirmed.billPaymentDecisions.push({...confirmed.billPaymentDecisions[0],billId:'other'});assert.equal(c.validFlowPlanning(confirmed),false);
 assert.equal(c.validFlowPlanning({...p,bills:[bill({tracking:{merchant:'service'}})]}),false);
});
test('quarterly, annual and leap-day schedules preserve their anchors',()=>{
 const c=model();assert.equal(c.nextPlanDate('2026-01-31','quarterly',31),'2026-04-30');assert.equal(c.nextPlanDate('2026-04-30','quarterly',31),'2026-07-31');assert.equal(c.nextPlanDate('2024-02-29','yearly',29),'2025-02-28');assert.equal(c.nextPlanDate('2027-02-28','yearly',29),'2028-02-29');
});

test('a manually confirmed tracked bill still recognizes its later bank payment and keeps it out of essentials',()=>{
 const c=model(),p=plan(c,{bills:[bill({amountCents:10000})],essentials:[{id:'food',name:'Food',category:'Food',amountCents:10000}]});
 const confirmed=c.decideBillPayment(p,[],[account()],'b','2026-10-19','manual','',false,today,now);
 const e=c.paydayEstimate(confirmed,[account()],[tx({amount:-100,category:'Food'})],today,now);assert.equal(e.billsCents,0);assert.equal(e.essentialsCents,10000);assert.equal(e.leftCents,80000);
 const changed=state(c,confirmed,[tx({amount:-110})]);assert.equal(changed.rows[0].status,'amount');assert.equal(changed.rows[0].paid,false);
});
test('rebasing future dates keeps previously recognized bill spending separate from everyday reserves',()=>{
 const c=model(),payment=tx({amount:-100,category:'Food'}),p=plan(c,{bills:[bill({amountCents:10000,nextDate:'2026-11-19',paymentHistory:[{transactionKey:c.billPaymentKey(payment),fingerprint:c.billFingerprint(payment),dueDate:'2026-10-19'}]})],essentials:[{id:'food',name:'Food',category:'Food',amountCents:10000}]});
 assert.equal(c.validFlowPlanning(p),true);assert.equal(c.paydayEstimate(p,[account()],[payment],today,now).essentialsCents,10000);
});
test('discovery keeps a bill due today or just past due instead of skipping an unpaid cycle',()=>{
 const c=model(),p=plan(c,{bills:[]});
 for(const day of ['20','19']){
  const rows=[tx({bankTransactionId:'sep',date:`2026-09-${day}`}),tx({bankTransactionId:'aug',date:`2026-08-${day}`})];
  assert.equal(c.suggestRecurringBills(p,[account()],rows,today)[0].nextDate,`2026-10-${day}`);
 }
});
test('rejecting a remembered payment removes its earlier bill claim and restores ordinary spending treatment',()=>{
 const c=model(),payment=tx({amount:-100,category:'Food'}),history={transactionKey:c.billPaymentKey(payment),fingerprint:c.billFingerprint(payment),dueDate:'2026-10-19'};
 const p=plan(c,{bills:[bill({amountCents:10000,paymentHistory:[history]})],essentials:[{id:'food',name:'Food',category:'Food',amountCents:10000}]});
 const ignored=decide(c,p,[payment],'ignore');assert.equal(ignored.bills[0].paymentHistory.length,0);
 assert.equal(state(c,ignored,[payment]).excludedPayments.has(history.transactionKey),false);
 assert.equal(c.paydayEstimate(ignored,[account()],[payment],today,now).essentialsCents,0);
 const restoredHistory=JSON.parse(JSON.stringify(ignored));restoredHistory.bills[0].paymentHistory=[history];
 assert.equal(state(c,restoredHistory,[payment]).excludedPayments.has(history.transactionKey),false);
});
