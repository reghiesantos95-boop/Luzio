const { randomBytes, createHash, scryptSync, timingSafeEqual } = require('node:crypto');
function createAccounts(db, {reply, fail, limit, setupCode, mail, localAuthTesting=false}) {
  db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE COLLATE NOCASE,salt TEXT NOT NULL,hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','staff','client')),verified INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS account_sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS account_tokens(hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,purpose TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS account_meta(key TEXT PRIMARY KEY,value TEXT);`);
  if (!db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get().sql.includes("'client'")) {
    db.exec(`BEGIN IMMEDIATE; ALTER TABLE users RENAME TO users_before_clients;
      CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE COLLATE NOCASE,salt TEXT NOT NULL,hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','staff','client')),verified INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
      INSERT INTO users SELECT * FROM users_before_clients; DROP TABLE users_before_clients; COMMIT;`);
  }
  // Copy the old password once. Existing motorcycles and inquiries are untouched.
  if (!db.prepare("SELECT key FROM account_meta WHERE key='migration-v1'").get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const legacy = db.prepare('SELECT * FROM admin WHERE id=1').get();
      if (legacy && !db.prepare('SELECT id FROM users LIMIT 1').get()) db.prepare("INSERT INTO users(name,salt,hash,role) VALUES('Garage administrator',?,?,'admin')").run(legacy.salt,legacy.hash);
      db.exec("DELETE FROM sessions; INSERT INTO account_meta VALUES('migration-v1','done'); COMMIT");
    } catch(e) { db.exec('ROLLBACK'); throw e; }
  }
  const localTesting = req => localAuthTesting && process.env.NODE_ENV!=='production' && !!req && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host||'');
  const hasAdmin = () => !!db.prepare("SELECT id FROM users WHERE role='admin'").get();
  const digest = value => createHash('sha256').update(value).digest('hex');
  const clean = (value,max=100) => typeof value==='string' ? value.trim().slice(0,max) : '';
  const emailValue = value => { const email=clean(value,254).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email address.');return email; };
  const passwordHash = password => {if(typeof password!=='string'||password.length<12||password.length>200)fail('Use a password with 12–200 characters.');const salt=randomBytes(16).toString('hex');return {salt,hash:scryptSync(password,salt,64).toString('hex')};};
  const matches = (u,password) => typeof password==='string' && password.length<=200 && timingSafeEqual(Buffer.from(u.hash,'hex'),scryptSync(password,u.salt,64));
  const publicUser = u => ({id:u.id,name:u.name,email:u.email,role:u.role,verified:!!u.verified,active:!!u.active});
  const cookieToken = req => (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('luzio_session='))?.slice(14);
  function user(req) {
    db.prepare('DELETE FROM account_sessions WHERE expires < ?').run(Date.now());
    const account = db.prepare('SELECT u.* FROM users u JOIN account_sessions s ON s.user_id=u.id WHERE s.token=? AND u.active=1').get(digest(cookieToken(req)||''));
    if(account && localTesting(req)) account.verified=1;
    return account;
  }
  function requireUser(req, admin=false, verified=true) {const u=user(req);if(!u)fail('Please log in.',401);if(verified&&!u.verified)fail('Verify your email first.',403);if(admin&&u.role!=='admin')fail('Only administrators can manage accounts.',403);return u;}
  const mailReady = (req,allowTesting=false) => {if(allowTesting&&localTesting(req))return;if(!mail.configured())fail('Email delivery is not configured. Configure SMTP in .env before continuing.',503);};
  async function sendToken(u,purpose,req) {
    if(purpose==='verify'&&localTesting(req))return;
    mailReady();const token=randomBytes(32).toString('hex'),hash=digest(token);
    db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?)').run(hash,u.id,purpose,Date.now()+(purpose==='verify'?86400000:1800000));
    try {await mail.send(u.email,token,purpose,u.role);} catch {db.prepare('DELETE FROM account_tokens WHERE hash=?').run(hash);fail('Email could not be sent. Please retry or check the email configuration.',503);}
    // Retain only the newest successfully delivered link of this type.
    db.prepare('DELETE FROM account_tokens WHERE user_id=? AND purpose=? AND hash<>?').run(u.id,purpose,hash);
  }
  function consume(token,purpose) {
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('Invalid or expired link.');
    const row=db.prepare('SELECT t.*,u.active FROM account_tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=? AND t.purpose=?').get(digest(token),purpose);
    if(!row||row.expires<Date.now()||!row.active)fail('Invalid or expired link.');return row;
  }
  async function handle(req,res,route,body) {
    if(route==='/api/session'&&req.method==='GET') {const u=user(req);reply(res,200,{authenticated:!!u,needsSetup:!hasAdmin(),legacyAccess:!!db.prepare('SELECT id FROM users WHERE email IS NULL').get(),emailConfigured:mail.configured(),localTesting:!!localTesting(req),user:u?publicUser(u):null});return true;}
    if(route==='/api/setup'&&req.method==='POST') {
      limit(req,'setup',10);if(hasAdmin())fail('Admin already configured.',409);if(body.code!==setupCode)fail('Invalid setup code.',403);mailReady(req,true);
      const email=emailValue(body.email),name=clean(body.name),password=passwordHash(body.password);if(name.length<2)fail('Enter your name.');
      const id=Number(db.prepare("INSERT INTO users(name,email,salt,hash,role) VALUES(?,?,?,?,'admin')").run(name,email,password.salt,password.hash).lastInsertRowid);
      // Keep the pending account if delivery fails; login/resend can recover it.
      await sendToken(db.prepare('SELECT * FROM users WHERE id=?').get(id),'verify',req);reply(res,201,{ok:true,message:'Account created. Check your email to verify, then sign in.'});return true;
    }
    if(route==='/api/register'&&req.method==='POST') {
      limit(req,'register',5);mailReady(req,true);const email=emailValue(body.email),name=clean(body.name),p=passwordHash(body.password);
      if(name.length<2)fail('Enter your name.');if(body.consent!=='on'&&body.consent!==true)fail('Please agree to account and inquiry communications.');
      if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail('An account already uses this email. Sign in or reset your password.',409);
      const id=Number(db.prepare("INSERT INTO users(name,email,salt,hash,role) VALUES(?,?,?,?,'client')").run(name,email,p.salt,p.hash).lastInsertRowid);
      try{await sendToken(db.prepare('SELECT * FROM users WHERE id=?').get(id),'verify',req);}catch(e){db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(id);db.prepare('DELETE FROM users WHERE id=?').run(id);throw e;}
      reply(res,201,{ok:true});return true;
    }
    if(route==='/api/login'&&req.method==='POST') {
      limit(req,'login',10);const email=clean(body.email,254).toLowerCase();
      const u=email?db.prepare('SELECT * FROM users WHERE email=?').get(email):db.prepare('SELECT * FROM users WHERE email IS NULL').get();
      // Use a real scrypt calculation even when the account is unknown.
      const candidate=u||{salt:'unknown-account',hash:'00'.repeat(64)};
      if(!matches(candidate,body.password)||!u||!u.active)fail('Incorrect email or password.',401);
      const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO account_sessions VALUES(?,?,?)').run(digest(token),u.id,Date.now()+28800000);
      res.setHeader('Set-Cookie',`luzio_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);
      reply(res,200,{ok:true});return true;
    }
    if(route==='/api/logout'&&req.method==='POST') {db.prepare('DELETE FROM account_sessions WHERE token=?').run(digest(cookieToken(req)||''));res.setHeader('Set-Cookie','luzio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');reply(res,200,{ok:true});return true;}
    if(route==='/api/account/email'&&req.method==='POST') {
      const u=requireUser(req,false,false);limit(req,'attach-email',5);if(u.email)fail('This account already has an email.',409);mailReady(req,true);const email=emailValue(body.email),name=clean(body.name);if(name.length<2)fail('Enter your name.');
      if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail('That email is already in use.',409);
      db.prepare('UPDATE users SET name=?,email=?,verified=0 WHERE id=?').run(name,email,u.id);await sendToken({...u,name,email},'verify',req);reply(res,200,{ok:true});return true;
    }
    if(route==='/api/verification/resend'&&req.method==='POST') {
      const u=requireUser(req,false,false);limit(req,'resend',5);if(!u.email)fail('Add an email first.');if(!u.verified)await sendToken(u,'verify',req);reply(res,200,{ok:true});return true;
    }
    if(route==='/api/verify'&&req.method==='POST') {
      limit(req,'verify',20);const row=consume(body.token,'verify');db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET verified=1 WHERE id=?').run(row.user_id);db.prepare("DELETE FROM account_tokens WHERE user_id=? AND purpose='verify'").run(row.user_id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}reply(res,200,{ok:true});return true;
    }
    if(route==='/api/forgot-password'&&req.method==='POST') {
      limit(req,'forgot',5);mailReady();const email=emailValue(body.email),u=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
      if(u){try{await sendToken(u,'reset');}catch{console.error('Password-reset email delivery failed. Check SMTP configuration.');}}reply(res,200,{ok:true,message:'If an active account matches, a reset link will arrive shortly.'});return true;
    }
    if(route==='/api/reset-password'&&req.method==='POST') {
      limit(req,'reset',10);const p=passwordHash(body.password),row=consume(body.token,'reset');
      db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET salt=?,hash=?,verified=1 WHERE id=?').run(p.salt,p.hash,row.user_id);db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(row.user_id);db.prepare('DELETE FROM account_sessions WHERE user_id=?').run(row.user_id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}reply(res,200,{ok:true});return true;
    }
    if(route==='/api/users'&&req.method==='GET') {requireUser(req,true);reply(res,200,db.prepare('SELECT * FROM users ORDER BY id').all().map(publicUser));return true;}
    if(route==='/api/users'&&req.method==='POST') {
      requireUser(req,true);limit(req,'invite',10);mailReady();const email=emailValue(body.email),name=clean(body.name),role=body.role;if(name.length<2||!['admin','staff'].includes(role))fail('Enter a name and valid role.');if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail('Account already exists.',409);
      const p=passwordHash(randomBytes(32).toString('hex')),id=Number(db.prepare('INSERT INTO users(name,email,salt,hash,role) VALUES(?,?,?,?,?)').run(name,email,p.salt,p.hash,role).lastInsertRowid);
      try{await sendToken(db.prepare('SELECT * FROM users WHERE id=?').get(id),'invite');}catch(e){db.prepare('DELETE FROM users WHERE id=?').run(id);throw e;}reply(res,201,{ok:true});return true;
    }
    if(route==='/api/accept-invite'&&req.method==='POST') {
      limit(req,'invite-accept',10);const p=passwordHash(body.password),row=consume(body.token,'invite');db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET salt=?,hash=?,verified=1 WHERE id=?').run(p.salt,p.hash,row.user_id);db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(row.user_id);db.prepare('DELETE FROM account_sessions WHERE user_id=?').run(row.user_id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}reply(res,200,{ok:true});return true;
    }
    if(/^\/api\/users\/\d+$/.test(route)&&req.method==='PATCH') {
      const actor=requireUser(req,true),id=Number(route.split('/').pop()),target=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!target)fail('Account not found.',404);
      if(id===actor.id)fail('You cannot change your own role or access.');if(!['admin','staff','client'].includes(body.role)||typeof body.active!=='boolean')fail('Invalid account settings.');
      db.prepare('UPDATE users SET role=?,active=? WHERE id=?').run(body.role,body.active?1:0,id);db.prepare('DELETE FROM account_sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(id);reply(res,200,{ok:true});return true;
    }
    if(/^\/api\/users\/\d+\/invite$/.test(route)&&req.method==='POST') {requireUser(req,true);limit(req,'invite',10);const u=db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(Number(route.split('/')[3]));if(!u||u.verified)fail('No pending account found.');await sendToken(u,u.role==='client'?'verify':'invite');reply(res,200,{ok:true});return true;}
    return false;
  }
  return {handle,user,hasAdmin};
}
module.exports={createAccounts};
