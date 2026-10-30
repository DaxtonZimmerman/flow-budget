const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('bank snapshot reads every row atomically with owner/cursor guards and service-only access',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role,authenticated,anon;');
 for(const f of ['plaid-setup.sql','2026-10-30-complete-bank-snapshot.sql'])await db.exec(fs.readFileSync(__dirname+'/../supabase/'+f,'utf8'));
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1)',[owner]);await db.query("insert into plaid_connections(id,user_id,item_id,access_token,cursor) values($1,$2,'item','private','v1')",[id,owner]);
 await db.exec(`insert into plaid_transactions select 'item',n::text,'cash',jsonb_build_object('transaction_id',n::text,'account_id','cash','date','2026-10-30','amount',1) from generate_series(1,1205) n;`);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select read_plaid_snapshot($1,$2,$3)',[id,owner,'v1']),/permission denied/);}
 await db.exec('set role service_role');const read=async(o=owner,c='v1')=>(await db.query('select read_plaid_snapshot($1,$2,$3) as snapshot',[id,o,c])).rows[0].snapshot;
 const s=await read();assert.equal(s.count,1205);assert.equal(s.transactions.length,1205);assert.equal(s.complete,true);assert.equal(await read(other),null);assert.equal(await read(owner,'old'),null);
 await db.query("select save_plaid_sync($1,'v1','v2','[]','[]','[{\"transaction_id\":\"1205\"}]')",[id]);assert.equal(await read(),null);assert.equal((await read(owner,'v2')).count,1204);
 await db.exec("delete from plaid_transactions");assert.deepEqual(await read(owner,'v2'),{complete:true,count:0,transactions:[]});
});
