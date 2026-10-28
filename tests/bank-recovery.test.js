const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function model(){const c=vm.createContext({});for(const f of ['planning-data','product-data','growth-data','bill-data','bank-data','transfer-data','bank-recovery-data'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${f}.js`,'utf8'),c);return c;}
const account=(id,name='Checking')=>({id:'old:'+id,accountId:id,bankConnectionId:'old',name,type:'depository',subtype:'checking',currency:'USD',availableCents:12000,currentCents:12000,retrievedAt:'2026-10-28T10:00:00Z',bankUpdatedAt:null});
const tx=(id,extra={})=>({id,source:'bank',bankConnectionId:'old',bankTransactionId:'old-'+id,accountId:'a',date:'2026-10-20',name:'Market',amount:-12,type:'Expense',category:'Food',notes:'My note',reviewStatus:'reviewed',status:'posted',...extra});
const raw=(id,extra={})=>({transaction_id:id,account_id:'new-a',date:'2026-10-20',name:'Market',amount:12,pending:false,...extra});
const feed=rows=>({history_complete:true,recovery_required:true,cursor:'cursor-2',last_synced_at:'2026-10-28T10:00:00Z',accounts:[{account_id:'new-a',name:'Checking',type:'depository',subtype:'checking',balances:{available:150,iso_currency_code:'USD'}}],transactions:rows});
const snapshot=rows=>({clientSchemaVersion:2,transactions:rows,bankAccounts:[account('a')],categoryRules:[],recurringItems:[],budgets:[],budgetsByMonth:{},flowPlanning:null});
test('feed replacement does not duplicate old imports and uniquely matched payments retain personal edits and IDs',()=>{
 const c=model(),saved=snapshot([tx('one',{allocations:[{id:'food',category:'Food',cents:1200}]}),tx('manual',{source:'manual',bankConnectionId:undefined,bankTransactionId:undefined})]),before=JSON.stringify(saved);
 const p=c.prepareBankRecovery(saved,'old','new',feed([raw('new-one'),raw('new-two',{date:'2026-10-27',amount:5})]),{a:'new-a'});
 assert.equal(p.data.transactions.length,3);assert.equal(p.oldCount,1);assert.equal(p.newCount,2);assert.equal(p.matchedCount,1);assert.equal(p.archivedCount,0);
 const t=p.data.transactions.find(t=>t.bankTransactionId==='new-one');assert.equal(t.id,'one');assert.equal(t.category,'Food');assert.equal(t.notes,'My note');assert.equal(t.allocations[0].cents,1200);assert.equal(t.bankConnectionId,'new');assert.equal(t.accountId,'new-a');assert.equal(JSON.stringify(saved),before);
 assert.deepEqual(JSON.parse(JSON.stringify(p.data.transactions[0])),JSON.parse(JSON.stringify(saved.transactions[1])));
});
test('identical repeated payments, different dates, accounts and signs cannot steal personal choices',()=>{
 const c=model(),saved=snapshot([tx('first'),tx('second',{notes:'Different note'})]);
 const result=c.prepareBankRecovery(saved,'old','new',feed([raw('new-one'),raw('new-two')]),{a:'new-a'});
 assert.equal(result.matchedCount,0);assert.equal(result.archivedCount,2);assert.ok(result.data.transactions.every(t=>t.notes===''));
 for(const extra of [{date:'2026-10-21'},{amount:-12},{pending:true}])assert.equal(c.prepareBankRecovery(snapshot([tx('first')]),'old','new',feed([raw('new-one',extra)]),{a:'new-a'}).matchedCount,0);
});
test('unmatched history remains counted explicitly for the recovery copy, never silently mixed into the new feed',()=>{
 const c=model(),result=c.prepareBankRecovery(snapshot([tx('first'),tx('older',{date:'2025-01-01'})]),'old','new',feed([raw('new-one')]),{a:'new-a'});
 assert.equal(result.oldCount,2);assert.equal(result.archivedCount,1);assert.equal(result.data.transactions.length,1);assert.equal(result.from,'2026-10-20');
});
test('account and transaction references migrate in rules, planning, refunds, covered money and exclusions without changing notes',()=>{
 const c=model(),saved=snapshot([tx('one'),tx('refund',{amount:12,type:'Refund',typeOverride:true,relatedExpense:{key:'["old","a","old-one"]',cents:1200}})]);
 saved.categoryRules=[{id:'rule',bankType:'Transfer',name:'transfer',type:'Expense',accountId:'a'}];
 saved.flowPlanning={selectedAccountIds:['old:a'],bills:[{tracking:{bankConnectionId:'old',accountId:'a'}}],manualBalance:{covered:[{key:'["old","a","old-one"]',fingerprint:'["[\\"old\\",\\"a\\",\\"old-one\\"]",-12,"2026-10-20","posted"]'}]},features:{budgetGuide:{excludedKeys:['["old","a","old-one"]']}}};
 const result=c.prepareBankRecovery(saved,'old','new',feed([raw('new-one'),raw('new-refund',{amount:-12})]),{a:'new-a'}).data;
 assert.equal(result.categoryRules[0].accountId,'new-a');assert.equal(result.flowPlanning.selectedAccountIds[0],'new:new-a');assert.equal(result.flowPlanning.bills[0].tracking.bankConnectionId,'new');
 assert.equal(result.transactions[1].relatedExpense.key,'["new","new-a","new-one"]');assert.equal(result.flowPlanning.manualBalance.covered[0].key,'["new","new-a","new-one"]');
 assert.match(result.flowPlanning.manualBalance.covered[0].fingerprint,/new-one/);assert.equal(result.flowPlanning.features.budgetGuide.excludedKeys[0],'["new","new-a","new-one"]');
});
test('partial history, unmapped or reused accounts, duplicate IDs and inconsistent account kinds all block replacement',()=>{
 const c=model(),saved=snapshot([tx('first')]),ready=feed([raw('new-one')]);
 assert.throws(()=>c.prepareBankRecovery(saved,'old','new',{...ready,history_complete:false},{a:'new-a'}),/preparing/);
 assert.throws(()=>c.prepareBankRecovery(saved,'old','new',ready,{}),/Match each/);
 assert.throws(()=>c.prepareBankRecovery(saved,'old','new',feed([raw('new-one'),raw('new-one')]),{a:'new-a'}),/duplicate/);
 const wrong=feed([raw('new-one')]);wrong.accounts[0].type='credit';assert.throws(()=>c.prepareBankRecovery(saved,'old','new',wrong,{a:'new-a'}),/same kind/);
 saved.bankAccounts.push(account('b','Second checking'));assert.throws(()=>c.prepareBankRecovery(saved,'old','new',ready,{a:'new-a',b:'new-a'}),/different/);
});
test('account suggestions require unique exact name, kind, subtype and currency and still require confirmation',()=>{
 const c=model(),source={accounts:[account('a')]},next=[{...account('new-a'),bankConnectionId:'new'}];
 assert.equal(c.bankRecoverySuggestions(source,next).a,'new-a');assert.equal(c.bankRecoverySuggestions(source,[...next,{...next[0],accountId:'another'}]).a,undefined);
 assert.equal(c.bankRecoverySuggestions(source,[{...next[0],currency:'CAD'}]).a,undefined);
});

test('confirmed transfer pairs follow two uniquely matched records and remain undoable',()=>{
 const c=model(),saved=snapshot([tx('out',{name:'Own transfer',type:'Transfer',typeOverride:true}),tx('in',{name:'Own transfer',amount:12,type:'Transfer',typeOverride:true,accountId:'b'})]);saved.bankAccounts.push(account('b','Savings'));
 saved.transactions=c.matchTransferRecords(saved.transactions,saved.bankAccounts,c.transferRecordKey(saved.transactions[0]),c.transferRecordKey(saved.transactions[1]));
 const f=feed([raw('new-out',{name:'Own transfer'}),raw('new-in',{name:'Own transfer',account_id:'new-b',amount:-12})]);f.accounts.push({...f.accounts[0],account_id:'new-b',name:'Savings'});
 const result=c.prepareBankRecovery(saved,'old','new',f,{a:'new-a',b:'new-b'});
 assert.equal(result.matchedCount,2);assert.ok(c.linkedTransferPeer(result.data.transactions[0],result.data.transactions,result.data.bankAccounts));
 const undone=c.unlinkTransferRecords(result.data.transactions,c.transferRecordKey(result.data.transactions[0]));assert.equal(undone[0].transferPair,undefined);assert.equal(undone[0].type,'Transfer');
});
test('a reimbursement whose expense is archived is flagged instead of retaining a broken money link',()=>{
 const c=model(),saved=snapshot([tx('refund',{amount:12,type:'Refund',typeOverride:true,relatedExpense:{key:'["old","a","missing"]',cents:1200}})]);
 const result=c.prepareBankRecovery(saved,'old','new',feed([raw('new-refund',{amount:-12})]),{a:'new-a'});
 assert.equal(result.data.transactions[0].relatedExpense,undefined);assert.equal(result.data.transactions[0].reviewStatus,'needs-review');
});
