import fs from 'node:fs';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {createAttempts} from '/tmp/apple-dba-plan/original/app/server/auth/attempts.ts';
const root='/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/wave-a-apple-server-paste/app';
const pool=new pg.Pool({connectionString:'postgres://postgres:dev@localhost:5434/postgres',max:10});
const output:any={environment:(await pool.query("select version(),current_setting('work_mem') work_mem,current_setting('shared_buffers') shared_buffers,current_setting('jit') jit,current_setting('full_page_writes') full_page_writes")).rows,scales:[]};
fs.mkdirSync('/tmp/apple-dba-plan/migrations/meta',{recursive:true});
const journal=JSON.parse(fs.readFileSync(root+'/drizzle/meta/_journal.json','utf8')); journal.entries=journal.entries.filter((e:any)=>e.idx<31);
fs.writeFileSync('/tmp/apple-dba-plan/migrations/meta/_journal.json',JSON.stringify(journal));
for(const e of journal.entries)fs.copyFileSync(root+'/drizzle/'+e.tag+'.sql','/tmp/apple-dba-plan/migrations/'+e.tag+'.sql');
await migrate(drizzle(pool),{migrationsFolder:'/tmp/apple-dba-plan/migrations'});
await pool.query('set max_parallel_workers_per_gather=0');
await pool.query("alter system set full_page_writes=off");await pool.query('select pg_reload_conf()');
const median=(a:number[])=>a.slice(1).sort((a,b)=>a-b)[2];
const sql31=fs.readFileSync(root+'/drizzle/0031_apple_front_door.sql','utf8');
let recording=false; let current:any; let tx=false;
const original=pg.Client.prototype.query;
pg.Client.prototype.query=async function(q:any,p?:any,...rest:any[]){
 if(!recording||typeof q!=='string'||rest.length||typeof p==='function')return original.call(this,q,p,...rest);
 if(q==='BEGIN')tx=true;
 if(tx && !/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory)/.test(q)){
  await original.call(this,'SAVEPOINT dba_explain');
  try {const ex=await original.call(this,'EXPLAIN (ANALYZE,BUFFERS,WAL,FORMAT JSON) '+q,p);current.queries.push({sql:q,parameters:p,plan:ex.rows[0]['QUERY PLAN']});}finally{await original.call(this,'ROLLBACK TO SAVEPOINT dba_explain');}
 }
 const r=await original.call(this,q,p,...rest);if(q==='COMMIT'||q==='ROLLBACK')tx=false;return r;
} as any;
for(const n of [5,1000,100000,1000000]){
 await pool.query('TRUNCATE users CASCADE');
 if(n>5)await pool.query('DROP TABLE auth_attempts,apple_grants; ALTER TABLE users DROP COLUMN apple_sub');
 await pool.query(`INSERT INTO users(id,google_sub,email,name) SELECT md5('u'||i)::uuid,'g'||i,'rower'||i||'@example.test','Rower '||i FROM generate_series(1,$1::int)i`,[n]);
 await pool.query(`INSERT INTO sessions(id,user_id,token_hash,expires_at) SELECT md5('s'||i)::uuid,md5('u'||i)::uuid,md5('t'||i),now()+interval '60 days' FROM generate_series(1,$1::int)i`,[n]);
 await pool.query('VACUUM ANALYZE users');await pool.query('VACUUM ANALYZE sessions');
 const migration=[];for(let i=0;i<6;i++){await pool.query('BEGIN');const t=performance.now();await pool.query(sql31);migration.push(performance.now()-t);await pool.query('ROLLBACK');}
 await pool.query('BEGIN');await pool.query(sql31);
 const locks=(await pool.query("select relation::regclass::text relation,mode,granted from pg_locks where pid=pg_backend_pid() and relation in ('users'::regclass,'sessions'::regclass,'auth_attempts'::regclass,'apple_grants'::regclass)")).rows;
 await pool.query('COMMIT');
 await pool.query(`UPDATE users SET apple_sub='a'||substring(google_sub from 2) WHERE id<>md5('u1')::uuid`);
 await pool.query(`INSERT INTO apple_grants(user_id,client_id,refresh_token) SELECT id,'haus.waffle.ergomatic',repeat('r',512) FROM users`);
 await pool.query(`INSERT INTO auth_attempts(id,binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,expires_at) SELECT md5('l'||i)::uuid,repeat('b',64),'native','link','apple','google','reauth_authorize',1,md5('state'||i),md5('nonce'||i),md5('s'||i)::uuid,now()+interval '5 minutes' FROM generate_series(1,$1::int)i`,[n]);
 await pool.query(`INSERT INTO auth_attempts(binding_hash,surface,purpose,target_provider,stage,version,state,nonce,expires_at) SELECT repeat('b',64),'web','signin','apple','authorize',1,md5('anon'||i),md5('an'||i),now()+interval '5 minutes' FROM generate_series(1,511)i`);
 for(const table of ['users','sessions','apple_grants','auth_attempts'])await pool.query('VACUUM ANALYZE '+table);
 current={n,migrationMs:median(migration),migrationRuns:migration,migrationLocks:locks,counts:(await pool.query('SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM sessions) sessions,(SELECT count(*) FROM apple_grants) grants,(SELECT count(*) FROM auth_attempts) attempts')).rows[0],sizes:(await pool.query("SELECT indexrelname,pg_relation_size(indexrelid) bytes FROM pg_stat_user_indexes WHERE relname in ('users','sessions','apple_grants','auth_attempts') ORDER BY indexrelname")).rows, timings:{},queries:[]};output.scales.push(current);
 const a=createAttempts(pool);await a.sweep();
 async function bench(label:string,fn:()=>Promise<any>){const times=[];for(let i=0;i<6;i++){const t=performance.now();await fn();times.push(performance.now()-t)}current.timings[label]={medianMs:median(times),runs:times};}
 await bench('signin_begin_cancel',async()=>{const x=await a.begin({surface:'native',purpose:'signin',targetProvider:'apple'});await a.cancel(x.attempt.id,x.bindingSecret,'native')});
 const uid=(await pool.query("SELECT id FROM users WHERE google_sub='g1'")).rows[0].id; const sid=(await pool.query('SELECT id FROM sessions WHERE user_id=$1',[uid])).rows[0].id;
 await bench('methods',()=>a.methods(uid));
 await bench('returning_signin',async()=>{let x=await a.begin({surface:'native',purpose:'signin',targetProvider:'apple'});const c=await a.claim(x.attempt);await a.accept(c,{sub:'a2',email:'r@example.test',emailVerified:true,name:'Rower',grant:{clientId:'haus.waffle.ergomatic',refreshToken:'r'.repeat(512)}})});
 recording=true;
 let x=await a.begin({surface:'native',purpose:'signin',targetProvider:'apple'});
 let c=await a.claim(x.attempt);
 let pending=await a.accept(c,{sub:'new'+n,email:'new@example.test',emailVerified:true,name:'New Rower',grant:{clientId:'haus.waffle.ergomatic',refreshToken:'r'.repeat(512)}});
 await a.confirm(pending.attempt!);
 x=await a.begin({surface:'native',purpose:'signin',targetProvider:'apple'}); c=await a.claim(x.attempt);await a.accept(c,{sub:'a2',email:'r@example.test',emailVerified:true,name:'Rower',grant:{clientId:'haus.waffle.ergomatic',refreshToken:'r'.repeat(512)}});
 x=await a.begin({surface:'native',purpose:'link',targetProvider:'apple',originalSessionId:sid});c=await a.claim(x.attempt);pending=await a.accept(c,{sub:'g1',email:'r@example.test',emailVerified:true,name:'Rower'});
 c=await a.claim(pending.attempt!);pending=await a.accept(c,{sub:'linked'+n,email:'r@example.test',emailVerified:true,name:'Rower',grant:{clientId:'haus.waffle.ergomatic',refreshToken:'r'.repeat(512)}});await a.finalize(pending.attempt!,sid);
 await a.legacyGoogle({sub:'g2',email:'r@example.test',emailVerified:true,name:'Rower'});
 recording=false;
 for(const [name,sql,params] of [
 ['methods','SELECT apple_sub IS NOT NULL AS apple,google_sub IS NOT NULL AS google FROM users WHERE id=$1',[uid]],
 ['sweep','DELETE FROM auth_attempts WHERE expires_at<=now()',[]],
 ['grant_cascade','DELETE FROM users WHERE id=$1',[uid]],
 ['session_cascade','DELETE FROM sessions WHERE id=$1',[(await pool.query("select id from sessions where user_id=(select id from users where google_sub='g2') limit 1")).rows[0].id]],
 ] as any[]){await pool.query('BEGIN');const ex=await pool.query('EXPLAIN (ANALYZE,BUFFERS,WAL,FORMAT JSON) '+sql,params);current.queries.push({name,sql,parameters:params,plan:ex.rows[0]['QUERY PLAN']});await pool.query('ROLLBACK');}
 fs.writeFileSync('/tmp/apple-dba-plan/results.json',JSON.stringify(output,null,2));console.log(JSON.stringify({n,migrationMs:current.migrationMs,timings:current.timings,queryCount:current.queries.length}));
}
await pool.query('alter system reset full_page_writes');await pool.query('select pg_reload_conf()');await pool.end();
