const {test}=require('node:test'),assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {scryptSync}=require('node:crypto');
const {createApi}=require('./backend.cjs');
function harness(configured=true, deliveryFailure=false, localAuthTesting=false,extraOptions={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'luzio-test-')),sent=[];
 let api=createApi(directory,{adminOnly:false,...extraOptions,localAuthTesting,mail:{configured:()=>configured,send:async(email,token,purpose)=>{if(deliveryFailure)throw Error('SMTP unavailable');sent.push({email,token,purpose});}}}),cookie='';
 async function request(route,method='GET',body,headers={},remoteAddress='127.0.0.1'){
  const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);Object.assign(req,{method,headers:{host:'localhost','content-type':'application/json',cookie,...headers},socket:{remoteAddress}});
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,h){this.status=status;Object.assign(this.headers,h);},end(data){this.data=JSON.parse(data);}};
  await api(req,res,'/api/'+route);return res;
 }
 return {directory,sent,request,get api(){return api;},get cookie(){return cookie;},set cookie(v){cookie=v;},async login(email,password){const r=await request('login','POST',{email,password});if(r.status===200)cookie=r.headers['Set-Cookie'].split(';')[0];return r;},restart(){api.close();api=createApi(directory,{adminOnly:false,...extraOptions,localAuthTesting,mail:{configured:()=>configured,send:async(email,token,purpose)=>sent.push({email,token,purpose})}});},close(){api.close();assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('luzio-test-'));fs.rmSync(directory,{recursive:true,force:true});}};
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
  const bike={name:'Test Motorcycle',brand:'Test',type:'Naked',year:2024,price:150000,mileage:1000,publication:'published',status:'available',description:'Test only'};
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
  const bike={name:'Customer Test Unit',brand:'Honda',type:'Scooter',year:2024,price:100000,mileage:100,publication:'published',status:'available',description:'Test'};
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
  const bike={name:'Photo Test',brand:'Ducati',type:'Sport',year:null,mileage:null,price:1695000,publication:'published',status:'available',images:[second.data.image,first.data.image]};
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
  const bike={name:'Backup Test',brand:'Ducati',type:'Sport',price:100,year:null,mileage:null,publication:'published',status:'available',images:[uploaded.data.image]};await r('bikes','POST',bike);
  const saved=await r('backups','POST',{});assert.equal(saved.status,201);assert.equal(saved.data.count,1);
  const folder=path.join(h.directory,'backups',saved.data.last.name),manifest=verifyBackup(folder);assert.ok(manifest.files.some(f=>f.path===uploaded.data.image));assert.ok(manifest.files.some(f=>f.path.startsWith('assets/')));
  const restored=new DatabaseSync(path.join(folder,'luzio.sqlite'),{readOnly:true});assert.equal(JSON.parse(restored.prepare('SELECT data FROM bikes').get().data).name,'Backup Test');assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');restored.close();
  const photo=path.join(folder,uploaded.data.image);assert.ok(fs.readFileSync(photo).equals(fs.readFileSync(path.join(h.directory,uploaded.data.image))));
  fs.appendFileSync(photo,'tamper');assert.throws(()=>verifyBackup(folder),/verification failed/);
 }finally{h.close();}
});

test('fresh clone defaults to local testing without .env; production and explicit opt-out stay strict',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'luzio-test-')),oldMode=process.env.NODE_ENV,oldFlag=process.env.LOCAL_AUTH_TEST;
 let api;
 async function request(route,body){const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{method:body?'POST':'GET',headers:{host:'localhost:4174','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}});const res={setHeader(){},writeHead(status){this.status=status;},end(raw){this.data=JSON.parse(raw);}};await api(req,res,'/api/'+route);return res;}
 try{
  delete process.env.NODE_ENV;delete process.env.LOCAL_AUTH_TEST;
  api=createApi(directory,{adminOnly:false,mail:{configured:()=>false,send:async()=>{throw Error('Email must not be used');}}});
  assert.equal((await request('session')).data.localTesting,true);
  assert.equal((await request('setup',{code:api.setupCode,name:'Fresh Owner',email:'fresh@example.test',password:'Fresh clone password'})).status,201);
  assert.equal((await request('register',{name:'Fresh Customer',email:'customer@example.test',password:'Fresh clone password',consent:true})).status,201);
  api.close();process.env.LOCAL_AUTH_TEST='false';api=createApi(directory,{adminOnly:false,mail:{configured:()=>false}});assert.equal((await request('session')).data.localTesting,false);api.close();
  process.env.LOCAL_AUTH_TEST='true';process.env.NODE_ENV='production';api=createApi(directory,{adminOnly:false,mail:{configured:()=>false}});assert.equal((await request('session')).data.localTesting,false);
  assert.equal((await request('register',{name:'Production Customer',email:'production@example.test',password:'Fresh clone password',consent:true})).status,503);
 }finally{api?.close();if(oldMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldMode;if(oldFlag===undefined)delete process.env.LOCAL_AUTH_TEST;else process.env.LOCAL_AUTH_TEST=oldFlag;assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('luzio-test-'));fs.rmSync(directory,{recursive:true,force:true});}
});

test('48 MP camera photos resize successfully and decoder errors are distinct from pixel limits',async()=>{
 const sharp=require('sharp'),{compressImage,MAX_INPUT_PIXELS}=require('./compress.cjs');
 assert.equal(MAX_INPUT_PIXELS,120000000);
 const source=await sharp({create:{width:8000,height:6000,channels:3,background:'#c52320'}}).jpeg({quality:75}).toBuffer();
 const compressed=await compressImage(source),metadata=await sharp(compressed).metadata();
 assert.equal(metadata.width,1920);assert.equal(metadata.height,1440);assert.equal(metadata.format,'webp');
 await assert.rejects(()=>compressImage(Buffer.from('invalid image bytes')),e=>e.code==='IMAGE_DECODE_FAILED'&&!e.message.includes('megapixels'));
});

test('drafts stay private, legacy listings stay published, and specification edits are audited',async()=>{
 const h=harness(false,false,true),r=h.request,password='Listing workflow password';
 try{
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});await h.login('owner@example.test',password);const owner=h.cookie;
  const input={name:'Draft Ducati',brand:'Ducati',type:'Sport',price:1695000,year:null,mileage:null,status:'available',engineCc:1103,transmission:'Manual',papers:'Original documents available',ownership:'One previous owner',modifications:'Aftermarket exhaust'};
  const draft=await r('bikes','POST',input);assert.equal(draft.status,201);assert.equal(draft.data.publication,'draft');const id=draft.data.id;
  assert.equal((await r('bikes')).data.length,0);assert.equal((await r('admin/bikes')).data.length,1);
  h.cookie='';assert.equal((await r('admin/bikes')).status,401);assert.equal((await r('activity')).status,401);
  assert.equal((await r('inquiries','POST',{name:'Customer',phone:'09273046604',kind:'unit',bikeId:id,message:'I guessed a draft id'})).status,400);
  await r('register','POST',{name:'Customer',email:'customer@example.test',password,consent:true});await h.login('customer@example.test',password);assert.equal((await r('admin/bikes')).status,403);assert.equal((await r('activity')).status,403);
  h.cookie=owner;const published=await r('bikes/'+id,'PUT',{...input,publication:'published'});assert.equal(published.status,200);
  const publicBike=(await r('bikes')).data[0];assert.equal(publicBike.engineCc,1103);assert.equal(publicBike.modifications,'Aftermarket exhaust');
  const history=(await r('activity')).data;assert.equal(history.length,2);assert.equal(history[0].action,'published');assert.equal(history[0].actor_name,'Owner');assert.deepEqual(history[0].changes.publication,{before:'draft',after:'published'});
  await r('bikes/'+id,'PUT',{...input,publication:'published'});assert.equal((await r('activity')).data.length,2);
  await r('bikes/'+id,'PUT',{...input,price:1600000,publication:'published'});const edit=(await r('activity')).data[0];assert.deepEqual(edit.changes.price,{before:1695000,after:1600000});assert.equal(edit.action,'updated');
  assert.equal((await r('bikes/'+id,'PUT',{...input,engineCc:-1,publication:'published'})).status,400);assert.equal((await r('activity')).data.length,3);
  await r('bikes/'+id,'PUT',{...input,publication:'draft'});assert.equal((await r('bikes')).data.length,0);assert.equal((await r('activity')).data[0].action,'unpublished');
  const db=new DatabaseSync(path.join(h.directory,'luzio.sqlite'));db.prepare('INSERT INTO bikes(data) VALUES(?)').run(JSON.stringify({name:'Legacy Unit',status:'available'}));db.close();h.restart();assert.equal((await r('bikes')).data[0].name,'Legacy Unit');assert.equal((await r('bikes')).data[0].publication,'published');
 }finally{h.close();}
});

test('missing image processor is reported as a server setup issue, not a corrupt photo',async()=>{
 const {createImageProcessor}=require('./compress.cjs');
 const processor=createImageProcessor(()=>{throw Object.assign(new Error("Cannot find module 'sharp'"),{code:'MODULE_NOT_FOUND'});});
 await assert.rejects(()=>processor.compressImage(Buffer.from('photo')),e=>e.code==='IMAGE_PROCESSOR_UNAVAILABLE');
 const h=harness(false,false,true,{imageProcessor:processor}),r=h.request,password='Upload diagnostics password';
 try{
  assert.equal((await r('upload-health')).status,401);
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});await h.login('owner@example.test',password);
  const health=await r('upload-health');assert.equal(health.status,503);assert.equal(health.data.code,'IMAGE_PROCESSOR_UNAVAILABLE');assert.match(health.data.error,/npm ci/);
  const upload=await r('uploads','POST',{data:'data:image/png;base64,iVBORw0KGgo='});assert.equal(upload.status,503);assert.equal(upload.data.code,'IMAGE_PROCESSOR_UNAVAILABLE');assert.ok(upload.data.reference);assert.ok(!upload.data.error.includes('could not be decoded'));
  await r('register','POST',{name:'Customer',email:'customer@example.test',password,consent:true});await h.login('customer@example.test',password);assert.equal((await r('upload-health')).status,403);
 }finally{h.close();}
 const healthy=await require('./compress.cjs').healthCheck();assert.equal(healthy.ok,true);assert.equal(healthy.diagnosticsVersion,2);
});
test('admin deletion hides units, preserves inquiries, and supports audited restoration',async()=>{
 const h=harness(false,false,true),r=h.request,password='Delete workflow password';
 try{
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});await h.login('owner@example.test',password);const owner=h.cookie;
  const bike={name:'Recovery Ducati',brand:'Ducati',type:'Sport',price:1695000,status:'available',publication:'published',year:null,mileage:null};
  const created=await r('bikes','POST',bike);assert.equal(created.status,201);const id=created.data.id;
  h.cookie='';assert.equal((await r('bikes/'+id,'DELETE',{confirmName:bike.name})).status,401);
  await r('register','POST',{name:'Customer',email:'customer@example.test',password,consent:true});await h.login('customer@example.test',password);const customer=h.cookie;
  const inquiry=await r('inquiries','POST',{name:'Customer',phone:'09273046604',kind:'unit',bikeId:id,message:'Interested in this motorcycle'});assert.equal(inquiry.status,201);
  assert.equal((await r('bikes/'+id,'DELETE',{confirmName:bike.name})).status,403);
  h.cookie=owner;assert.equal((await r('bikes/'+id,'DELETE',{confirmName:'wrong'})).status,400);
  assert.equal((await r('bikes/'+id,'DELETE',{confirmName:bike.name})).status,200);
  assert.equal((await r('bikes')).data.length,0);assert.equal((await r('admin/bikes')).data.length,0);assert.equal((await r('admin/deleted-bikes')).data[0].name,bike.name);
  assert.equal((await r('bikes/'+id,'PUT',bike)).status,409);assert.equal((await r('bikes/'+id,'DELETE',{confirmName:bike.name})).status,409);
  assert.equal((await r('activity')).data[0].action,'deleted');
  h.cookie=customer;assert.equal((await r('inquiries/'+inquiry.data.id+'/messages')).status,200);
  assert.equal((await r('inquiries','POST',{name:'Customer',phone:'09273046604',kind:'unit',bikeId:id,message:'Another inquiry'})).status,400);
  assert.equal((await r('bikes/'+id+'/restore','POST',{})).status,403);
  h.cookie=owner;h.restart();assert.equal((await r('admin/deleted-bikes')).data.length,1);
  assert.equal((await r('bikes/'+id+'/restore','POST',{})).status,200);assert.equal((await r('bikes')).data[0].name,bike.name);assert.equal((await r('admin/deleted-bikes')).data.length,0);assert.equal((await r('activity')).data[0].action,'restored');
  assert.equal((await r('bikes/'+id+'/restore','POST',{})).status,409);
 }finally{h.close();}
});

test('admin-only showroom disables customers, staff and new website inquiries while keeping backups',async()=>{
 const options={adminOnly:false},h=harness(false,false,true,options),r=h.request,password='Admin only revision password';
 try{
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});await h.login('owner@example.test',password);const owner=h.cookie;
  await r('register','POST',{name:'Customer',email:'client@example.test',password,consent:true});await h.login('client@example.test',password);const customer=h.cookie;
  const db=new DatabaseSync(path.join(h.directory,'luzio.sqlite'));db.prepare("INSERT INTO users(name,email,salt,hash,role,verified) SELECT 'Staff','staff@example.test',salt,hash,'staff',1 FROM users WHERE role='admin' LIMIT 1").run();db.close();
  await h.login('staff@example.test',password);const staff=h.cookie;
  options.adminOnly=true;h.restart();
  h.cookie=customer;assert.equal((await r('session')).data.authenticated,false);assert.equal((await r('admin/bikes')).status,401);
  h.cookie=staff;assert.equal((await r('session')).data.authenticated,false);assert.equal((await r('admin/bikes')).status,401);
  assert.equal((await h.login('client@example.test',password)).status,401);assert.equal((await h.login('staff@example.test',password)).status,401);
  assert.equal((await r('register','POST',{})).status,410);assert.equal((await r('inquiries','POST',{})).status,410);
  h.cookie=owner;assert.equal((await r('admin/bikes')).status,200);assert.equal((await r('users')).status,410);assert.equal((await r('users','POST',{role:'staff'})).status,410);
  assert.equal((await r('backups')).status,200);assert.equal((await r('bikes')).status,200);
  assert.equal((await h.login('owner@example.test',password)).status,200);
 }finally{h.close();}
});

test('password-only admin testing requires a valid password and private peer, with production and opt-out guards',async()=>{
 const saved={mode:process.env.NODE_ENV,email:process.env.ADMIN_TEST_EMAIL,flag:process.env.ADMIN_PASSWORD_ONLY};
 delete process.env.NODE_ENV;delete process.env.ADMIN_TEST_EMAIL;delete process.env.ADMIN_PASSWORD_ONLY;
 const h=harness(false,false,true,{adminOnly:true}),r=h.request,password='Private admin test password';
 try{
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});
  assert.equal((await r('session')).data.passwordOnlyAdmin,true);
  assert.equal((await r('login','POST',{password:'wrong'})).status,401);
  assert.equal((await r('login','POST',{password})).status,200);
  assert.equal((await r('login','POST',{password},{host:'192.168.1.62:4174'},'192.168.1.20')).status,200);
  assert.equal((await r('login','POST',{password},{host:'example.test'},'203.0.113.20')).status,401);
  process.env.ADMIN_PASSWORD_ONLY='false';assert.equal((await r('session')).data.passwordOnlyAdmin,false);assert.equal((await r('login','POST',{password})).status,401);
  process.env.ADMIN_PASSWORD_ONLY='true';process.env.NODE_ENV='production';assert.equal((await r('session')).data.passwordOnlyAdmin,false);assert.equal((await r('login','POST',{password})).status,401);assert.equal((await h.login('owner@example.test',password)).status,200);
 }finally{h.close();for(const [key,value] of [['NODE_ENV',saved.mode],['ADMIN_TEST_EMAIL',saved.email],['ADMIN_PASSWORD_ONLY',saved.flag]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('admin email management lists only admins and supports one-time local activation without staff access',async()=>{
 const h=harness(false,false,true,{adminOnly:true}),r=h.request,password='Admin email management password';
 try{
  assert.equal((await r('admin-accounts')).status,401);
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});await h.login('owner@example.test',password);const owner=h.cookie;
  assert.equal((await r('admin-accounts')).data.length,1);
  assert.equal((await r('admin-accounts','POST',{name:'Staff',email:'staff@example.test',role:'staff'})).status,400);
  const added=await r('admin-accounts','POST',{name:'Second Admin',email:'second@example.test'});assert.equal(added.status,201);assert.match(added.data.activationPath,/^\/admin#invite\?token=[a-f0-9]{64}$/);
  const list=(await r('admin-accounts')).data;assert.equal(list.length,2);assert.ok(list.every(a=>a.role==='admin'));assert.equal(list.find(a=>a.email==='second@example.test').pending,true);assert.ok(!('hash' in list[0]));
  assert.equal((await r('admin-accounts','POST',{name:'Duplicate',email:'second@example.test'})).status,409);
  const token=added.data.activationPath.split('token=')[1];h.cookie='';assert.equal((await r('accept-invite','POST',{token,password})).status,200);assert.equal((await r('accept-invite','POST',{token,password})).status,400);
  assert.equal((await h.login('second@example.test',password)).status,200);assert.equal((await r('admin/bikes')).status,200);
  h.cookie=owner;assert.equal((await r('admin-accounts')).data.find(a=>a.email==='second@example.test').pending,false);
 }finally{h.close();}
});

test('admin invitations use email delivery outside local testing',async()=>{
 const h=harness(true,false,false,{adminOnly:true}),r=h.request,password='Delivered admin invitation password';
 try{
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});await r('verify','POST',{token:h.sent.at(-1).token});await h.login('owner@example.test',password);
  const added=await r('admin-accounts','POST',{name:'Invited Admin',email:'invite@example.test'});assert.equal(added.status,201);assert.equal(added.data.activationPath,undefined);assert.equal(h.sent.at(-1).email,'invite@example.test');assert.equal(h.sent.at(-1).purpose,'invite');
  assert.equal((await r('accept-invite','POST',{token:h.sent.at(-1).token,password})).status,200);assert.equal((await h.login('invite@example.test',password)).status,200);
 }finally{h.close();}
});

test('draft login code gates sessions, survives restart, rejects reuse and limits guesses',async()=>{
 const h=harness(true,false,false,{loginEmailVerification:true}),r=h.request,password='Long password for testing',email='otp@example.test';
 try{
  assert.equal((await r('setup','POST',{code:h.api.setupCode,name:'OTP Owner',email,password})).status,201);
  const login=await h.login(email,password);assert.equal(login.status,202);assert.equal(login.data.verificationRequired,true);
  assert.ok(!JSON.stringify(login.data).includes(h.sent.at(-1).token));
  h.cookie=login.headers['Set-Cookie'].split(';')[0];const code=h.sent.at(-1).token;assert.match(code,/^\d{6}$/);
  assert.equal((await r('session')).data.authenticated,false);
  assert.equal((await r('admin/bikes')).status,401);
  assert.equal((await h.login(email,password)).status,429);
  assert.equal((await r('login/verify','POST',{code:'bad'})).status,400);
  h.restart();const verified=await r('login/verify','POST',{code});assert.equal(verified.status,200);
  assert.equal((await r('login/verify','POST',{code})).status,400);
  h.cookie=verified.headers['Set-Cookie'][0].split(';')[0];assert.equal((await r('session')).data.authenticated,true);
  await r('logout','POST',{});const next=await h.login(email,password);h.cookie=next.headers['Set-Cookie'].split(';')[0];
  const actual=h.sent.at(-1).token,wrong=actual==='000000'?'000001':'000000';
  for(let i=0;i<5;i++)assert.equal((await r('login/verify','POST',{code:wrong})).status,400);
  assert.equal((await r('login/verify','POST',{code:actual})).status,400);
 }finally{h.close();}
});

test('draft login code fails closed without SMTP and rejects expired challenges',async()=>{
 const h=harness(false,false,true,{loginEmailVerification:true}),r=h.request,password='Long password for testing',email='otp@example.test';
 try{
  assert.equal((await r('setup','POST',{code:h.api.setupCode,name:'OTP Owner',email,password})).status,201);
  assert.equal((await h.login(email,password)).status,503);
  assert.equal((await r('session')).data.authenticated,false);
  assert.equal((await r('session')).data.passwordOnlyAdmin,false);
 }finally{h.close();}
 const g=harness(true,false,false,{loginEmailVerification:true});
 try{
  await g.request('setup','POST',{code:g.api.setupCode,name:'OTP Owner',email,password});const login=await g.login(email,password);
  g.cookie=login.headers['Set-Cookie'].split(';')[0];
  const db=new DatabaseSync(path.join(g.directory,'luzio.sqlite'));db.exec('UPDATE login_challenges SET expires=0');db.close();
  assert.equal((await g.request('login/verify','POST',{code:g.sent.at(-1).token})).status,400);
 }finally{g.close();}
});

test('email-password local LAN login works without SMTP when password-only UI is disabled',async()=>{
 const old=process.env.ADMIN_PASSWORD_ONLY,chosen=process.env.ADMIN_TEST_EMAIL;process.env.ADMIN_PASSWORD_ONLY='false';process.env.ADMIN_TEST_EMAIL='lan@example.test';
 const h=harness(false,false,true,{adminOnly:true}),password='Long password for testing';
 try{
  await h.request('setup','POST',{code:h.api.setupCode,name:'LAN Admin',email:'lan@example.test',password});
  const login=await h.request('login','POST',{email:'lan@example.test',password},{host:'192.168.1.62:4174'},'192.168.1.10');assert.equal(login.status,200);h.cookie=login.headers['Set-Cookie'].split(';')[0];
  const session=await h.request('session','GET',undefined,{host:'192.168.1.62:4174'},'192.168.1.10');assert.equal(session.data.passwordOnlyAdmin,false);assert.equal(session.data.user.verified,true);
  assert.equal((await h.request('session','GET',undefined,{host:'public.example'},'8.8.8.8')).data.user.verified,false);
 }finally{h.close();if(old===undefined)delete process.env.ADMIN_PASSWORD_ONLY;else process.env.ADMIN_PASSWORD_ONLY=old;if(chosen===undefined)delete process.env.ADMIN_TEST_EMAIL;else process.env.ADMIN_TEST_EMAIL=chosen;}
});

test('Super Admin controls devices and access; ordinary admins cannot manage accounts; recovery is one-use',async()=>{
 const h=harness(true,false,true,{adminOnly:true}),r=h.request,password='Long password for testing',email='super@example.test';
 try{
  await r('setup','POST',{code:h.api.setupCode,name:'Super Owner',email,password});await h.login(email,password);const owner=h.cookie;
  assert.equal((await r('session')).data.user.superAdmin,true);
  const invitation=await r('admin-accounts','POST',{name:'Client Admin',email:'clientadmin@example.test'});assert.equal(invitation.status,201);
  const token=new URLSearchParams(invitation.data.activationPath.split('?')[1]).get('token');await r('accept-invite','POST',{token,password});
  const accounts=(await r('security/accounts')).data,target=accounts.find(u=>u.email==='clientadmin@example.test');
  const first=await r('login','POST',{email:target.email,password},{'user-agent':'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0'});const firstCookie=first.headers['Set-Cookie'].split(';')[0];
  const second=await r('login','POST',{email:target.email,password},{'user-agent':'Mozilla/5.0 (iPhone) Safari/605.1'});const secondCookie=second.headers['Set-Cookie'].split(';')[0];
  h.cookie=firstCookie;assert.equal((await r('security/devices')).status,403);assert.equal((await r('security/accounts')).status,403);assert.equal((await r('admin-accounts')).status,403);assert.equal((await r('admin-accounts','POST',{name:'Attack Admin',email:'attack@example.test'})).status,403);
  assert.equal((await r('security/accounts','PATCH',{userId:target.id,active:true,superAdmin:true,password})).status,403);
  h.cookie=owner;let devices=(await r('security/devices')).data;assert.ok(devices.some(d=>d.current));assert.ok(devices.some(d=>d.device==='Chrome / Windows'));assert.ok(devices.some(d=>d.device==='Safari / iOS'));assert.ok(devices.every(d=>'id' in d&&!firstCookie.includes(d.id)));
  const device=devices.find(d=>d.userId===target.id&&d.device==='Chrome / Windows');
  assert.equal((await r('security/revoke','POST',{deviceId:device.id,password:'wrong'})).status,403);
  assert.equal((await r('security/revoke','POST',{deviceId:device.id,password})).status,200);
  h.cookie=firstCookie;assert.equal((await r('session')).data.authenticated,false);h.cookie=secondCookie;assert.equal((await r('session')).data.authenticated,true);
  h.cookie=owner;assert.equal((await r('security/accounts','PATCH',{userId:target.id,active:false,superAdmin:false,password})).status,200);
  h.cookie=secondCookie;assert.equal((await r('session')).data.authenticated,false);assert.equal((await h.login(target.email,password)).status,401);
  h.cookie=owner;assert.equal((await r('security/accounts','PATCH',{userId:target.id,active:true,superAdmin:true,password})).status,200);
  assert.equal((await r('security/accounts','PATCH',{userId:accounts.find(u=>u.email===email).id,active:false,superAdmin:false,password})).status,400);
  await h.login(target.email,password);assert.equal((await r('session')).data.user.superAdmin,true);
  const codes=(await r('security/recovery-codes','POST',{password})).data.codes;assert.equal(codes.length,8);const newPassword='Changed recovery password';
  h.cookie='';assert.equal((await r('security/recover','POST',{email:target.email,code:codes[0],newPassword})).status,200);
  h.cookie=secondCookie;assert.equal((await r('session')).data.authenticated,false);
  assert.equal((await r('security/recover','POST',{email:target.email,code:codes[0],newPassword})).status,400);
  assert.equal((await h.login(target.email,password)).status,401);assert.equal((await h.login(target.email,newPassword)).status,200);
  const events=(await r('security/events')).data;assert.ok(events.some(e=>e.action==='disabled account'));assert.ok(events.some(e=>e.action==='recovered account and revoked all sessions'));
  h.restart();assert.equal((await r('session')).data.user.superAdmin,true);
 }finally{h.close();}
});

test('Super Admin invitations select access level and require current password for elevated access',async()=>{
 const h=harness(true,false,true,{adminOnly:true}),r=h.request,password='Long password for testing';
 try{
  await r('setup','POST',{code:h.api.setupCode,name:'Owner',email:'owner@example.test',password});await h.login('owner@example.test',password);
  assert.equal((await r('admin-accounts','POST',{name:'New Super',email:'new@example.test',role:'super_admin'})).status,403);
  assert.equal((await r('admin-accounts','POST',{name:'New Super',email:'new@example.test',role:'super_admin',password:'incorrect'})).status,403);
  const invited=await r('admin-accounts','POST',{name:'New Super',email:'new@example.test',role:'super_admin',password});assert.equal(invited.status,201);
  assert.equal((await r('admin-accounts')).data.find(u=>u.email==='new@example.test').accessLevel,'super_admin');
  const token=new URLSearchParams(invited.data.activationPath.split('?')[1]).get('token');assert.equal((await r('accept-invite','POST',{token,password})).status,200);
  await h.login('new@example.test',password);assert.equal((await r('session')).data.user.superAdmin,true);
 }finally{h.close();}
});
