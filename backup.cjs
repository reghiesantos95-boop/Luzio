const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {backup,DatabaseSync}=require('node:sqlite');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function verifyBackup(folder){
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.files))throw Error('Invalid backup manifest');
 for(const entry of manifest.files){const target=path.resolve(folder,entry.path);if(!target.startsWith(path.resolve(folder)+path.sep)||!fs.existsSync(target)||digest(target)!==entry.sha256)throw Error('Backup verification failed: '+entry.path);}
 const snapshot=new DatabaseSync(path.join(folder,'luzio.sqlite'),{readOnly:true});try{if(snapshot.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Database integrity check failed');}finally{snapshot.close();}
 return manifest;
}
function createBackups(db,directory,{assetsDirectory=path.join(__dirname,'assets')}={}){
 const root=path.join(directory,'backups');let running=null,timer=null,lastError=null;
 function list(){if(!fs.existsSync(root))return [];return fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^snapshot-[\w-]+$/.test(e.name)&&fs.existsSync(path.join(root,e.name,'manifest.json'))).map(e=>{try{const m=JSON.parse(fs.readFileSync(path.join(root,e.name,'manifest.json'),'utf8'));return {name:e.name,created:m.created,files:m.files.length,bytes:m.files.reduce((n,f)=>n+f.bytes,0)};}catch{return null;}}).filter(Boolean).sort((a,b)=>b.created.localeCompare(a.created));}
 function status(){const items=list();return {running:!!running,lastError,last:items[0]||null,count:items.length,intervalHours:24,location:root};}
 async function copyTree(source,target,relative,files){
  if(!fs.existsSync(source))return;
  fs.mkdirSync(target,{recursive:true});
  for(const entry of fs.readdirSync(source,{withFileTypes:true})){if(entry.isDirectory())await copyTree(path.join(source,entry.name),path.join(target,entry.name),relative+'/'+entry.name,files);else if(entry.isFile()){const dest=path.join(target,entry.name);fs.copyFileSync(path.join(source,entry.name),dest);files.push({path:relative+'/'+entry.name,sha256:digest(dest),bytes:fs.statSync(dest).size});}}
 }
 function run(){
  if(running)return running;
  running=(async()=>{
   fs.mkdirSync(root,{recursive:true});const name='snapshot-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'),partial=path.join(root,name+'.partial'),final=path.join(root,name);fs.mkdirSync(partial);
   await backup(db,path.join(partial,'luzio.sqlite'));
   const files=[{path:'luzio.sqlite',sha256:digest(path.join(partial,'luzio.sqlite')),bytes:fs.statSync(path.join(partial,'luzio.sqlite')).size}];
   await copyTree(path.join(directory,'uploads'),path.join(partial,'uploads'),'uploads',files);await copyTree(assetsDirectory,path.join(partial,'assets'),'assets',files);
   fs.writeFileSync(path.join(partial,'manifest.json'),JSON.stringify({version:1,created:new Date().toISOString(),files},null,2));verifyBackup(partial);fs.renameSync(partial,final);lastError=null;return {name,files:files.length};
  })().catch(e=>{lastError='Backup failed. Check disk space and server logs.';console.error('Luzio backup failed:',e.message);throw e;}).finally(()=>{running=null;});return running;
 }
 function check(){const latest=list()[0];if(!latest||Date.now()-Date.parse(latest.created)>=86400000)return run();return Promise.resolve();}
 function start(){check().catch(()=>{});timer=setInterval(()=>check().catch(()=>{}),3600000);timer.unref();}
 return {run,status,start,stop(){if(timer)clearInterval(timer);},verify:verifyBackup};
}
module.exports={createBackups,verifyBackup};
