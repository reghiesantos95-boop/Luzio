function createConversations(db,{fail,reply,limit}){
 db.exec(`CREATE TABLE IF NOT EXISTS inquiry_messages(id INTEGER PRIMARY KEY,inquiry_id INTEGER NOT NULL,sender_id INTEGER,sender_role TEXT NOT NULL,message TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS inquiry_messages_thread ON inquiry_messages(inquiry_id,id);
 CREATE TABLE IF NOT EXISTS inquiry_reads(inquiry_id INTEGER NOT NULL,user_id INTEGER NOT NULL,last_id INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(inquiry_id,user_id));`);
 // Existing inquiries keep their original message as the beginning of the thread.
 const seed=db.prepare("INSERT INTO inquiry_messages(inquiry_id,sender_id,sender_role,message,created) SELECT id,owner_id,CASE WHEN owner_id IS NULL THEN 'guest' ELSE 'client' END,json_extract(data,'$.message'),created FROM inquiries WHERE NOT EXISTS(SELECT 1 FROM inquiry_messages m WHERE m.inquiry_id=inquiries.id)");
 seed.run();
 const team=u=>u&&['admin','staff'].includes(u.role);
 function unread(id,user){return Number(db.prepare(`SELECT COUNT(*) AS total FROM inquiry_messages WHERE inquiry_id=? AND id>COALESCE((SELECT last_id FROM inquiry_reads WHERE inquiry_id=? AND user_id=?),0) AND ${team(user)?"sender_role IN ('client','guest')":"sender_role IN ('admin','staff')"}`).get(id,id,user.id).total);}
 function authorize(id,user){
  if(!user||!user.verified)fail('Please sign in to open conversations.',401);
  const row=db.prepare('SELECT * FROM inquiries WHERE id=?').get(id);
  if(!row||(!team(user)&&row.owner_id!==user.id))fail('Conversation not found.',404);
  return row;
 }
 function markRead(id,user,last){db.prepare('INSERT INTO inquiry_reads VALUES(?,?,?) ON CONFLICT(inquiry_id,user_id) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)').run(id,user.id,last);}
 function initial(id,owner,message){db.prepare('INSERT INTO inquiry_messages(inquiry_id,sender_id,sender_role,message) VALUES(?,?,?,?)').run(id,owner,owner?'client':'guest',message);}
 async function handle(req,res,route,body,user){
  if(route==='/api/unread'&&req.method==='GET'){
   if(!user||!user.verified)fail('Please log in.',401);
   const rows=team(user)?db.prepare('SELECT id FROM inquiries').all():db.prepare('SELECT id FROM inquiries WHERE owner_id=?').all(user.id);
   reply(res,200,{total:rows.reduce((sum,r)=>sum+unread(r.id,user),0)});return true;
  }
  const match=/^\/api\/inquiries\/(\d+)\/(messages|read)$/.exec(route);if(!match)return false;
  const id=Number(match[1]),row=authorize(id,user);
  if(match[2]==='messages'&&req.method==='GET'){
   const messages=db.prepare('SELECT m.*,u.name FROM inquiry_messages m LEFT JOIN users u ON u.id=m.sender_id WHERE inquiry_id=? ORDER BY m.id').all(id).map(m=>({id:m.id,message:m.message,created:m.created,name:m.name||(m.sender_role==='guest'?JSON.parse(row.data).name:'Garage team'),role:m.sender_role,mine:m.sender_id===user.id}));
   reply(res,200,{id,status:row.status,canReply:row.owner_id!==null,messages,lastId:messages.at(-1)?.id||0});return true;
  }
  if(match[2]==='read'&&req.method==='POST'){
   const last=Number(body.lastId);if(!Number.isSafeInteger(last)||last<0||last>0&&!db.prepare('SELECT id FROM inquiry_messages WHERE id=? AND inquiry_id=?').get(last,id))fail('Invalid read position.');
   markRead(id,user,last);reply(res,200,{ok:true});return true;
  }
  if(match[2]==='messages'&&req.method==='POST'){
   limit(req,'conversation-reply',60);if(row.owner_id===null)fail('This is a guest inquiry. Follow up using their phone number.');
   const message=typeof body.message==='string'?body.message.trim():'';if(!message||message.length>3000)fail('Write a message with 1–3000 characters.');
   const result=db.prepare('INSERT INTO inquiry_messages(inquiry_id,sender_id,sender_role,message) VALUES(?,?,?,?)').run(id,user.id,user.role,message);markRead(id,user,Number(result.lastInsertRowid));
   if(team(user)&&row.status==='new')db.prepare("UPDATE inquiries SET status='contacted' WHERE id=?").run(id);
   reply(res,201,{id:Number(result.lastInsertRowid)});return true;
  }
  fail('Not found.',404);
 }
 return {handle,unread,initial};
}
module.exports={createConversations};
