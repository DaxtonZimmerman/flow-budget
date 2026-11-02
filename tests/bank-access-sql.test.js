const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('bank approvals are private, idempotent, cannot be self-approved, and consumed atomically once',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);grant usage on schema public,auth to service_role,authenticated,anon;');
 for(const file of ['plaid-setup.sql','2026-10-28-staged-bank-recovery.sql','2026-11-01-bank-access-approval.sql']) {
  // Recovery migration depends on flow_data; only its additive flag is needed here.
  if(file.includes('staged'))await db.exec('alter table plaid_connections add column recovery_required boolean default false');
  else await db.exec(fs.readFileSync(__dirname+'/../supabase/'+file,'utf8'));
 }
 const owner='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
 await db.query('insert into auth.users values($1,$2),($3,$4)',[owner,'owner@example.test',user,'user@example.test']);
 for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  for(const sql of ['select * from bank_access_requests',`select request_bank_access('${user}')`,'select * from list_bank_access_requests()',`select decide_bank_access('${user}','${user}','approved','pending')`,`select save_approved_bank_connection('{}')`])await assert.rejects(()=>db.exec(sql),/permission denied/);
 }
 await db.exec('set role service_role');
 for(let i=0;i<3;i++)await db.query('select request_bank_access($1)',[user]);
 let rows=(await db.query('select * from list_bank_access_requests()')).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');assert.equal(rows[0].email,'user@example.test');
 const decide=async(status,expected)=>(await db.query('select decide_bank_access($1,$2,$3,$4) ok',[user,owner,status,expected])).rows[0].ok;
 assert.equal(await decide('approved','pending'),true);
 assert.equal(await decide('denied','pending'),false);
 await db.query('select request_bank_access($1)',[user]);assert.equal((await db.query('select * from bank_access_requests')).rows[0].status,'approved');
 const connection={user_id:user,item_id:'item-new',access_token:'not-real',institution_name:'Example',environment:'production',recovery_required:true};
 const save=async()=>(await db.query('select save_approved_bank_connection($1) ok',[JSON.stringify(connection)])).rows[0].ok;
 assert.equal(await decide('denied','approved'),true);assert.equal(await save(),false);
 assert.equal(await decide('approved','denied'),true);assert.equal(await save(),true);assert.equal(await save(),false);
 assert.equal((await db.query('select * from plaid_connections')).rows[0].recovery_required,false);
 assert.equal(await decide('approved','connected'),false);assert.equal((await db.query('select * from list_bank_access_requests()')).rows[0].status,'connected');
 await db.exec('delete from plaid_connections');assert.equal(await save(),false);
});
