import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {createAttempts} from '/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/wave-a-apple-server-paste/app/server/auth/attempts.ts';
const pool=new pg.Pool({connectionString:'postgres://postgres:dev@127.0.0.1:62919/postgres',max:5});
try {
await migrate(drizzle(pool),{migrationsFolder:'/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/wave-a-apple-server-paste/app/drizzle'});
const a=createAttempts(pool);await a.sweep();
const b=await a.begin({purpose:'signin',surface:'native',targetProvider:'apple'});
await a.accept(await a.claim(b.attempt),{sub:'lens-expiry',email:'lens@example.test',emailVerified:true,name:'Rower',grant:{clientId:'native',refreshToken:'synthetic'}});
await pool.query("update auth_attempts set expires_at=clock_timestamp()+interval '1 seconds' where id=$1",[b.attempt.id]);
const expected=await a.read(b.attempt.id,b.bindingSecret,'native');
const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('select id from auth_attempts where id=$1 for update',[expected.id]);
const result=a.confirm(expected);let blocked=false;
for(let i=0;i<100;i++){if((await pool.query("select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock'")).rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}
await new Promise(r=>setTimeout(r,1200));const expired=(await pool.query('select expires_at<clock_timestamp() as expired from auth_attempts where id=$1',[expected.id])).rows[0].expired;
await blocker.query('COMMIT');blocker.release();
const done=await result;console.log(JSON.stringify({blocked,expiredBeforeRelease:expired,completion:done.signedIn?.outcome,newSessions:(await pool.query('select count(*) from sessions')).rows[0].count}));
}finally{await pool.end();}
