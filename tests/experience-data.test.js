const test=require('node:test'),assert=require('node:assert/strict');
const {flowMoneyMap,flowPaydayRunway}=require('../js/experience-data');
const e={ready:true,balanceCents:50000,leftCents:26500,billsCents:4500,essentialsCents:14000,cushionCents:5000,goalsCents:0,cardsCents:0,adjustmentsCents:0};
test('the visual money map uses the engine amounts and accounts for every cent',()=>{
 const result=flowMoneyMap(e);assert.deepEqual(result.parts.map(x=>x.cents),[26500,4500,14000,5000]);assert.equal(result.parts.reduce((n,x)=>n+x.share,0),1);assert.equal(result.shortfallCents,0);assert.equal(e.leftCents,26500);
});
test('unready, malformed and negative set-asides never produce a reassuring visual',()=>{
 for(const bad of [{...e,ready:false},{...e,billsCents:-1},{...e,leftCents:NaN},{...e,essentialsCents:0.5}])assert.equal(flowMoneyMap(bad),null);
 const short=flowMoneyMap({...e,balanceCents:1000,leftCents:-22500});assert.equal(short.parts[0].cents,0);assert.equal(short.shortfallCents,22500);
});
test('the payday ring represents days elapsed, independent of money or bank freshness',()=>{
 const p={periodStartedOn:'2026-10-16',payday:{nextDate:'2026-10-23'}};
 assert.deepEqual(flowPaydayRunway(p,'2026-10-21'),{days:2,progress:5/7});assert.equal(flowPaydayRunway(p,'2026-10-23').days,0);assert.equal(flowPaydayRunway(p,'2026-10-24'),null);
});
test('missing and invalid planning dates are not replaced with invented progress',()=>{
 assert.equal(flowPaydayRunway({payday:{nextDate:'2026-02-30'}},'2026-02-20'),null);
 assert.deepEqual(flowPaydayRunway({payday:{nextDate:'2026-10-23'}},'2026-10-21'),{days:2,progress:null});
});
