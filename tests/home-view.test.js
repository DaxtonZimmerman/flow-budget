const test = require('node:test'), assert = require('node:assert/strict');
const {flowHomeSourceStatus, flowHomeTasks} = require('../js/home-view.js');
const today='2026-10-20', now=Date.parse(today+'T18:00:00Z');
test('a recent retrieval never becomes a claim that the bank balance is current',()=>{
 const p={selectedAccountIds:['cash']},a={id:'cash',retrievedAt:new Date(now).toISOString(),bankUpdatedAt:null};
 const status=flowHomeSourceStatus(p,[a],today,now);assert.equal(status.kind,'unknown');assert.equal(status.caution,false);assert.match(status.label,/Bank estimate · checked/);assert.doesNotMatch(status.label,/balance (dated|updated)|current|live/i);
});
test('manual confirmation expires on a new day, independent of a fresh account fetch',()=>{
 assert.equal(flowHomeSourceStatus({manualBalance:{date:today}},[],today,now).kind,'confirmed');
 assert.equal(flowHomeSourceStatus({manualBalance:{date:'2026-10-19'}},[],today,now).kind,'check');
});
test('the oldest selected bank snapshot governs the source status',()=>{
 const p={selectedAccountIds:['a','b']},a=[{id:'a',retrievedAt:new Date(now).toISOString(),bankUpdatedAt:new Date(now).toISOString()},{id:'b',retrievedAt:new Date(now).toISOString(),bankUpdatedAt:'2026-10-18T12:00:00Z'}];
 assert.equal(flowHomeSourceStatus(p,a,today,now).kind,'check');
 assert.equal(flowHomeSourceStatus({selectedAccountIds:['a','missing']},a,today,now).kind,'check');
});
test('a repayment or money check takes priority over a large review queue',()=>{
 const tasks=flowHomeTasks({setup:{completed:true}},{ready:false,missing:['Set a repayment plan for your card']},{alerts:[],suggestions:[]},140,[],false);
 assert.equal(tasks[0].key,'check');assert.match(tasks[0].text,/repayment/);assert.equal(tasks[1].key,'review');
});
test('first setup and a new payday are explicit choices, not an automatic historical review',()=>{
 const e={ready:false,missing:['Finish your setup']},tracking={alerts:[],suggestions:[]};
 assert.equal(flowHomeTasks({setup:{completed:false}},e,tracking,140,[],false)[0].key,'setup');
 assert.equal(flowHomeTasks({setup:{completed:true}},e,tracking,140,[],true)[0].key,'payday');
});
test('shortfall and bill attention stay ahead of optional categories and summaries',()=>{
 const tasks=flowHomeTasks({setup:{completed:true}},{ready:true,leftCents:-1000},{alerts:[{}],suggestions:[{}]},4,[{action:'weekly'}],false);
 assert.deepEqual(tasks.map(t=>t.key),['shortfall','bills','review','weekly']);assert.equal(tasks[1].href,'bills.html#bill-tracking');
});

test('missing bank dates do not hide stale or invalid dated balances from another account',()=>{
 const p={selectedAccountIds:['a','b']};
 for(const bankUpdatedAt of ['2026-10-18T12:00:00Z','invalid','2026-10-22T12:00:00Z']){
  const a=[{id:'a',retrievedAt:new Date(now).toISOString(),bankUpdatedAt:null},{id:'b',retrievedAt:new Date(now).toISOString(),bankUpdatedAt}];
  const s=flowHomeSourceStatus(p,a,today,now);assert.equal(s.caution,true);assert.match(s.label,/Check the bank balance date/);
 }
});
test('an old or missing retrieval remains actionable even when the bank supplies no date',()=>{
 for(const retrievedAt of [null,'invalid','2026-10-18T12:00:00Z','2026-10-22T12:00:00Z']){
  const s=flowHomeSourceStatus({selectedAccountIds:['cash']},[{id:'cash',retrievedAt,bankUpdatedAt:null}],today,now);
  assert.equal(s.caution,true);assert.equal(s.kind,'check');assert.match(s.label,/Waiting for a bank update/);
 }
});
