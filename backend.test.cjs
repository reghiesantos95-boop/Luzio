const {test}=require('node:test'),assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {scryptSync}=require('node:crypto');
const {createApi}=require('./backend.cjs');
function harness(configured=true, deliveryFailure=false, localAuthTesting=false){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'luzio-test-')),sent=[];
 let api=createApi(directory,{localAuthTesting,mail:{configured:()=>configured,send:async(email,token,purpose)=>{if(deliveryFailure)throw Error('SMTP unavailable');sent.push({email,token,purpose});}}}),cookie='';
 async function request(route,method='GET',body,headers={}){
  const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);Object.assign(req,{method,headers:{host:'localhost','content-type':'application/json',cookie,...headers},socket:{remoteAddress:'127.0.0.1'}});
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,h){this.status=status;Object.assign(this.headers,h);},end(data){this.data=JSON.parse(data);}};
  await api(req,res,'/api/'+route);return res;
 }
 return {directory,sent,request,get api(){return api;},get cookie(){return cookie;},set cookie(v){cookie=v;},async login(email,password){const r=await request('login','POST',{email,password});if(r.status===200)cookie=r.headers['Set-Cookie'].split(';')[0];return r;},restart(){api.close();api=createApi(directory,{localAuthTesting,mail:{configured:()=>configured,send:async(email,token,purpose)=>sent.push({email,token,purpose})}});},close(){api.close();assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('luzio-test-'));fs.rmSync(directory,{recursive:true,force:true});}};
}
test('email setup, verification, role boundaries, invitations, resets, inventory and persistence',async()=>{
 const h=harness(),r=h.request,password='Long password for testing';
 try{
  assert.equal((await r('session')).data.needsSetup,true);
  assert.equal((await r('bikes','POST',{})).status,401);
  const setup={code:h.api.setupCode,name:'Owner',email:'owner@example.test',password};
  assert.equal((await r('setup','POST',{...setup,code:'wrong'})).status,403);
  assert.equal((await r('setup','POST',{...setup,password:'short'})).status,400);
  assert.equal((await r('setup','POST',setup)).status,201);
  assert.equal((await r('setup','POST',setup)).status,409);
  assert.equal((await h.login(setup.email,'incorrect')).status,401);
  assert.equal((await h.login(setup.email,password)).status,200);
  assert.equal((await r('session')).data.user.verified,false);
  assert.equal((await r('bikes','POST',{})).status,401);
  const first=h.sent.at(-1);assert.equal(first.purpose,'verify');
  assert.equal((await r('verification/resend','POST',{})).status,200);
  const verification=h.sent.at(-1);assert.notEqual(first.token,verification.token);
  assert.equal((await r('verify','POST',{token:first.token})).status,400);
  assert.equal((await r('verify','POST',{token:verification.token})).status,200);
  assert.equal((await r('verify','POST',{token:verification.token})).status,400);
  const ownerCookie=h.cookie;
  const bike={name:'Test Motorcycle',brand:'Test',type:'Naked',year:2024,price:150000,mileage:1000,status:'available',description:'Test only'};
  assert.equal((await r('bikes','POST',bike,{origin:'https://other.example'})).status,403);
  assert.equal((await r('bikes','POST',{...bike,price:-1})).status,400);
  const added=await r('bikes','POST',bike);assert.equal(added.status,201);const id=added.data.id;
  const inquiry={name:'Customer',phone:'09273046604',message:'Is this unit available?',kind:'unit',bikeId:id};
  assert.equal((await r('inquiries','POST',{...inquiry,phone:'abc'})).status,400);
  const received=await r('inquiries','POST',inquiry);assert.equal(received.status,201);
  assert.equal((await r('users','POST',{name:'Staff Member',email:'staff@example.test',role:'staff'})).status,201);
  const invitation=h.sent.at(-1);assert.equal(invitation.purpose,'invite');
  assert.equal((await r('accept-invite','POST',{token:invitation.token,password})).status,200);
  assert.equal((await r('accept-invite','POST',{token:invitation.token,password})).status,400);
  const accounts=(await r('users')).data,staffId=accounts.find(u=>u.role==='staff').id,ownerId=accounts.find(u=>u.role==='admin').id;
  assert.ok(accounts.every(u=>!u.hash&&!u.salt));
  assert.equal((await r('users/'+ownerId,'PATCH',{role:'staff',active:true})).status,400);
  await h.login('staff@example.test',password);const staffCookie=h.cookie;
  assert.equal((await r('users')).status,403);
  assert.equal((await r('users','POST',{name:'Forbidden',email:'x@example.test',role:'admin'})).status,403);
  assert.equal((await r('bikes/'+id,'PUT',{...bike,status:'sold'})).status,200);
  assert.equal((await r('inquiries/'+received.data.id,'PATCH',{status:'contacted'})).status,200);
  const known=await r('forgot-password','POST',{email:'staff@example.test'}),reset=h.sent.at(-1),unknown=await r('forgot-password','POST',{email:'unknown@example.test'});
  assert.deepEqual(known.data,unknown.data);
  assert.equal((await r('reset-password','POST',{token:reset.token,password:'Updated long test password'})).status,200);
  assert.equal((await r('session')).data.authenticated,false);
  assert.equal((await r('reset-password','POST',{token:reset.token,password})).status,400);
  assert.equal((await h.login('staff@example.test',password)).status,401);
  assert.equal((await h.login('staff@example.test','Updated long test password')).status,200);
  h.cookie=ownerCookie;assert.equal((await r('users/'+staffId,'PATCH',{role:'staff',active:false})).status,200);
  h.cookie=staffCookie;assert.equal((await r('session')).data.authenticated,false);
  assert.equal((await h.login('staff@example.test','Updated long test password')).status,401);
  h.cookie=ownerCookie;h.restart();assert.equal((await r('bikes')).data[0].status,'sold');assert.equal((await r('inquiries')).data[0].status,'contacted');
  assert.equal((await r('logout','POST',{})).status,200);assert.equal((await r('users')).status,401);
 }finally{h.close();}
});
test('existing password-only admin migrates and links email without losing data',async()=>{
 const h=harness(),password='Existing long password';
 try{
  const db=new DatabaseSync(path.join(h.directory,'luzio.sqlite'));
  const salt='legacy-salt';db.prepare('INSERT INTO admin VALUES(1,?,?)').run(salt,scryptSync(password,salt,64).toString('hex'));db.exec("DELETE FROM account_meta WHERE key='migration-v1'");db.prepare('INSERT INTO bikes(data) VALUES(?)').run(JSON.stringify({name:'Existing unit'}));db.close();h.restart();
  assert.equal((await h.request('session')).data.legacyAccess,true);
  assert.equal((await h.login('',password)).status,200);
  assert.equal((await h.request('account/email','POST',{name:'Existing Owner',email:'existing@example.test'})).status,200);
  await h.request('verify','POST',{token:h.sent.at(-1).token});
  assert.equal((await h.login('existing@example.test',password)).status,200);
  assert.equal((await h.request('session')).data.user.role,'admin');
  assert.equal((await h.request('bikes')).data[0].name,'Existing unit');
  h.restart();assert.equal((await h.request('users')).data.length,1);
 }finally{h.close();}
});
test('SMTP unavailable and token expiry do not silently verify accounts',async()=>{
 const h=harness(false);
 try{
  assert.equal((await h.request('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password:'A long password'})).status,503);
  assert.equal((await h.request('forgot-password','POST',{email:'owner@example.test'})).status,503);
  assert.equal(h.sent.length,0);assert.equal(h.api.hasAdmin(),false);
 }finally{h.close();}
 const good=harness();
 try{
  await good.request('setup','POST',{code:good.api.setupCode,name:'Owner',email:'owner@example.test',password:'A long password'});
  const token=good.sent.at(-1).token,db=new DatabaseSync(path.join(good.directory,'luzio.sqlite'));db.exec('UPDATE account_tokens SET expires=0');db.close();
  assert.equal((await good.request('verify','POST',{token})).status,400);
  await good.login('owner@example.test','A long password');assert.equal((await good.request('session')).data.user.verified,false);
 }finally{good.close();}
});
test('failed setup email keeps a recoverable pending account without verifying it',async()=>{
 const h=harness(true,true);
 try{
  const email='owner@example.test',password='A long password';
  const setup=await h.request('setup','POST',{code:h.api.setupCode,name:'Owner',email,password});
  assert.equal(setup.status,503);assert.equal(h.api.hasAdmin(),true);
  assert.equal((await h.login(email,password)).status,200);
  assert.equal((await h.request('session')).data.user.verified,false);
  assert.equal((await h.request('users')).status,403);
  assert.equal((await h.request('verification/resend','POST',{})).status,503);
 }finally{h.close();}
});

test('customers register without privilege escalation and see only their own inquiries',async()=>{
 const h=harness(),r=h.request,password='Customer long password';
 try{
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});
  await r('verify','POST',{token:h.sent.at(-1).token});await h.login('owner@example.test',password);const ownerCookie=h.cookie;
  const bike={name:'Customer Test Unit',brand:'Honda',type:'Scooter',year:2024,price:100000,mileage:100,status:'available',description:'Test'};
  const bikeId=(await r('bikes','POST',bike)).data.id;
  h.cookie='';assert.equal((await r('my-inquiries')).status,401);
  const register={name:'Customer One',email:'customer1@example.test',password,consent:true,role:'admin'};
  assert.equal((await r('register','POST',{...register,consent:false})).status,400);
  assert.equal((await r('register','POST',register)).status,201);const verify1=h.sent.at(-1).token;
  assert.equal((await r('register','POST',register)).status,409);
  assert.equal((await h.login(register.email,password)).status,200);
  assert.equal((await r('session')).data.user.role,'client');assert.equal((await r('my-inquiries')).status,401);
  const inquiry={name:'Customer One',phone:'09273046604',message:'Can I view this motorcycle?',kind:'unit',bikeId,owner_id:999};
  assert.equal((await r('inquiries','POST',inquiry)).status,403);
  await r('verify','POST',{token:verify1});
  assert.equal((await r('bikes','POST',bike)).status,403);
  assert.equal((await r('bikes/'+bikeId,'PUT',{...bike,status:'sold'})).status,403);
  assert.equal((await r('users')).status,403);
  assert.equal((await r('users','POST',{name:'Fake Admin',email:'fake@example.test',role:'admin'})).status,403);
  assert.equal((await r('inquiries')).status,403);
  const created=await r('inquiries','POST',inquiry);assert.equal(created.status,201);const id=created.data.id;
  const own=(await r('my-inquiries')).data;assert.equal(own.length,1);assert.equal(own[0].bikeName,bike.name);assert.equal(own[0].id,id);
  assert.equal((await r('inquiries/'+id,'PATCH',{status:'closed'})).status,403);
  const firstCookie=h.cookie;
  h.cookie='';await r('inquiries','POST',{...inquiry,message:'Guest inquiry should stay private'});
  await r('register','POST',{...register,email:'customer2@example.test',name:'Customer Two'});await r('verify','POST',{token:h.sent.at(-1).token});await h.login('customer2@example.test',password);
  assert.equal((await r('my-inquiries')).data.length,0);
  await r('inquiries','POST',{...inquiry,name:'Customer Two',message:'Second customer inquiry'});assert.equal((await r('my-inquiries')).data.length,1);
  h.cookie=firstCookie;assert.equal((await r('my-inquiries')).data.length,1);
  h.cookie=ownerCookie;assert.equal((await r('inquiries')).data.length,3);
  await r('inquiries/'+id,'PATCH',{status:'contacted'});h.cookie=firstCookie;assert.equal((await r('my-inquiries')).data[0].status,'contacted');
  const reset=await r('forgot-password','POST',{email:register.email});assert.equal(reset.status,200);
  await r('reset-password','POST',{token:h.sent.at(-1).token,password:'New customer long password'});assert.equal((await r('session')).data.authenticated,false);
  await h.login(register.email,'New customer long password');h.restart();assert.equal((await r('my-inquiries')).data[0].id,id);
 }finally{h.close();}
});
test('existing email-admin accounts and sessions survive the customer-role schema migration',async()=>{
 const h=harness(),password='Old email admin password';
 try{
  await h.request('setup','POST',{code:h.api.setupCode,name:'Existing Admin',email:'old@example.test',password});await h.request('verify','POST',{token:h.sent.at(-1).token});await h.login('old@example.test',password);
  const db=new DatabaseSync(path.join(h.directory,'luzio.sqlite'));
  db.exec(`BEGIN; ALTER TABLE users RENAME TO users_new;
   CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE COLLATE NOCASE,salt TEXT NOT NULL,hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','staff')),verified INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
   INSERT INTO users SELECT * FROM users_new; DROP TABLE users_new; COMMIT;`);db.close();h.restart();
  const session=(await h.request('session')).data;assert.equal(session.authenticated,true);assert.equal(session.user.email,'old@example.test');
  assert.equal((await h.request('register','POST',{name:'New Customer',email:'new@example.test',password,consent:true})).status,201);
 }finally{h.close();}
});


test('local testing allows registration without mail and retains production verification requirements',async()=>{
 const h=harness(false,false,true),password='Local testing password',r=h.request;
 const previousEnv=process.env.NODE_ENV;
 try{
  const body={name:'Local Customer',email:'local@example.test',password,consent:true};
  assert.equal((await r('register','POST',body,{host:'public.example'})).status,503);
  assert.equal((await r('register','POST',body)).status,201);
  assert.equal(h.sent.length,0);
  assert.equal((await h.login(body.email,password)).status,200);
  const session=(await r('session')).data;assert.equal(session.localTesting,true);assert.equal(session.user.verified,true);assert.equal(session.user.role,'client');
  assert.equal((await r('my-inquiries')).status,200);
  assert.equal((await r('inquiries','POST',{name:body.name,phone:'09273046604',kind:'general',message:'Testing local inquiry'})).status,201);
  assert.equal((await r('users')).status,403);
  const db=new DatabaseSync(path.join(h.directory,'luzio.sqlite'));assert.equal(db.prepare('SELECT verified FROM users WHERE email=?').get(body.email).verified,0);db.close();
  process.env.NODE_ENV='production';
  const deployed=(await r('session')).data;assert.equal(deployed.localTesting,false);assert.equal(deployed.user.verified,false);assert.equal((await r('my-inquiries')).status,401);
  assert.equal((await r('register','POST',{...body,email:'production@example.test'})).status,503);
 }finally{if(previousEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousEnv;h.close();}
});

test('photo uploads require team access and gallery cover/order persist',async()=>{
 const h=harness(),r=h.request,password='Photo manager password';
 try{
  const data='data:image/png;base64,'+(await require('sharp')({create:{width:12,height:12,channels:3,background:'#cc1111'}}).png().toBuffer()).toString('base64');
  assert.equal((await r('uploads','POST',{data})).status,401);
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'photos@example.test',password});await r('verify','POST',{token:h.sent.at(-1).token});await h.login('photos@example.test',password);
  assert.equal((await r('uploads','POST',{data:'data:image/png;base64,SGVsbG8='})).status,400);
  const first=await r('uploads','POST',{data}),second=await r('uploads','POST',{data});assert.equal(first.status,201);assert.equal(second.status,201);
  const bike={name:'Photo Test',brand:'Ducati',type:'Sport',year:null,mileage:null,price:1695000,status:'available',images:[second.data.image,first.data.image]};
  const saved=await r('bikes','POST',bike);assert.equal(saved.status,201);assert.equal(saved.data.image,second.data.image);assert.deepEqual(saved.data.images,bike.images);
  const id=saved.data.id;assert.equal((await r('bikes/'+id,'PUT',{...bike,images:['uploads/../../secrets.png']})).status,400);
  assert.equal((await r('bikes/'+id,'PUT',{...bike,images:[first.data.image,first.data.image]})).status,400);
  await r('bikes/'+id,'PUT',{...bike,images:[first.data.image,second.data.image]});h.restart();assert.equal((await r('bikes')).data[0].image,first.data.image);
  const {images,...details}=bike;const preserved=await r('bikes/'+id,'PUT',details);assert.deepEqual(preserved.data.images,[first.data.image,second.data.image]);
  const removed=await r('bikes/'+id,'PUT',{...bike,images:[]});assert.equal(removed.data.image,null);
 }finally{h.close();}
});


test('conversations isolate customers and track unread replies without marking unseen messages read',async()=>{
 const h=harness(false,false,true),r=h.request,password='Conversation test password';
 try{
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});await h.login('owner@example.test',password);const owner=h.cookie;
  await r('register','POST',{name:'Customer',email:'one@example.test',password,consent:true});await h.login('one@example.test',password);const customer=h.cookie;
  const created=await r('inquiries','POST',{name:'Customer',phone:'09273046604',message:'Is the Ducati available?',kind:'general'}),id=created.data.id;
  assert.equal((await r('my-inquiries')).data[0].unread,0);
  h.cookie=owner;assert.equal((await r('inquiries')).data[0].unread,1);
  const initial=await r('inquiries/'+id+'/messages');assert.equal(initial.data.messages[0].message,'Is the Ducati available?');
  await r('inquiries/'+id+'/read','POST',{lastId:initial.data.lastId});assert.equal((await r('unread')).data.total,0);
  assert.equal((await r('inquiries/'+id+'/messages','POST',{message:'Yes, you can arrange a viewing.'})).status,201);
  h.cookie=customer;assert.equal((await r('my-inquiries')).data[0].unread,1);
  const firstRead=(await r('inquiries/'+id+'/messages')).data.lastId;
  h.cookie=owner;await r('inquiries/'+id+'/messages','POST',{message:'Please let us know your preferred day.'});
  h.cookie=customer;await r('inquiries/'+id+'/read','POST',{lastId:firstRead});assert.equal((await r('unread')).data.total,1);
  const thread=await r('inquiries/'+id+'/messages');await r('inquiries/'+id+'/read','POST',{lastId:thread.data.lastId});assert.equal((await r('unread')).data.total,0);
  assert.equal((await r('inquiries/'+id+'/messages','POST',{message:' '})).status,400);
  assert.equal((await r('inquiries/'+id+'/read','POST',{lastId:999999})).status,400);
  await r('register','POST',{name:'Other Customer',email:'two@example.test',password,consent:true});await h.login('two@example.test',password);
  assert.equal((await r('inquiries/'+id+'/messages')).status,404);assert.equal((await r('inquiries/'+id+'/messages','POST',{message:'Unauthorized reply'})).status,404);assert.equal((await r('backups')).status,403);
  h.cookie='';const guest=(await r('inquiries','POST',{name:'Guest',phone:'09273046604',message:'Guest viewing question',kind:'general'})).data.id;
  assert.equal((await r('inquiries/'+id+'/messages')).status,401);
  h.cookie=owner;assert.equal((await r('inquiries/'+guest+'/messages')).data.canReply,false);assert.equal((await r('inquiries/'+guest+'/messages','POST',{message:'No inbox for guest'})).status,400);
  h.restart();assert.equal((await r('inquiries/'+id+'/messages')).data.messages.length,3);
 }finally{h.close();}
});
test('compression resizes and strips metadata; verified backups restore photos and detect tampering',async()=>{
 const sharp=require('sharp'),{compressImage}=require('./compress.cjs'),{verifyBackup}=require('./backup.cjs');
 const source=await sharp({create:{width:3200,height:2200,channels:3,background:'#cd2020'}}).jpeg({quality:100}).withMetadata().toBuffer();
 const encoded=await compressImage(source),meta=await sharp(encoded).metadata();assert.equal(meta.format,'webp');assert.ok(meta.width<=1920&&meta.height<=1920);assert.ok(encoded.length<source.length);assert.equal(meta.exif,undefined);
 const h=harness(false,false,true),r=h.request,password='Backup test password';
 try{
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});await h.login('owner@example.test',password);
  const uploaded=await r('uploads','POST',{data:'data:image/jpeg;base64,'+source.toString('base64')});assert.equal(uploaded.status,201);assert.ok(uploaded.data.bytes<uploaded.data.originalBytes);
  const bike={name:'Backup Test',brand:'Ducati',type:'Sport',price:100,year:null,mileage:null,status:'available',images:[uploaded.data.image]};await r('bikes','POST',bike);
  const saved=await r('backups','POST',{});assert.equal(saved.status,201);assert.equal(saved.data.count,1);
  const folder=path.join(h.directory,'backups',saved.data.last.name),manifest=verifyBackup(folder);assert.ok(manifest.files.some(f=>f.path===uploaded.data.image));assert.ok(manifest.files.some(f=>f.path.startsWith('assets/')));
  const restored=new DatabaseSync(path.join(folder,'luzio.sqlite'),{readOnly:true});assert.equal(JSON.parse(restored.prepare('SELECT data FROM bikes').get().data).name,'Backup Test');assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');restored.close();
  const photo=path.join(folder,uploaded.data.image);assert.ok(fs.readFileSync(photo).equals(fs.readFileSync(path.join(h.directory,uploaded.data.image))));
  fs.appendFileSync(photo,'tamper');assert.throws(()=>verifyBackup(folder),/verification failed/);
 }finally{h.close();}
});
