const {randomBytes}=require('node:crypto');
function createSecurity(db,{reply,fail,limit,requireUser,passwordHash,matches,digest}){
 db.exec(`CREATE TABLE IF NOT EXISTS super_admins(user_id INTEGER PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS device_sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,device TEXT NOT NULL,ip TEXT NOT NULL,created INTEGER NOT NULL,last_seen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS security_events(id INTEGER PRIMARY KEY,actor_id INTEGER,actor_name TEXT NOT NULL,action TEXT NOT NULL,target_id INTEGER,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS recovery_codes(user_id INTEGER NOT NULL,hash TEXT PRIMARY KEY);`);
 const isSuper=id=>!!db.prepare('SELECT user_id FROM super_admins WHERE user_id=?').get(id);
 const requireSuper=u=>{if(!isSuper(u.id))fail('Super Admin access required.',403);return u;};
 const event=(u,action,target=u.id)=>db.prepare('INSERT INTO security_events(actor_id,actor_name,action,target_id,created) VALUES(?,?,?,?,?)').run(u.id,u.name,action,target,Date.now());
 const current=req=>digest((req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('luzio_session='))?.slice(14)||'');
 function recordSession(req,token,id,action='login'){
  const ua=String(req.headers['user-agent']||'').slice(0,500);
  const browser=/Edg\//.test(ua)?'Edge':/OPR\//.test(ua)?'Opera':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Unknown browser';
  const os=/iPad|iPhone/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Unknown device';
  db.prepare('INSERT OR REPLACE INTO device_sessions VALUES(?,?,?,?,?,?)').run(token,id,browser+' / '+os,String(req.socket.remoteAddress||'').replace(/^::ffff:/,'').slice(0,80),Date.now(),Date.now());
  const u=db.prepare('SELECT id,name FROM users WHERE id=?').get(id);if(u)event(u,action);
 }
 function touch(token,req){if(!db.prepare('SELECT token FROM device_sessions WHERE token=?').get(token)){const row=db.prepare('SELECT user_id FROM account_sessions WHERE token=?').get(token);if(row)recordSession(req,token,row.user_id,'existing session identified');}db.prepare('UPDATE device_sessions SET last_seen=? WHERE token=? AND last_seen<?').run(Date.now(),token,Date.now()-60000);}
 function revoke(id){db.prepare('DELETE FROM account_sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM login_challenges WHERE user_id=?').run(id);db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(id);}
 function password(req,body){const actor=requireUser(req,true);if(!matches(actor,body.password))fail('Enter your current password to confirm.',403);return actor;}
 async function handle(req,res,route,body){
  if(route==='/api/security/recover'&&req.method==='POST'){
   limit(req,'security-recover',5);const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
   const code=typeof body.code==='string'?body.code.replace(/[-\s]/g,'').toUpperCase():'';
   const u=db.prepare("SELECT * FROM users WHERE email=? AND role='admin' AND active=1").get(email);
   if(!u||!db.prepare('SELECT hash FROM recovery_codes WHERE user_id=? AND hash=?').get(u.id,digest(code)))fail('Invalid recovery details.',400);
   const p=passwordHash(body.newPassword);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(p.salt,p.hash,u.id);db.prepare('DELETE FROM recovery_codes WHERE user_id=? AND hash=?').run(u.id,digest(code));revoke(u.id);event(u,'recovered account and revoked all sessions');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   reply(res,200,{ok:true});return true;
  }
  if(!route.startsWith('/api/security/'))return false;
  const actor=requireUser(req,true);
  if(route==='/api/security/status'&&req.method==='GET'){reply(res,200,{superAdmin:isSuper(actor.id),recoveryCodes:db.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id=?').get(actor.id).n});return true;}
  if(route==='/api/security/recovery-codes'&&req.method==='POST'){
   password(req,body);limit(req,'recovery-generate',5);const codes=Array.from({length:8},()=>randomBytes(10).toString('hex').toUpperCase());
   db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(actor.id);for(const code of codes)db.prepare('INSERT INTO recovery_codes VALUES(?,?)').run(actor.id,digest(code));event(actor,'generated new recovery codes');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}reply(res,200,{codes});return true;
  }
  if(route==='/api/security/password'&&req.method==='POST'){
   password(req,body);const p=passwordHash(body.newPassword);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(p.salt,p.hash,actor.id);revoke(actor.id);db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(actor.id);event(actor,'changed password and revoked all sessions');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}reply(res,200,{ok:true});return true;
  }
  requireSuper(actor);
  if(route==='/api/security/devices'&&req.method==='GET'){
   const rows=db.prepare(`SELECT s.token,s.user_id,s.expires,u.name,u.email,d.device,d.ip,d.created,d.last_seen FROM account_sessions s JOIN users u ON u.id=s.user_id LEFT JOIN device_sessions d ON d.token=s.token WHERE s.expires>? AND u.active=1 AND u.role='admin' ORDER BY COALESCE(d.last_seen,0) DESC`).all(Date.now());
   reply(res,200,rows.map(r=>({id:r.token,userId:r.user_id,name:r.name,email:r.email,device:r.device||'Existing session (device unavailable)',ip:r.ip||'',created:r.created,lastSeen:r.last_seen,expires:r.expires,current:r.token===current(req)})));return true;
  }
  if(route==='/api/security/events'&&req.method==='GET'){reply(res,200,db.prepare('SELECT * FROM security_events ORDER BY id DESC LIMIT 100').all());return true;}
  if(route==='/api/security/accounts'&&req.method==='GET'){reply(res,200,db.prepare("SELECT id,name,email,active,verified FROM users WHERE role='admin' ORDER BY id").all().map(u=>({...u,superAdmin:isSuper(u.id)})));return true;}
  if(route==='/api/security/revoke'&&req.method==='POST'){
   password(req,body);limit(req,'security-revoke',20);
   if(body.deviceId){const row=db.prepare('SELECT user_id FROM account_sessions WHERE token=?').get(String(body.deviceId));if(!row)fail('Session no longer active.',404);db.prepare('DELETE FROM account_sessions WHERE token=?').run(body.deviceId);event(actor,'revoked device session',row.user_id);}
   else{const id=Number(body.userId);if(!db.prepare("SELECT id FROM users WHERE id=? AND role='admin'").get(id))fail('Admin not found.',404);revoke(id);event(actor,'revoked all account sessions',id);}
   reply(res,200,{ok:true});return true;
  }
  if(route==='/api/security/accounts'&&req.method==='PATCH'){
   password(req,body);limit(req,'security-access',20);const id=Number(body.userId),target=db.prepare("SELECT * FROM users WHERE id=? AND role='admin'").get(id);
   if(!target)fail('Admin not found.',404);if(id===actor.id)fail('You cannot change your own access.');
   if(typeof body.active!=='boolean'||typeof body.superAdmin!=='boolean')fail('Invalid access settings.');
   db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET active=? WHERE id=?').run(body.active?1:0,id);if(body.superAdmin)db.prepare('INSERT OR IGNORE INTO super_admins VALUES(?)').run(id);else db.prepare('DELETE FROM super_admins WHERE user_id=?').run(id);revoke(id);event(actor,body.active?(body.superAdmin?'granted Super Admin access':'set Admin access'):'disabled account',id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}reply(res,200,{ok:true});return true;
  }
  fail('Security action not found.',404);
 }
 return {handle,isSuper,requireSuper,recordSession,touch};
}
module.exports={createSecurity};
