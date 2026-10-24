const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {bankFeedTime,bankFeedDate,bankFeedState,bankFeedSummary}=require('../js/bank-status.js');
const now=Date.parse('2026-10-24T18:00:00Z'),feed='2026-10-23T17:00:00.000Z';
function app(){const saved=new Map([['flow_user_id','dax']]),events=[];let clock=now,blocked=false;class Clock extends Date{constructor(...v){super(...(v.length?v:[clock]));}static now(){return clock;}}
 const c=vm.createContext({Date:Clock,Event,flowStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>{if(blocked)throw Error('full');saved.set(k,v);}},document:{addEventListener:()=>{},dispatchEvent:e=>events.push(e.type)},window:{addEventListener:()=>{}}});vm.runInContext(fs.readFileSync(__dirname+'/../js/bank-status.js','utf8'),c);return {c,saved,events,block:()=>blocked=true,advance:n=>clock+=n};}
const connection=(over={})=>({id:'bank',institution_name:'Sample Bank',needs_reconnect:false,transaction_status:{last_successful_update:feed,last_failed_update:null},...over});
test('bank timing stays dated even when Flow checks now; missing and future values cannot become fresh',()=>{
 assert.equal(bankFeedTime(feed,now),feed);for(const value of [null,undefined,0,'',now,'no date','2035-01-01T00:00:00Z'])assert.equal(bankFeedTime(value,now),null);
 assert.equal(bankFeedState({bankCheckedAt:feed,flowCheckedAt:new Date(now).toISOString()},now).kind,'waiting');assert.equal(bankFeedState({flowCheckedAt:new Date(now).toISOString()},now).kind,'unknown');assert.equal(bankFeedDate(new Date(now).toISOString(),now).startsWith('Today,'),true);assert.equal(bankFeedDate(null,now),'Not supplied');
});
test('only a later failed bank attempt is delayed, while reconnection takes priority',()=>{
 const at='2026-10-24T17:00:00Z';assert.equal(bankFeedState({bankCheckedAt:at,lastFailedAt:feed},now).kind,'connected');assert.equal(bankFeedState({bankCheckedAt:feed,lastFailedAt:at},now).kind,'retrying');assert.equal(bankFeedState({bankCheckedAt:at,needsReconnect:true},now).kind,'reconnect');
 assert.equal(bankFeedSummary([], 'reconnect').kind,'reconnect');assert.equal(bankFeedSummary([], 'offline').kind,'offline');assert.equal(bankFeedSummary([], 'error').kind,'retrying');assert.equal(bankFeedSummary([]).kind,'unknown');
});
test('status snapshots allow only timing and bank labels, and never cross signed-in accounts',()=>{
 const a=app();a.c.rememberBankFeedConnections([connection({access_token:'never-store',transaction_status:{last_successful_update:feed,last_failed_update:null,secret:'private'}})],'dax',now);const raw=a.saved.get('flow_bank_feed:dax');assert.equal(raw.includes('never-store'),false);assert.equal(raw.includes('private'),false);assert.equal(raw.includes('access_token'),false);
 assert.equal(a.c.loadBankFeedStatus('dax').length,1);a.saved.set('flow_user_id','other');assert.equal(a.c.loadBankFeedStatus('dax').length,0);a.c.rememberBankFeedConnections([connection()],'dax',now+1);assert.equal(a.saved.has('flow_bank_feed:other'),false);assert.equal(a.saved.get('flow_bank_feed:dax'),raw);
});
test('checking a feed never marks its transactions imported; only successful application advances the watermark',()=>{
 const a=app();a.c.rememberBankFeedConnections([connection()],'dax',now);assert.equal(a.c.bankFeedNeedsImport('bank','dax'),true);a.c.markBankFeedApplied('bank',{},'dax');assert.equal(a.c.bankFeedNeedsImport('bank','dax'),true);a.c.markBankFeedApplied('bank',{last_successful_update:feed},'dax');assert.equal(a.c.bankFeedNeedsImport('bank','dax'),false);
 a.advance(1000);a.c.rememberBankFeedConnections([connection({transaction_status:{last_successful_update:'2026-10-24T17:00:00Z'}})],'dax',now+1000);assert.equal(a.c.bankFeedNeedsImport('bank','dax'),true);a.c.markBankFeedApplied('bank',{last_successful_update:feed},'dax');assert.equal(a.c.bankFeedNeedsImport('bank','dax'),true);
});
test('overlapping checks and late imports cannot move the bank feed backwards or resurrect disconnections',()=>{
 const a=app();a.c.rememberBankFeedConnections([connection()],'dax',now);a.advance(2000);a.c.rememberBankFeedConnections([connection({transaction_status:{last_successful_update:'2026-10-24T17:00:00Z'}})],'dax',now+2000);a.c.rememberBankFeedConnections([connection()],'dax',now+1000);assert.equal(a.c.loadBankFeedStatus()[0].bankCheckedAt,'2026-10-24T17:00:00.000Z');
 a.advance(1000);a.c.forgetBankFeedConnection('bank','dax');a.c.markBankFeedApplied('bank',{last_successful_update:feed},'dax');a.c.rememberBankFeedConnections([connection()],'dax',now);assert.equal(a.c.loadBankFeedStatus().length,0);
});
test('malformed and blocked status storage cannot write financial account data',()=>{
 const a=app();a.saved.set('flow_bank_feed:dax','invalid');assert.equal(a.c.loadBankFeedStatus().length,0);a.block();assert.doesNotThrow(()=>a.c.rememberBankFeedConnections([connection()],'dax',now));assert.equal(a.saved.has('transactions'),false);assert.equal(a.saved.has('bankAccounts'),false);assert.equal(a.saved.has('flowPlanning'),false);
});
