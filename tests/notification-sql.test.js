const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('notification endpoints are server-only, have owner lifecycle cleanup and atomically deduplicate deliveries',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role,authenticated,anon;create table public.flow_data(user_id uuid,data jsonb);');
 await db.exec(fs.readFileSync(__dirname+'/../supabase/2026-10-29-notifications.sql','utf8'));
 await db.exec(fs.readFileSync(__dirname+'/../supabase/2026-10-30-push-retry.sql','utf8'));
 const owner='11111111-1111-4111-8111-111111111111';await db.query('insert into auth.users values($1)',[owner]);
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from public.flow_push_subscriptions'),/permission denied/);await assert.rejects(()=>db.query('select public.claim_flow_push(gen_random_uuid(),\'event\')'),/permission denied/);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from public.flow_push_deliveries'),/permission denied/);
 await db.exec('set role service_role');const id=(await db.query("insert into public.flow_push_subscriptions(user_id,endpoint,subscription) values($1,'https://web.push.apple.com/synthetic','{}') returning id",[owner])).rows[0].id;
 assert.equal((await db.query('select public.claim_flow_push($1,$2) as claimed',[id,'event'])).rows[0].claimed,true);assert.equal((await db.query('select public.claim_flow_push($1,$2) as claimed',[id,'event'])).rows[0].claimed,false);
 await db.query("update flow_push_deliveries set state='failed',retry_at=now()+interval '1 hour' where subscription_id=$1",[id]);
 assert.equal((await db.query('select claim_flow_push($1,$2) as claimed',[id,'event'])).rows[0].claimed,false);
 for(let attempt=2;attempt<=3;attempt++){
  await db.query("update flow_push_deliveries set state='failed',retry_at=now()-interval '1 second' where subscription_id=$1",[id]);
  assert.equal((await db.query('select claim_flow_push($1,$2) as claimed',[id,'event'])).rows[0].claimed,true);
  assert.equal((await db.query('select attempts from flow_push_deliveries where subscription_id=$1',[id])).rows[0].attempts,attempt);
 }
 await db.query("update flow_push_deliveries set state='failed',retry_at=now()-interval '1 second' where subscription_id=$1",[id]);
 assert.equal((await db.query('select claim_flow_push($1,$2) as claimed',[id,'event'])).rows[0].claimed,false);
 await db.query('delete from public.flow_push_subscriptions where id=$1',[id]);assert.equal((await db.query('select count(*)::int as n from public.flow_push_deliveries')).rows[0].n,0);
});
