const test=require('node:test'),assert=require('node:assert/strict');
const {flowQuickPaydays}=require('../js/simple-ui.js');
test('quick payday choices stay in the future across month, year and leap-day boundaries',()=>{
    for(const day of ['2026-10-29','2026-10-30','2026-10-31','2026-12-31','2028-02-29']){
        const choices=flowQuickPaydays(day);assert.equal(choices.length,3);
        for(const choice of choices)assert.ok(choice.date>day);
        assert.equal(new Date(choices[0].date+'T12:00:00Z').getUTCDay(),5);
        assert.equal((Date.parse(choices[1].date)-Date.parse(day))/86400000,14);
        const end=new Date(choices[2].date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);assert.equal(end.getUTCDate(),1);
    }
});
test('quick payday choices reject impossible dates instead of suggesting misleading dates',()=>{
    for(const day of ['',null,'2026-02-30','10/29/2026'])assert.deepEqual(flowQuickPaydays(day),[]);
});
