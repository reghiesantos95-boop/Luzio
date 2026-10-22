const {DatabaseSync}=require('node:sqlite');
const {randomBytes,scryptSync,timingSafeEqual}=require('node:crypto');
const fs=require('node:fs'), path=require('node:path');
function createApi(directory, options={}){
 fs.mkdirSync(directory,{recursive:true});
 const db=new DatabaseSync(path.join(directory,'luzio.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS admin(id INTEGER PRIMARY KEY CHECK(id=1),salt TEXT,hash TEXT);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires INTEGER);
 CREATE TABLE IF NOT EXISTS bikes(id INTEGER PRIMARY KEY,data TEXT);
 CREATE TABLE IF NOT EXISTS inquiries(id INTEGER PRIMARY KEY,data TEXT,status TEXT DEFAULT 'new',created TEXT DEFAULT CURRENT_TIMESTAMP);`);
 if (!db.prepare('PRAGMA table_info(inquiries)').all().some(c=>c.name==='owner_id')) db.exec('ALTER TABLE inquiries ADD COLUMN owner_id INTEGER');
 const setupCode=randomBytes(18).toString('hex'), attempts=new Map();
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const text=(v,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
 function limit(req,kind,max){
  const now=Date.now(),key=kind+req.socket.remoteAddress;
  for(const [k,v] of attempts)if(v.expires<now)attempts.delete(k);
  if(!attempts.has(key))attempts.set(key,{count:0,expires:now+900000});
  if(++attempts.get(key).count>max)fail('Too many attempts. Try again in 15 minutes.',429);
 }
 const accounts=require('./accounts.cjs').createAccounts(db,{reply,fail,limit,setupCode,mail:options.mail||require('./mail.cjs'),localAuthTesting:options.localAuthTesting??(process.env.LOCAL_AUTH_TEST===undefined?process.env.NODE_ENV!=='production':process.env.LOCAL_AUTH_TEST==='true')});
 const conversations=require('./conversations.cjs').createConversations(db,{fail,reply,limit});
 const backups=require('./backup.cjs').createBackups(db,directory);
 const api=async(req,res,route)=>{
  try{
   const write=!['GET','HEAD'].includes(req.method);let body={};
   if(write){
    if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)fail('Origin not allowed.',403);
    if(!String(req.headers['content-type']).startsWith('application/json'))fail('JSON required.',415);
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>(route==='/api/uploads'?12000000:32768))fail('Request too large.',413);}
    try{body=JSON.parse(raw);}catch{fail('Invalid JSON.');}
    if(!body||Array.isArray(body)||typeof body!=='object')fail('Invalid request.');
   }
   if(await accounts.handle(req,res,route,body))return;
   const account=accounts.user(req);
   const authenticated=!!account && !!account.verified;
   if(await conversations.handle(req,res,route,body,account))return;
   if(route==='/api/backups'){if(!authenticated)fail('Please log in.',401);if(account.role!=='admin')fail('Only admins can manage backups.',403);if(req.method==='GET')return reply(res,200,backups.status());if(req.method==='POST'){limit(req,'manual-backup',5);await backups.run();return reply(res,201,backups.status());}}
   if(route==='/api/bikes'&&req.method==='GET')return reply(res,200,db.prepare('SELECT * FROM bikes ORDER BY id DESC').all().map(r=>({...JSON.parse(r.data),id:r.id})));
   if(route==='/api/inquiries'&&req.method==='POST'){
    limit(req,'inquiry',20);const name=text(body.name,100),phone=text(body.phone,30),message=text(body.message,2000),kind=text(body.kind,30);
    if(name.length<2||!/^[+\d ()-]{7,30}$/.test(phone)||message.length<5||!['general','unit','financing'].includes(kind))fail('Enter your name, valid phone number, and a message of at least 5 characters.');
    let bikeId=null;if(body.bikeId!=null&&body.bikeId!==''){bikeId=Number(body.bikeId);if(!Number.isSafeInteger(bikeId)||!db.prepare('SELECT id FROM bikes WHERE id=?').get(bikeId))fail('This unit is no longer listed. Refresh and try again.');}
    if(account&&!account.verified)fail('Verify your email before submitting an inquiry while signed in.',403);
    const result=db.prepare('INSERT INTO inquiries(data,owner_id) VALUES(?,?)').run(JSON.stringify({name,phone,message,kind,bikeId}),authenticated?account.id:null);conversations.initial(Number(result.lastInsertRowid),authenticated?account.id:null,message);return reply(res,201,{id:Number(result.lastInsertRowid)});
   }
   if(!authenticated)fail('Please log in.',401);
   if(route==='/api/my-inquiries'&&req.method==='GET')return reply(res,200,db.prepare("SELECT i.*,b.data AS bike_data FROM inquiries i LEFT JOIN bikes b ON b.id=json_extract(i.data,'$.bikeId') WHERE i.owner_id=? ORDER BY i.id DESC").all(account.id).map(r=>({...JSON.parse(r.data),id:r.id,status:r.status,created:r.created,unread:conversations.unread(r.id,account),bikeName:r.bike_data?JSON.parse(r.bike_data).name:null})));
   if(!['admin','staff'].includes(account.role))fail('Garage team access required.',403);
   if(route==='/api/uploads'&&req.method==='POST'){
    limit(req,'upload',120);
    if(typeof body.data!=='string')fail('Choose a PNG, JPEG, or WebP photo.');
    const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.data);
    if(!match)fail('Choose a PNG, JPEG, or WebP photo.');
    const bytes=Buffer.from(match[2],'base64');
    if(bytes.length>8*1024*1024)fail('Each photo must be 8 MB or smaller.',413);
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
    if(!(match[1]==='png'&&png||match[1]==='jpeg'&&jpg||match[1]==='webp'&&webp))fail('The file is not a supported image.');
    let optimized;try{optimized=await require('./compress.cjs').compressImage(bytes);}catch(error){fail(error.code==='IMAGE_TOO_LARGE'?error.message:'This photo could not be decoded. Export it again as PNG, JPEG, or WebP and retry.');}
    const filename=randomBytes(16).toString('hex')+'.webp';
    fs.mkdirSync(path.join(directory,'uploads'),{recursive:true});fs.writeFileSync(path.join(directory,'uploads',filename),optimized,{flag:'wx'});
    return reply(res,201,{image:'uploads/'+filename,originalBytes:bytes.length,bytes:optimized.length});
   }
   if(route==='/api/inquiries'&&req.method==='GET')return reply(res,200,db.prepare('SELECT * FROM inquiries ORDER BY id DESC').all().map(r=>({...JSON.parse(r.data),id:r.id,status:r.status,created:r.created,unread:conversations.unread(r.id,account)})));
   if(/^\/api\/inquiries\/\d+$/.test(route)&&req.method==='PATCH'){
    if(!['new','contacted','closed'].includes(body.status))fail('Invalid status.');if(!db.prepare('UPDATE inquiries SET status=? WHERE id=?').run(body.status,Number(route.split('/').pop())).changes)fail('Inquiry not found.',404);return reply(res,200,{ok:true});
   }
   if((route==='/api/bikes'&&req.method==='POST')||(/^\/api\/bikes\/\d+$/.test(route)&&req.method==='PUT')){
    const number=(key,min,max)=>{if(['year','mileage'].includes(key)&&(body[key]===''||body[key]==null))return null;const n=Number(body[key]);if(body[key]===''||body[key]==null||!Number.isFinite(n)||n<min||n>max)fail('Invalid '+key+'.');return n;};
    const bike={name:text(body.name,100),brand:text(body.brand,60),type:text(body.type,60),year:number('year',1900,new Date().getFullYear()+1),price:number('price',0,100000000),mileage:number('mileage',0,10000000),status:text(body.status,20),description:text(body.description,3000)};
    if(!bike.name||!bike.brand||!bike.type||(bike.year!==null&&!Number.isInteger(bike.year))||!['available','reserved','sold'].includes(bike.status))fail('Complete all unit details.');
    const existing=req.method==='PUT'?db.prepare('SELECT data FROM bikes WHERE id=?').get(Number(route.split('/').pop())):null;
    const prior=existing?JSON.parse(existing.data):{};
    const images=body.images===undefined?(prior.images|| (prior.image?[prior.image]:[])):body.images;
    if(!Array.isArray(images)||images.length>12||new Set(images).size!==images.length)fail('Use up to 12 unique photos.');
    for(const image of images){
     if(typeof image!=='string')fail('Invalid photo.');
     const asset=/^assets\/[a-z0-9-]+\.(png|jpg|webp)$/.test(image),upload=/^uploads\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(image);
     const file=asset?path.join(__dirname,image):upload?path.join(directory,image):null;
     if(!file||!fs.existsSync(file))fail('Photo not found. Upload it again.');
    }
    bike.images=images;bike.image=images[0]||null;
    let id;if(req.method==='POST')id=Number(db.prepare('INSERT INTO bikes(data) VALUES(?)').run(JSON.stringify(bike)).lastInsertRowid);
    else{id=Number(route.split('/').pop());if(!db.prepare('UPDATE bikes SET data=? WHERE id=?').run(JSON.stringify(bike),id).changes)fail('Unit not found.',404);}
    return reply(res,req.method==='POST'?201:200,{...bike,id});
   }
   fail('Not found.',404);
  }catch(e){if(!e.status)console.error(e);reply(res,e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});}
 };
 api.setupCode=setupCode;api.hasAdmin=accounts.hasAdmin;api.startBackups=()=>backups.start();api.close=()=>{backups.stop();db.close();};return api;
}
module.exports={createApi};
