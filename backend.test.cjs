const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApi}=require('./backend.cjs');
test('inventory, authentication, inquiries, validation, and restart persistence',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'luzio-test-'));
 let api=createApi(directory),cookie='';
 const request=async(route,method='GET',body,headers={})=>{
  const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);
  Object.assign(req,{method,headers:{host:'localhost','content-type':'application/json',cookie,...headers},socket:{remoteAddress:'127.0.0.1'}});
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,h){this.status=status;Object.assign(this.headers,h);},end(data){this.data=JSON.parse(data);}};
  await api(req,res,'/api/'+route);return res;
 };
 try{
  assert.equal((await request('session')).data.needsSetup,true);
  assert.equal((await request('bikes','POST',{})).status,401);
  assert.equal((await request('inquiries')).status,401);
  assert.equal((await request('setup','POST',{code:'wrong',password:'long password test'})).status,403);
  assert.equal((await request('setup','POST',{code:api.setupCode,password:'short'})).status,400);
  assert.equal((await request('setup','POST',{code:api.setupCode,password:'long password test'})).status,201);
  assert.equal((await request('setup','POST',{})).status,409);
  assert.equal((await request('login','POST',{password:'wrong'})).status,401);
  const login=await request('login','POST',{password:'long password test'});assert.equal(login.status,200);
  assert.match(login.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);cookie=login.headers['Set-Cookie'].split(';')[0];
  assert.equal((await request('session')).data.authenticated,true);
  const bike={name:'Test Motorcycle',brand:'Test',type:'Naked',year:2024,price:150000,mileage:1000,status:'available',description:'Test only'};
  assert.equal((await request('bikes','POST',{...bike,price:-1})).status,400);
  assert.equal((await request('bikes','POST',bike,{origin:'https://other.example'})).status,403);
  const added=await request('bikes','POST',bike);assert.equal(added.status,201);const id=added.data.id;
  assert.equal((await request('bikes')).data.length,1);
  assert.equal((await request('bikes/'+id,'PUT',{...bike,status:'sold'})).status,200);
  const inquiry={name:'Test Person',phone:'09273046604',message:'Is this unit available?',kind:'unit',bikeId:id};
  assert.equal((await request('inquiries','POST',{...inquiry,phone:'abc'})).status,400);
  assert.equal((await request('inquiries','POST',{...inquiry,bikeId:999})).status,400);
  const received=await request('inquiries','POST',inquiry);assert.equal(received.status,201);
  assert.equal((await request('inquiries')).data[0].name,'Test Person');
  assert.equal((await request('inquiries/'+received.data.id,'PATCH',{status:'contacted'})).status,200);
  assert.equal((await request('inquiries/'+received.data.id,'PATCH',{status:'invalid'})).status,400);
  await request('logout','POST',{});assert.equal((await request('session')).data.authenticated,false);
  assert.equal((await request('bikes/'+id,'PUT',bike)).status,401);
  api.close();api=createApi(directory);assert.equal(api.hasAdmin(),true);
  assert.equal((await request('bikes')).data[0].status,'sold');
  await request('login','POST',{password:'long password test'}).then(r=>cookie=r.headers['Set-Cookie'].split(';')[0]);
  assert.equal((await request('inquiries')).data[0].status,'contacted');
 }finally{api.close();assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('luzio-test-'));fs.rmSync(directory,{recursive:true,force:true});}
});
