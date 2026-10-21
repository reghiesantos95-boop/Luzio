const {DatabaseSync}=require('node:sqlite');
const {randomBytes,scryptSync,timingSafeEqual}=require('node:crypto');
const fs=require('node:fs'), path=require('node:path');
function createApi(directory){
 fs.mkdirSync(directory,{recursive:true});
 const db=new DatabaseSync(path.join(directory,'luzio.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS admin(id INTEGER PRIMARY KEY CHECK(id=1),salt TEXT,hash TEXT);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires INTEGER);
 CREATE TABLE IF NOT EXISTS bikes(id INTEGER PRIMARY KEY,data TEXT);
 CREATE TABLE IF NOT EXISTS inquiries(id INTEGER PRIMARY KEY,data TEXT,status TEXT DEFAULT 'new',created TEXT DEFAULT CURRENT_TIMESTAMP);`);
 const setupCode=randomBytes(18).toString('hex'), attempts=new Map();
 const hasAdmin=()=>!!db.prepare('SELECT id FROM admin').get();
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const text=(v,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
 function limit(req,kind,max){
  const now=Date.now(),key=kind+req.socket.remoteAddress;
  for(const [k,v] of attempts)if(v.expires<now)attempts.delete(k);
  if(!attempts.has(key))attempts.set(key,{count:0,expires:now+900000});
  if(++attempts.get(key).count>max)fail('Too many attempts. Try again in 15 minutes.',429);
 }
 const api=async(req,res,route)=>{
  try{
   const write=!['GET','HEAD'].includes(req.method);let body={};
   if(write){
    if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)fail('Origin not allowed.',403);
    if(!String(req.headers['content-type']).startsWith('application/json'))fail('JSON required.',415);
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>32768)fail('Request too large.',413);}
    try{body=JSON.parse(raw);}catch{fail('Invalid JSON.');}
    if(!body||Array.isArray(body)||typeof body!=='object')fail('Invalid request.');
   }
   const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('luzio_session='))?.slice(14);
   db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
   const authenticated=!!token&&!!db.prepare('SELECT token FROM sessions WHERE token=?').get(token);
   if(route==='/api/session'&&req.method==='GET')return reply(res,200,{authenticated,needsSetup:!hasAdmin()});
   if(route==='/api/setup'&&req.method==='POST'){
    limit(req,'setup',10);if(hasAdmin())fail('Admin already configured.',409);
    if(body.code!==setupCode)fail('Invalid setup code.',403);
    if(typeof body.password!=='string'||body.password.length<12||body.password.length>200)fail('Use a password with 12–200 characters.');
    const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO admin VALUES(1,?,?)').run(salt,scryptSync(body.password,salt,64).toString('hex'));
    return reply(res,201,{ok:true});
   }
   if(route==='/api/login'&&req.method==='POST'){
    limit(req,'login',10);const admin=db.prepare('SELECT * FROM admin').get();
    if(!admin||typeof body.password!=='string'||body.password.length>200||!timingSafeEqual(Buffer.from(admin.hash,'hex'),scryptSync(body.password,admin.salt,64)))fail('Incorrect password.',401);
    const session=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?)').run(session,Date.now()+28800000);
    res.setHeader('Set-Cookie',`luzio_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return reply(res,200,{ok:true});
   }
   if(route==='/api/logout'&&req.method==='POST'){
    db.prepare('DELETE FROM sessions WHERE token=?').run(token||'');res.setHeader('Set-Cookie','luzio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return reply(res,200,{ok:true});
   }
   if(route==='/api/bikes'&&req.method==='GET')return reply(res,200,db.prepare('SELECT * FROM bikes ORDER BY id DESC').all().map(r=>({...JSON.parse(r.data),id:r.id})));
   if(route==='/api/inquiries'&&req.method==='POST'){
    limit(req,'inquiry',20);const name=text(body.name,100),phone=text(body.phone,30),message=text(body.message,2000),kind=text(body.kind,30);
    if(name.length<2||!/^[+\d ()-]{7,30}$/.test(phone)||message.length<5||!['general','unit','financing'].includes(kind))fail('Enter your name, valid phone number, and a message of at least 5 characters.');
    let bikeId=null;if(body.bikeId!=null&&body.bikeId!==''){bikeId=Number(body.bikeId);if(!Number.isSafeInteger(bikeId)||!db.prepare('SELECT id FROM bikes WHERE id=?').get(bikeId))fail('This unit is no longer listed. Refresh and try again.');}
    const result=db.prepare('INSERT INTO inquiries(data) VALUES(?)').run(JSON.stringify({name,phone,message,kind,bikeId}));return reply(res,201,{id:Number(result.lastInsertRowid)});
   }
   if(!authenticated)fail('Please log in.',401);
   if(route==='/api/inquiries'&&req.method==='GET')return reply(res,200,db.prepare('SELECT * FROM inquiries ORDER BY id DESC').all().map(r=>({...JSON.parse(r.data),id:r.id,status:r.status,created:r.created})));
   if(/^\/api\/inquiries\/\d+$/.test(route)&&req.method==='PATCH'){
    if(!['new','contacted','closed'].includes(body.status))fail('Invalid status.');if(!db.prepare('UPDATE inquiries SET status=? WHERE id=?').run(body.status,Number(route.split('/').pop())).changes)fail('Inquiry not found.',404);return reply(res,200,{ok:true});
   }
   if((route==='/api/bikes'&&req.method==='POST')||(/^\/api\/bikes\/\d+$/.test(route)&&req.method==='PUT')){
    const number=(key,min,max)=>{const n=Number(body[key]);if(body[key]===''||body[key]==null||!Number.isFinite(n)||n<min||n>max)fail('Invalid '+key+'.');return n;};
    const bike={name:text(body.name,100),brand:text(body.brand,60),type:text(body.type,60),year:number('year',1900,new Date().getFullYear()+1),price:number('price',0,100000000),mileage:number('mileage',0,10000000),status:text(body.status,20),description:text(body.description,3000)};
    if(!bike.name||!bike.brand||!bike.type||!Number.isInteger(bike.year)||!['available','reserved','sold'].includes(bike.status))fail('Complete all unit details.');
    let id;if(req.method==='POST')id=Number(db.prepare('INSERT INTO bikes(data) VALUES(?)').run(JSON.stringify(bike)).lastInsertRowid);
    else{id=Number(route.split('/').pop());if(!db.prepare('UPDATE bikes SET data=? WHERE id=?').run(JSON.stringify(bike),id).changes)fail('Unit not found.',404);}
    return reply(res,req.method==='POST'?201:200,{...bike,id});
   }
   fail('Not found.',404);
  }catch(e){if(!e.status)console.error(e);reply(res,e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});}
 };
 api.setupCode=setupCode;api.hasAdmin=hasAdmin;api.close=()=>db.close();return api;
}
module.exports={createApi};
