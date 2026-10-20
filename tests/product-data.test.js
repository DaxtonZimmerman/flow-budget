const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const today='2026-10-20',now=Date.parse('2026-10-20T16:00:00Z');
function model(){
 const saved=new Map(),c=vm.createContext({Date,Event,crypto:require('node:crypto'),localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},document:{dispatchEvent:()=>{},addEventListener:()=>{}},window:{addEventListener:()=>{}},navigator:{onLine:true},flowCloudUrl:'',flowCloudKey:''});
 for(const name of ['planning-data','product-data','bill-data','money-data','budget-data','review-data','bank-data','transaction-details-data','cloud-sync'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${name}.js`,'utf8'),c);
 return {c,saved};
}
function plan(c){return {...c.defaultFlowPlanning(),setup:{step:5,completed:true},periodStartedOn:'2026-10-17',selectedAccountIds:['bank:cash'],manualBalance:{cents:100000,date:today},payday:{nextDate:'2026-10-30',frequency:'biweekly'},billsConfirmed:true,reservesConfirmed:true,essentials:[{id:'food',name:'Food',category:'Food',amountCents:10000}],cushionCents:10000,features:c.flowFeatureDefaults()};}
const cash=(extra={})=>({id:'bank:cash',accountId:'cash',bankConnectionId:'bank',name:'Checking',type:'depository',subtype:'checking',currency:'USD',availableCents:100000,currentCents:100000,retrievedAt:'2026-10-20T15:00:00Z',bankUpdatedAt:'2026-10-20T12:00:00Z',...extra});
const card=(extra={})=>cash({id:'bank:card',accountId:'card',name:'Credit card',type:'credit',subtype:'credit card',availableCents:900000,currentCents:20000,...extra});
const expense=(extra={})=>({id:'e',source:'bank',bankConnectionId:'bank',accountId:'cash',bankTransactionId:'e',name:'Market',amount:-50,date:'2026-10-19',status:'posted',type:'Expense',category:'Food',notes:'',...extra});
const estimate=(c,p,accounts=[cash()],tx=[])=>c.paydayEstimate(p,accounts,tx,today,now);
const config=(c,tx=[],extra={})=>({id:'credit-plan',accountId:'bank:card',mode:'full',reserveCents:20000,confirmedOn:today,dueDate:'2026-10-25',covered:tx.map(t=>({key:c.flowTransactionKey(t),amountCents:Math.round(t.amount*100),type:t.type,pendingId:t.pendingTransactionId||null})),...extra});
test('product schema is optional for old plans, validated for new plans, and survives cloud snapshots',()=>{
 const {c,saved}=model(),p=plan(c);assert.equal(c.validFlowPlanning(p),true);const old={...p};delete old.features;assert.equal(c.validFlowPlanning(old),true);
 c.replaceFlowSnapshot({transactions:[],bankAccounts:[cash()],flowPlanning:p});assert.equal(c.getFlowSnapshot().flowPlanning.features.version,1);
 for(const bad of [{...p.features,version:2},{...p.features,goals:[{id:'x',name:'Goal',targetCents:100,reservedCents:-1,contributionCents:0,location:'inside'}]},{...p.features,categories:[{id:'a',name:'Pets',archived:false},{id:'b',name:'pets',archived:false}]}])assert.equal(c.validFlowPlanning({...p,features:bad}),false);
 const before=saved.get('flowPlanning');assert.throws(()=>c.replaceFlowSnapshot({transactions:[],flowPlanning:{...p,features:{version:99}}}));assert.equal(saved.get('flowPlanning'),before);
});
test('split allocations change categories without changing original totals, amounts, notes, or identities',()=>{
 const {c}=model(),t=expense(),before=JSON.stringify(t),s=c.flowSplitTransaction(t,[{category:'Food',cents:3000},{category:'Shopping',cents:2000}]);
 assert.equal(JSON.stringify(t),before);assert.equal(s.amount,-50);assert.equal(s.bankTransactionId,'e');assert.equal(c.getMoneyTotals([s]).spending,50);assert.equal(c.getBudgetSpending('Food',[s],'2026-10'),30);assert.equal(c.getBudgetSpending('Shopping',[s],'2026-10'),20);
 const b=c.getSpendingBreakdown([s],'2026-10',31);assert.equal(b.categorySpending.Food,30);assert.equal(b.categorySpending.Shopping,20);assert.equal(b.weeklySpending.reduce((n,x)=>n+x,0),50);
 for(const parts of [[{category:'Food',cents:100}],[{category:'Food',cents:3000},{category:'Other',cents:3000}],[{category:'Food',cents:-1},{category:'Other',cents:5001}]])assert.throws(()=>c.flowSplitTransaction(t,parts));
 assert.throws(()=>c.flowSplitTransaction({...t,type:'Transfer'},[{category:'Other',cents:2500},{category:'Food',cents:2500}]));
});
test('bank updates keep valid splits and ask for review when the original amount changes',()=>{
 const {c}=model(),t=c.flowSplitTransaction(expense(),[{category:'Food',cents:3000},{category:'Shopping',cents:2000}]);
 const row={transaction_id:'e',account_id:'cash',date:t.date,amount:50,name:t.name,pending:false};
 const kept=c.mergeBankSnapshot([t],'bank',[row])[0];assert.equal(kept.allocations.length,2);assert.equal(kept.allocationIssue,undefined);
 const changed=c.mergeBankSnapshot([t],'bank',[{...row,amount:55}])[0];assert.equal(changed.allocationIssue,true);assert.equal(changed.reviewStatus,'needs-review');assert.equal(c.getMoneyTotals([changed]).spending,55);assert.equal(c.flowTransactionParts(changed)[0].cents,5500);
});
test('a partial reimbursement only reverses its linked amount and leaves a mixed-deposit remainder as income',()=>{
 const {c}=model(),e=expense({amount:-100}),r=expense({id:'r',bankTransactionId:'r',amount:75,type:'Income',category:'Income'});
 const rows=c.flowLinkRefund([e,r],'r','e',5000),credit=rows[1],total=c.getMoneyTotals(rows);
 assert.equal(total.spending,50);assert.equal(total.income,25);assert.equal(total.net,-25);assert.equal(credit.amount,75);assert.equal(credit.relatedExpense.cents,5000);
 assert.equal(c.getBudgetSpending('Food',rows,'2026-10'),50);
 assert.throws(()=>c.flowLinkRefund([...rows,{...r,id:'r2',bankTransactionId:'r2'}],'r2','e',6000));
 assert.throws(()=>c.flowLinkRefund([e,{...r,status:'pending'}],'r','e',5000));
});
test('split refunds preserve the exact cent total through category reporting',()=>{
 const {c}=model(),e=c.flowSplitTransaction(expense({amount:-10.01}),[{category:'Food',cents:501},{category:'Shopping',cents:500}]),r=expense({id:'r',bankTransactionId:'r',amount:5,type:'Income'});
 const rows=c.flowLinkRefund([e,r],'r','e',500),parts=c.flowTransactionParts(rows[1]);assert.equal(parts.reduce((n,p)=>n+p.cents,0),500);assert.equal(c.getMoneyTotals(rows).spending,5.01);
});
test('an unreflected essential purchase reduces cash and its reserve once, while extra spending reduces flexible money',()=>{
 const {c}=model(),p=plan(c),t=expense({source:'manual',date:today,amount:-30});
 p.features.adjustments=[{id:'a',transactionKey:c.flowTransactionKey(t),fingerprint:c.flowTransactionStamp(t),balanceKey:c.flowBalanceKey(p,[cash()]),confirmedOn:today}];
 const e=estimate(c,p,[cash()],[t]);assert.equal(e.adjustmentsCents,3000);assert.equal(e.essentialsCents,7000);assert.equal(e.leftCents,80000);
 t.category='Shopping';p.features.adjustments[0].fingerprint=c.flowTransactionStamp(t);assert.equal(estimate(c,p,[cash()],[t]).leftCents,77000);
 p.manualBalance.cents=99000;assert.equal(estimate(c,p,[cash()],[t]).ready,false);
});
test('today’s explicitly covered manual purchase releases an essential reserve once, including duplicate input records',()=>{
 const {c}=model(),p=plan(c),t=expense({source:'manual',date:today,amount:-30});p.manualBalance.covered=[{key:c.flowTransactionKey(t),fingerprint:c.flowTransactionStamp(t)}];
 const e=estimate(c,p,[cash()],[t,{...t}]);assert.equal(e.essentialsCents,7000);assert.equal(e.leftCents,83000);
});
test('dated split purchases release the correct categories instead of the whole parent category',()=>{
 const {c}=model(),p=plan(c);p.manualBalance=null;
 const t=c.flowSplitTransaction(expense(),[{category:'Food',cents:3000},{category:'Shopping',cents:2000}]);
 assert.equal(estimate(c,p,[cash()],[t]).essentialsCents,7000);
});
test('purchase previews use existing essentials once, keep cushion reserved, and never mutate the plan',()=>{
 const {c}=model(),p=plan(c),e=estimate(c,p),before=JSON.stringify(p);
 const food=c.flowPurchasePreview(e,15000,'Food',today,today,p.payday.nextDate);assert.equal(food.usesReserveCents,10000);assert.equal(food.extraCents,5000);assert.equal(food.afterCents,75000);
 const extra=c.flowPurchasePreview(e,90000,'Shopping',today,today,p.payday.nextDate);assert.equal(extra.shortfall,true);assert.equal(extra.afterCents,-10000);assert.equal(JSON.stringify(p),before);
 assert.throws(()=>c.flowPurchasePreview({...e,ready:false},100,'Food',today,today,p.payday.nextDate));assert.throws(()=>c.flowPurchasePreview(e,100,'Food','2026-11-01',today,p.payday.nextDate));
});
test('goal money inside selected cash is reserved; excluded savings is not deducted again',()=>{
 const {c}=model(),p=plan(c);p.features.goals=[{id:'g',name:'Emergency',targetCents:100000,reservedCents:20000,contributionCents:1000,location:'inside',dueDate:''}];
 assert.equal(estimate(c,p).goalsCents,20000);assert.equal(estimate(c,p).leftCents,60000);p.features.goals[0].location='outside';assert.equal(estimate(c,p).leftCents,80000);
});
test('a goal linked to an upcoming annual bill reserves the union of the bill and fund, not both',()=>{
 const {c}=model(),p=plan(c);p.bills=[{id:'annual',name:'Annual',amountCents:30000,nextDate:'2026-10-25',frequency:'yearly'}];
 p.features.goals=[{id:'g',name:'Annual fund',targetCents:30000,reservedCents:20000,contributionCents:1000,location:'inside',dueDate:'2026-10-25',billId:'annual',coveredBillPayments:[]}];
 let e=estimate(c,p);assert.equal(e.billsCents,30000);assert.equal(e.goalsCents,0);assert.equal(e.leftCents,50000);
 p.bills[0].amountCents=15000;e=estimate(c,p);assert.equal(e.goalsCents,5000);assert.equal(e.leftCents,60000);
 p.bills[0].nextDate='2026-11-01';e=estimate(c,p);assert.equal(e.goalsCents,20000);assert.equal(e.leftCents,60000);
});
test('a reflected bill payment consumes its linked fund once across repeated estimates',()=>{
 const {c}=model(),p=plan(c);p.bills=[{id:'annual',name:'Annual',amountCents:30000,nextDate:'2026-10-25',frequency:'yearly'}];p.features.goals=[{id:'g',name:'Annual fund',targetCents:30000,reservedCents:30000,contributionCents:0,location:'inside',dueDate:'',billId:'annual',coveredBillPayments:[]}];
 p.billPaymentDecisions=[{billId:'annual',dueDate:'2026-10-25',choice:'manual',confirmedOn:today}];
 for(let n=0;n<3;n++){const e=estimate(c,p);assert.equal(e.goalsCents,0);assert.equal(e.goals[0].remainingCents,0);assert.equal(e.billsCents,0);}
});
test('partial bills release only the confirmed reflected amount and need a check after a balance change',()=>{
 const {c}=model(),p=plan(c);p.bills=[{id:'rent',name:'Rent',amountCents:40000,nextDate:'2026-10-25',frequency:'monthly'}];p.features.partialBills=[{id:'part',billId:'rent',dueDate:'2026-10-25',paidCents:10000,balanceKey:c.flowBalanceKey(p,[cash()])}];
 assert.equal(estimate(c,p).billsCents,30000);p.manualBalance.cents-=100;assert.equal(estimate(c,p).ready,false);assert.equal(estimate(c,p).billsCents,40000);
});
test('variable, skipped, single-occurrence amounts and end dates affect the obligation without modifying bank records',()=>{
 const {c}=model(),p=plan(c);p.bills=[{id:'utility',name:'Utility',amountCents:5000,variable:true,ceilingCents:8000,nextDate:'2026-10-25',frequency:'monthly',endDate:'2026-11-25',occurrenceOverrides:[{date:'2026-10-25',amountCents:6500,skipped:false}]}];
 assert.equal(estimate(c,p).billsCents,6500);assert.equal(c.billAmountAt(p.bills[0],'2026-11-25'),8000);
 p.bills[0].occurrenceOverrides[0].skipped=true;assert.equal(estimate(c,p).billsCents,0);
 const rows=c.planBillOccurrences(p,'2027-02-01');assert.equal(rows.length,1);assert.equal(rows[0].dueDate,'2026-11-25');
 assert.equal(c.validFlowPlanning({...p,bills:[{...p.bills[0],ceilingCents:100}]}),false);
});
test('card limits never become cash and an unconfigured card blocks an unsupported complete estimate',()=>{
 const {c}=model(),p=plan(c);assert.equal(estimate(c,p,[cash(),card()]).ready,false);assert.equal(estimate(c,p,[cash(),card()]).balanceCents,100000);
 p.features.cards=[config(c)];const e=estimate(c,p,[cash(),card()]);assert.equal(e.ready,true);assert.equal(e.cardsCents,20000);assert.equal(e.leftCents,60000);
});
test('new card spending is reserved, pending refunds do not release cash, and posted refunds reduce repayment reserves',()=>{
 const {c}=model(),p=plan(c),a=[cash(),card()];p.features.cards=[config(c)];
 const t=expense({accountId:'card',id:'charge',bankTransactionId:'charge',date:today,amount:-30});
 assert.equal(estimate(c,p,a,[t]).cardsCents,23000);
 const r=expense({accountId:'card',id:'refund',bankTransactionId:'refund',date:today,amount:10,type:'Refund',status:'pending'});
 assert.equal(estimate(c,p,a,[t,r]).cardsCents,23000);r.status='posted';assert.equal(estimate(c,p,a,[t,r]).cardsCents,22000);
});
test('covered pending charges do not reserve money twice when they post',()=>{
 const {c}=model(),p=plan(c),pending=expense({accountId:'card',id:'pending',bankTransactionId:'pending',date:today,amount:-30,status:'pending'});p.features.cards=[config(c,[pending])];
 const posted={...pending,id:'posted',bankTransactionId:'posted',pendingTransactionId:'pending',status:'posted'};
 assert.equal(estimate(c,p,[cash(),card()],[posted]).cardsCents,20000);
 assert.equal(estimate(c,p,[cash(),card()],[{...posted,amount:-35}]).ready,false);
});
test('a matched repayment is not spending or income, and only releases a reserve after its cash effect is covered',()=>{
 const {c}=model(),p=plan(c),a=[cash(),card()],debit=expense({id:'pay-out',bankTransactionId:'pay-out',name:'Card payment',date:today,amount:-50,category:'Bills'}),credit=expense({id:'pay-in',bankTransactionId:'pay-in',accountId:'card',name:'Payment received',date:today,amount:50,type:'Income'});
 p.features.cards=[config(c)];let rows=c.flowMatchCardPayment([debit,credit],a,'pay-out','pay-in');assert.equal(c.getMoneyTotals(rows).spending,0);assert.equal(c.getMoneyTotals(rows).income,0);assert.equal(estimate(c,p,a,rows).ready,false);
 p.manualBalance.covered=[{key:c.flowTransactionKey(rows[0]),fingerprint:c.flowTransactionStamp(rows[0])}];let e=estimate(c,p,a,rows);assert.equal(e.ready,true);assert.equal(e.cardsCents,15000);
 rows[0].notes='A newer note';const undone=c.flowUndoCardPayment(rows,'pay-out');assert.equal(undone[0].notes,'A newer note');assert.equal(undone[0].type,'Expense');assert.equal(undone[1].type,'Income');
});
test('a changed or removed card payment cannot release repayment reserves',()=>{
 const {c}=model(),p=plan(c),a=[cash(),card()],debit=expense({id:'out',date:today,bankTransactionId:'out',amount:-50}),credit=expense({id:'in',date:today,bankTransactionId:'in',accountId:'card',amount:50,type:'Income'});p.features.cards=[config(c)];
 const rows=c.flowMatchCardPayment([debit,credit],a,'out','in');p.manualBalance.covered=rows.map(t=>({key:c.flowTransactionKey(t),fingerprint:c.flowTransactionStamp(t)}));
 assert.equal(estimate(c,p,a,[rows[1]]).ready,false);rows[0].amount=-55;assert.equal(estimate(c,p,a,rows).ready,false);
});
test('fixed debt payments are reserved when due and older arriving card activity requires a confirmation',()=>{
 const {c}=model(),p=plan(c),a=[cash(),card()];p.features.cards=[config(c,[],{mode:'fixed',dueDate:'2026-11-10'})];assert.equal(estimate(c,p,a).cardsCents,0);
 const old=expense({accountId:'card',date:'2026-10-18'});assert.equal(estimate(c,p,a,[old]).ready,false);
 p.features.cards=[config(c,[],{mode:'outside'})];assert.equal(estimate(c,p,a).ready,true);
});
test('funded card purchases consume essentials once; pending and start-day purchases remain conservative',()=>{
 const {c}=model(),p=plan(c),a=[cash(),card()];p.features.cards=[config(c)];
 const t=expense({accountId:'card',id:'groceries',bankTransactionId:'groceries',date:today,amount:-30});
 let e=estimate(c,p,a,[t]);assert.equal(e.cardsCents,23000);assert.equal(e.essentialsCents,7000);assert.equal(e.leftCents,60000);
 e=estimate(c,p,a,[{...t,status:'pending'}]);assert.equal(e.cardsCents,23000);assert.equal(e.essentialsCents,10000);assert.equal(e.leftCents,57000);
 p.periodStartedOn=today;e=estimate(c,p,a,[t]);assert.equal(e.essentialsCents,10000);
 p.features.cards[0].essentialPeriodKey=c.flowReservePeriodKey(p);p.features.cards[0].essentialCovered=[c.flowTransactionKey(t)];
 assert.equal(estimate(c,p,a,[t]).essentialsCents,7000);p.reservePeriodKey='next-plan';assert.equal(estimate(c,p,a,[t]).essentialsCents,10000);
});
test('new card purchases are reserved even when a fixed debt payment falls after payday',()=>{
 const {c}=model(),p=plan(c),a=[cash(),card()];p.features.cards=[config(c,[],{mode:'fixed',dueDate:'2026-11-10'})];
 const t=expense({accountId:'card',id:'new',bankTransactionId:'new',date:today,amount:-30});
 const e=estimate(c,p,a,[t]);assert.equal(e.ready,true);assert.equal(e.cardsCents,3000);assert.equal(e.essentialsCents,7000);assert.equal(e.leftCents,80000);
});
test('a confirmed bill paid using a funded card is not reserved again as an unpaid bill',()=>{
 const {c}=model(),p=plan(c),a=[cash(),card()],t=expense({accountId:'card',id:'phone',bankTransactionId:'phone',name:'Phone',date:today,amount:-50,category:'Bills'});
 p.features.cards=[config(c)];p.bills=[{id:'phone',name:'Phone',amountCents:5000,nextDate:today,frequency:'monthly',tracking:{merchant:'phone',currency:'USD',accountId:'card',bankConnectionId:'bank'}}];
 const next=c.decideBillPayment(p,[t],a,'phone',today,'paid',c.billPaymentKey(t),false,today,now);
 const e=estimate(c,next,a,[t]);assert.equal(e.billsCents,0);assert.equal(e.cardsCents,25000);assert.equal(e.essentialsCents,10000);assert.equal(e.leftCents,55000);
});
test('malformed balance proofs, card confirmation metadata, and transaction extras fail validation',()=>{
 const {c}=model(),p=plan(c);p.manualBalance.covered=[{key:'x',fingerprint:42}];assert.equal(c.validFlowPlanning(p),false);
 delete p.manualBalance.covered;p.features.cards=[config(c,[],{essentialCovered:[42]})];assert.equal(c.validFlowPlanning(p),false);
 assert.equal(c.validFlowTransactionExtras({...expense(),relatedExpense:{key:'x',cents:-1}}),false);
 assert.equal(c.validFlowTransactionExtras({...expense(),cardPayment:{peerKey:'x',fingerprint:'x',previousType:'unknown'}}),false);
});
test('reserve suggestions require enough history, disclose their basis, and do not invent a cushion',()=>{
 const {c}=model(),p=plan(c);assert.equal(c.flowReserveSuggestions(p,[expense()],[cash()],today),null);
 const tx=[0,1,2,3].map((n)=>expense({id:'history'+n,bankTransactionId:'history'+n,date:['2026-10-01','2026-10-06','2026-10-11','2026-10-16'][n],amount:-10,category:n===3?'Other':'Food'}));
 const before=JSON.stringify(p),s=c.flowReserveSuggestions(p,tx,[cash()],today);assert.equal(s.transactions,4);assert.equal(s.observedDays,20);assert.equal(s.days,10);assert.equal(s.amounts.Food,1500);assert.equal(s.uncategorized,1);assert.equal(s.cushionCents,undefined);assert.equal(JSON.stringify(p),before);
});
test('linked reimbursements retain their allocation meaning and cannot be re-split before unlinking',()=>{
 const {c}=model(),e=expense({amount:-100}),r=expense({id:'r',bankTransactionId:'r',amount:75,type:'Income',category:'Income'}),linked=c.flowLinkRefund([e,r],'r','e',5000)[1];
 assert.throws(()=>c.flowSplitTransaction(linked,[{category:'Food',cents:5000},{category:'Shopping',cents:2500}]));
 const changed={...linked,amount:80,allocationIssue:true};assert.equal(c.flowReportingAmounts(changed).spendingCents,-5000);assert.equal(c.flowReportingAmounts(changed).incomeCents,3000);
});
test('paused category and transfer rules leave existing choices intact and do not classify new payments',()=>{
 const {c}=model(),rule={id:'r',name:'market',label:'Market',type:'Expense',category:'Shopping',paused:true},row={transaction_id:'new',account_id:'cash',name:'Market',amount:5,date:today};
 assert.equal(c.bankTransactionFromPlaid(row,'cash',null,[rule]).category,'Other');
 const existing=expense({category:'Shopping',categoryRuleId:'r',reviewStatus:'reviewed'});assert.equal(c.bankTransactionFromPlaid({...row,transaction_id:'e'},'cash',existing,[rule]).category,'Shopping');
 const transferRule={...rule,bankType:'Transfer',accountId:'cash'},transfer=expense({type:'Transfer',typeOverride:true,bankTypeRuleId:'r',reviewStatus:'reviewed'});
 const kept=c.bankTransactionFromPlaid({...row,transaction_id:'e'},'cash',transfer,[transferRule]);assert.equal(kept.type,'Transfer');assert.equal(kept.bankTypeRuleId,'r');assert.equal(c.bankTransactionFromPlaid(row,'cash',null,[transferRule]).type,'Expense');
});
test('weekly summaries exclude transfers and pending activity; reminders respect preferences and dated snoozes',()=>{
 const {c}=model(),p=plan(c),tx=[expense(),expense({id:'pending',status:'pending'}),expense({id:'transfer',type:'Transfer'})],summary=c.flowWeeklySummary(p,tx,[cash()],today);
 assert.equal(summary.spendingCents,5000);assert.equal(summary.due,true);p.features.checkIn={date:today,note:'Checked'};assert.equal(c.flowWeeklySummary(p,tx,[cash()],today).due,false);
 p.bills=[{id:'phone',name:'Phone',amountCents:1000,nextDate:'2026-10-22',frequency:'monthly'}];p.preferences.remindersEnabled=true;const e=estimate(c,p);let items=c.flowReminderItems(p,e,[cash()],tx,today);assert.equal(items.length,1);p.features.reminders=[{id:items[0].id,until:'2026-10-21'}];assert.equal(c.flowReminderItems(p,e,[cash()],tx,today).length,0);p.features.reminders=[];p.preferences.billReminders=false;assert.equal(c.flowReminderItems(p,e,[cash()],tx,today).length,0);
});
test('change explanations compare known components only within the same ready pay period',()=>{
 const {c}=model(),p=plan(c),before=c.flowEstimateSnapshot(p,estimate(c,p),today);p.cushionCents+=1000;const after=c.flowEstimateSnapshot(p,estimate(c,p),today),changes=c.flowExplainChange(before,after);assert.equal(changes.length,1);assert.equal(changes[0].key,'cushionCents');assert.equal(changes[0].deltaCents,1000);assert.equal(c.flowExplainChange(before,{...after,ready:false}).length,0);assert.equal(c.flowExplainChange(before,{...after,payday:'2026-11-01'}).length,0);
});
