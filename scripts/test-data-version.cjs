const {PGlite}=require(process.env.FLOW_PGLITE_PATH || '@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const db=await PGlite.create();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.user_id',true),'')::uuid$$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`);
  await db.exec(fs.readFileSync('supabase/setup.sql','utf8'));
  const migration=fs.readFileSync('supabase/2026-10-19-client-data-version.sql','utf8');await db.exec(migration);await db.exec(migration);
  await db.exec(`set role authenticated;set request.user_id='00000000-0000-0000-0000-000000000001';`);
  const save=(revision,data)=>db.query('select public.save_flow_data($1,$2::jsonb) as revision',[revision,JSON.stringify(data)]);
  assert.equal((await save(0,{transactions:[]})).rows[0].revision,1);
  assert.equal((await save(1,{transactions:[{id:'legacy'}]})).rows[0].revision,2);
  const expanded={clientSchemaVersion:2,transactions:[{id:'payment',allocations:[{id:'food',category:'Food',cents:100}]}]};
  assert.equal((await save(2,expanded)).rows[0].revision,3);
  await assert.rejects(save(3,{transactions:[{id:'older-client'}]}),/Update Flow/);
  await assert.rejects(db.query("update public.flow_data set data=$1::jsonb",[JSON.stringify({transactions:[]})]),/Update Flow/);
  const kept=(await db.query('select revision,data from public.flow_data')).rows[0];assert.equal(kept.revision,3);assert.equal(kept.data.transactions[0].allocations[0].cents,100);
  assert.equal((await save(3,{...expanded,flowPlanning:{version:1}})).rows[0].revision,4);
  await assert.rejects(save(3,expanded),/changed on another device/);
  await db.exec(`set request.user_id='00000000-0000-0000-0000-000000000002';`);assert.equal((await db.query('select * from public.flow_data')).rows.length,0);
  await save(0,{clientSchemaVersion:2,transactions:[{id:'second-user'}]});assert.equal((await db.query('select * from public.flow_data')).rows.length,1);
  await db.exec('reset role;set role anon;');await assert.rejects(db.query('select * from public.flow_data'),/permission denied/);
  console.log('PASS: migration applies twice; legacy data upgrades; old RPC/direct writes blocked after upgrade; new writes, revision conflicts, RLS isolation, anonymous denial verified in disposable PostgreSQL.');
 }finally{await db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
