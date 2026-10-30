const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const today='2026-10-29',now=Date.parse('2026-10-29T18:00:00Z');
function model(){const c=vm.createContext({Date,Intl});for(const n of ['planning-data','product-data','growth-data','bill-data','money-data','budget-data','notification-data'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${n}.js`,'utf8'),c);return c;}
function snapshot(c){return {flowPlanning:{...c.defaultFlowPlanning(),setup:{step:5,completed:true},periodStartedOn:'2026-10-23',manualBalance:{cents:100000,date:today},payday:{nextDate:'2026-11-06',frequency:'biweekly'},billsConfirmed:true,reservesConfirmed:true,essentials:[],bills:[{id:'phone',name:'Phone',amountCents:4500,nextDate:'2026-11-01',frequency:'monthly'}]},transactions:[],bankAccounts:[],budgets:[],budgetsByMonth:{}};}
const tx=(id,amount,extra={})=>({id,name:'Shop',type:'Expense',amount,source:'manual',category:'Food',status:'posted',date:today,...extra});
test('bill reminders have separate coming-up and due-today stages, respect quiet settings and remove paid occurrences',()=>{
 const c=model(),s=snapshot(c),before=JSON.stringify(s);let rows=c.flowNotificationItems(s,today,now);assert.equal(rows.length,1);assert.match(rows[0].title,/Phone is coming up/);assert.equal(rows[0].push,true);const first=rows[0].id;
 rows=c.flowNotificationItems(s,'2026-11-01',now);assert.notEqual(rows[0].id,first);assert.match(rows[0].title,/due today/);
 assert.equal(c.flowNotificationItems(s,'2026-10-28',now).length,0);assert.equal(JSON.stringify(s),before);
 s.flowPlanning.billPaymentDecisions=[{billId:'phone',dueDate:'2026-11-01',choice:'manual',confirmedOn:today}];assert.equal(c.flowNotificationItems(s,today,now).length,0);
 s.flowPlanning.billPaymentDecisions=[];s.flowPlanning.preferences.billReminders=false;assert.equal(c.flowNotificationItems(s,today,now).length,0);
});
test('monthly limits use exact split and refund amounts, ignore transfers, pending, future and duplicate activity, and reset each month',()=>{
 const c=model(),s=snapshot(c);s.flowPlanning.bills=[];s.budgets=[{id:'food',category:'Food',limit:100}];
 const split=c.flowSplitTransaction(tx('split',-100),[{category:'Food',cents:9000},{category:'Shopping',cents:1000}]);
 s.transactions=[split,{...split},tx('refund',10,{type:'Refund'}),tx('pending',-1000,{status:'pending'}),tx('transfer',-1000,{type:'Transfer'}),tx('future',-1000,{date:'2026-10-30'})];
 let rows=c.flowNotificationItems(s,today,now);assert.equal(rows.length,1);assert.equal(rows[0].text,'80% of your monthly limit used.');assert.equal(rows[0].href,'budgets.html?view=categories&month=2026-10');assert.match(rows[0].title,/getting close/);const near=rows[0].id;
 s.transactions.push(tx('new',-20));rows=c.flowNotificationItems(s,today,now);assert.notEqual(rows[0].id,near);assert.match(rows[0].title,/reached its limit/);
 s.budgetsByMonth['2026-10']=[];assert.equal(c.flowNotificationItems(s,today,now).length,0);
 s.budgetsByMonth={};assert.equal(c.flowNotificationItems(s,'2026-11-01',now).length,0);
});
test('payday reminders use recorded activity without requiring a dated bank balance and honor snooze, global and category preferences',()=>{
 const c=model(),s=snapshot(c);s.flowPlanning.bills=[];s.flowPlanning.essentials=[{id:'food',name:'Food',category:'Food',amountCents:10000}];s.transactions=[tx('food',-85)];
 let rows=c.flowNotificationItems(s,today,now);assert.equal(rows.length,1);assert.equal(rows[0].text,'85% of your payday set-aside used.');
 s.flowPlanning.features=c.flowFeatureDefaults();s.flowPlanning.features.reminders=[{id:rows[0].id,until:today}];assert.equal(c.flowNotificationItems(s,today,now).length,0);assert.equal(c.flowNotificationItems(s,'2026-10-30',now).length,1);
 s.flowPlanning.preferences.budgetReminders=false;assert.equal(c.flowNotificationItems(s,'2026-10-30',now).length,0);
 s.flowPlanning.preferences.budgetReminders=true;s.flowPlanning.preferences.remindersEnabled=false;assert.equal(c.flowNotificationItems(s,'2026-10-30',now).length,0);
});
test('notification clock uses the device time zone across midnight and daylight-saving changes',()=>{
 const c=model();let clock=c.flowNotificationClock('America/Denver',Date.parse('2026-10-30T02:00:00Z'));assert.equal(clock.today,'2026-10-29');assert.equal(clock.hour,20);
 clock=c.flowNotificationClock('America/Denver',Date.parse('2026-11-01T16:00:00Z'));assert.equal(clock.hour,9);assert.equal(clock.today,'2026-11-01');assert.equal(c.flowNotificationClock('Invalid/Zone',now),null);
});
test('generated server engine produces the same alerts as the app',async()=>{
 const c=model(),s=snapshot(c);s.budgets=[{category:'Food',limit:100}];s.transactions=[tx('meal',-90)];
 const engine=await import('../supabase/functions/_shared/notification-engine.mjs');assert.equal(JSON.stringify(engine.buildNotifications(s,today,now)),JSON.stringify(c.flowNotificationItems(s,today,now)));
});
test('notification opt-in is a one-time offer only on a supported signed-in Home after setup',()=>{
 const c=model(),ready={demo:false,onHome:true,setupComplete:true,remindersEnabled:true,supported:true,ready:true,permission:'default',subscribed:false,seen:false};assert.equal(c.flowShouldOfferNotifications(ready),true);
 for(const delta of [{demo:true},{onHome:false},{setupComplete:false},{remindersEnabled:false},{supported:false},{ready:false},{permission:'denied'},{permission:'granted'},{subscribed:true},{seen:true}])assert.equal(c.flowShouldOfferNotifications({...ready,...delta}),false);
});
