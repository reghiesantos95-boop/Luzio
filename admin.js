const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let needsSetup=false,units=[],accountSession,authMode='login';
const message=document.querySelector('#admin-message'),editor=document.querySelector('#unit-editor'),unitForm=document.querySelector('#unit-form');
document.querySelector('#auth-panel').innerHTML='<h2 id="auth-title">Sign in</h2><form id="auth-form" class="form-grid"></form><div id="auth-actions" class="actions"></div>';
const emailNotice=document.createElement('p');emailNotice.id='email-notice';emailNotice.setAttribute('role','status');message.after(emailNotice);
const accountPanel=document.createElement('section');accountPanel.id='accounts-panel';accountPanel.className='admin-pane';accountPanel.setAttribute('role','tabpanel');accountPanel.setAttribute('aria-labelledby','tab-accounts');document.querySelector('#dashboard').append(accountPanel);
async function api(route,method='GET',body,requestOptions={}){const response=await fetch('/api/'+route,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),...requestOptions});const data=await response.json();if(!response.ok){if(response.status===401&&route!=='login')showAuth(false);throw Error(data.error||'Request failed.');}return data;}
const emailField='<label>Email address<input name="email" type="email" autocomplete="email" required maxlength="254"></label>';
const nameField='<label>Your name<input name="name" autocomplete="name" required minlength="2" maxlength="100"></label>';
const passwordField=(fresh=false)=>`<label>${fresh?'New password (at least 12 characters)':'Password'}<input name="password" type="password" required minlength="${fresh?12:1}" maxlength="200" autocomplete="${fresh?'new-password':'current-password'}"></label>`;
function setAuthMode(mode){
 authMode=mode;document.querySelector('#auth-panel').hidden=false;document.querySelector('#dashboard').hidden=true;if(backupPanel)backupPanel.hidden=true;
 const form=document.querySelector('#auth-form'),actions=document.querySelector('#auth-actions');
 const titles={setup:'Create your admin account',login:'Sign in to the garage',legacy:'Existing password-only account',forgot:'Reset your password',attach:'Add your account email',pending:'Verify your email',verify:'Confirm your email',reset:'Choose a new password',invite:'Accept your account invitation'};
 document.querySelector('#auth-title').textContent=titles[mode];
 let fields=mode==='setup'?'<label>Setup code from the server terminal<input name="code" required autocomplete="off"></label>'+nameField+emailField+passwordField(true):mode==='login'?emailField+passwordField():mode==='legacy'?passwordField():mode==='forgot'?emailField:mode==='attach'?nameField+emailField:['reset','invite'].includes(mode)?passwordField(true)+`<label>Confirm new password<input name="confirm" type="password" required minlength="12" maxlength="200" autocomplete="new-password"></label>`:mode==='pending'?`<p class="full">A verification link is needed for ${esc(accountSession?.user?.email)}. Check your inbox and spam folder.</p>`:'<p class="full">Confirm that this is your email to activate your Luzio account.</p>';
 const labels={setup:'CREATE ACCOUNT',login:'SIGN IN',legacy:'SIGN IN',forgot:'SEND RESET LINK',attach:'SAVE EMAIL & SEND VERIFICATION',pending:'RESEND VERIFICATION',verify:'VERIFY EMAIL',reset:'SAVE NEW PASSWORD',invite:'SET PASSWORD & ACTIVATE'};
 form.innerHTML=fields+`<div class="full"><button class="button" type="submit">${labels[mode]} →</button></div>`;
 actions.innerHTML='';
 function action(label,next){const button=document.createElement('button');button.className='button';button.type='button';button.textContent=label;button.onclick=()=>{message.textContent='';setAuthMode(next);};actions.append(button);}
 if(mode==='login'){if(!accountSession?.localTesting)action('FORGOT PASSWORD?','forgot');if(accountSession?.legacyAccess)action('USE EXISTING PASSWORD-ONLY ACCOUNT','legacy');}
 if(['forgot','legacy','verify','reset','invite'].includes(mode))action('BACK TO SIGN IN','login');
}
function showAuth(setup){needsSetup=setup;document.querySelector('#logout').hidden=true;setAuthMode(setup?'setup':'login');}
async function init(){
 try{
  if(location.protocol==='file:')throw Error('Run npm start, then open http://127.0.0.1:4174/admin.');
  accountSession=await api('session');
  emailNotice.textContent=accountSession.localTesting?'Local testing: email verification is temporarily skipped. Email invitations and recovery still require SMTP.':accountSession.emailConfigured?'':'Email delivery is not configured yet. Add SMTP settings in the local .env file and restart the server to enable verification, invitations, and password resets.';
  const mode=location.hash.slice(1).split('?')[0];
  if(['verify','reset','invite'].includes(mode)){setAuthMode(mode);return;}
  if(!accountSession.authenticated)return showAuth(accountSession.needsSetup);
  document.querySelector('#logout').hidden=false;
  if(accountSession.user.role==='client'){document.querySelector('#auth-panel').hidden=true;document.querySelector('#dashboard').hidden=true;message.innerHTML='This is a customer account. <a class="text-link" href="/account">OPEN MY ACCOUNT →</a>';return;}
  if(!accountSession.user.email){setAuthMode('attach');return;}
  if(!accountSession.user.verified){setAuthMode('pending');return;}
  document.querySelector('#auth-panel').hidden=true;document.querySelector('#dashboard').hidden=false;
  document.querySelector('h1').textContent=accountSession.user.role==='admin'?'Admin dashboard.':'Staff dashboard.';
  await loadUnits();await loadInbox();
  accountPanel.hidden=accountSession.user.role!=='admin';if(!accountPanel.hidden){await loadAccounts();await loadBackupStatus();}
  document.querySelector('#tab-accounts').hidden=accountSession.user.role!=='admin';document.querySelector('#stat-workspace').textContent=accountSession.user.role==='admin'?'Admin':'Staff';document.querySelector('#admin-signed-in').textContent=accountSession.user.name;selectAdminPane(activeAdminPane);
 }catch(error){message.textContent=error.message;}
}
document.querySelector('#auth-form').onsubmit=async e=>{
 e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;message.textContent='';
 try{
  const body=Object.fromEntries(new FormData(e.target)),token=new URLSearchParams(location.hash.split('?')[1]||'').get('token');
  if(['reset','invite'].includes(authMode)&&body.password!==body.confirm)throw Error('Passwords do not match.');
  if(authMode==='setup'){
   await api('setup','POST',body);await api('login','POST',{email:body.email,password:body.password});await init();message.textContent=accountSession.localTesting?'Account created. You’re signed in.':'Account created. Check your email for the verification link.';
  }else if(['login','legacy'].includes(authMode)){await api('login','POST',body);e.target.reset();await init();}
  else if(authMode==='forgot'){const data=await api('forgot-password','POST',body);message.textContent=data.message;}
  else if(authMode==='attach'){await api('account/email','POST',body);await init();message.textContent=accountSession.localTesting?'Email saved. Your account is ready for local testing.':'Email saved. Check your inbox for the verification link.';}
  else if(authMode==='pending'){await api('verification/resend','POST',{});message.textContent='Verification link sent. Check your inbox.';}
  else if(['verify','reset','invite'].includes(authMode)){
   const mode=authMode;await api(mode==='verify'?'verify':mode==='reset'?'reset-password':'accept-invite','POST',{token,password:body.password});
   history.replaceState(null,'',location.pathname);message.textContent=mode==='verify'?'Email verified. You can now sign in.':'Password saved. Sign in with your email and new password.';await init();
  }
 }catch(error){message.textContent=error.message;if(authMode==='setup'){
   try{const session=await api('session');if(!session.needsSetup){accountSession=session;showAuth(false);message.textContent+=' Your account was saved. Sign in, then resend verification.';}}catch{}
  }else if(authMode==='attach'){await init();}}
 finally{button.disabled=false;}
};
document.querySelector('#logout').onclick=async()=>{try{await api('logout','POST',{});history.replaceState(null,'',location.pathname);message.textContent='Logged out.';await init();}catch(error){message.textContent=error.message;}};
window.addEventListener('hashchange',init);
async function loadAccounts(){
 const accounts=await api('users');if(backupPanel)backupPanel.hidden=false;
 accountPanel.innerHTML=`<div class="section-head"><div><p class="eyebrow">PEOPLE & PERMISSIONS</p><h2>Customer & team accounts.</h2></div><span class="admin-count-pill">${accounts.length} ACCOUNTS</span></div><details class="admin-invite"><summary><span>+ Invite a team member</span><small>Admin or staff access</small></summary><p>Staff can manage motorcycles and inquiries. Only admins can manage accounts.</p><form id="invite-form" class="form-grid">${nameField}${emailField}<label>Role<select name="role"><option value="staff">Staff</option><option value="admin">Admin</option></select></label><div class="full"><button class="button" ${accountSession.emailConfigured?'':'disabled'}>EMAIL INVITATION →</button>${accountSession.emailConfigured?'':'<p>Email invitations will be available when email delivery is configured.</p>'}</div></form></details><div id="account-list">${accounts.map(u=>`<article class="admin-person" data-user="${u.id}"><div class="admin-person-top"><span class="admin-avatar">${esc(u.name.slice(0,1).toUpperCase())}</span><div><h3>${esc(u.name)}</h3><p>${esc(u.email||'Email not linked')}</p></div><span class="admin-role-label">${u.role==='client'?'Customer':esc(u.role)}</span></div><div class="admin-person-controls"><label>Access level<select class="account-role" ${u.id===accountSession.user.id?'disabled':''}><option value="client" ${u.role==='client'?'selected':''}>Customer</option><option value="staff" ${u.role==='staff'?'selected':''}>Staff</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select></label><label class="consent"><input class="account-active" type="checkbox" ${u.active?'checked':''} ${u.id===accountSession.user.id?'disabled':''}> Active</label></div><div class="admin-person-footer"><span>${u.id===accountSession.user.id?'YOUR ACCOUNT':u.verified?'EMAIL VERIFIED':accountSession.localTesting?'LOCAL TEST ACCESS':'EMAIL PENDING'}</span><button class="button account-save" ${u.id===accountSession.user.id?'disabled':''}>SAVE ACCESS</button>${!u.verified&&u.active&&u.id!==accountSession.user.id&&accountSession.emailConfigured?'<button class="button account-resend">RESEND EMAIL</button>':''}</div></article>`).join('')}</div>`;
 accountPanel.querySelector('#invite-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await api('users','POST',Object.fromEntries(new FormData(e.target)));message.textContent='Invitation emailed.';await loadAccounts();}catch(error){message.textContent=error.message;}finally{b.disabled=false;}};
 accountPanel.querySelectorAll('[data-user]').forEach(row=>{
  row.querySelector('.account-save').onclick=async e=>{e.target.disabled=true;try{await api('users/'+row.dataset.user,'PATCH',{role:row.querySelector('.account-role').value,active:row.querySelector('.account-active').checked});message.textContent='Account access updated. Existing sessions were signed out.';await loadAccounts();}catch(error){message.textContent=error.message;e.target.disabled=false;}};
  row.querySelector('.account-resend')?.addEventListener('click',async e=>{e.target.disabled=true;try{await api('users/'+row.dataset.user+'/invite','POST',{});message.textContent='Invitation resent.';}catch(error){message.textContent=error.message;}finally{e.target.disabled=false;}});
 });
}

const adminMoney=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(n);
const adminPhoto=b=>/^(?:assets\/[a-z0-9-]+|uploads\/[a-f0-9]{32})\.(png|jpg|webp)$/.test(b.image||'')?'<img src="'+esc(b.image)+'" alt="'+esc(b.name)+'" loading="lazy">':'<div class="admin-photo-placeholder"><span>LG</span><small>PHOTO COMING SOON</small></div>';
async function loadUnits(){units=await api('bikes');document.querySelector('#stat-units').textContent=units.length;document.querySelector('#stat-available').textContent=units.filter(b=>b.status==='available').length;document.querySelector('#tab-unit-count').textContent=units.length;renderAdminUnits();}
function renderAdminUnits(){
 const query=document.querySelector('#admin-unit-search').value.trim().toLowerCase(),status=document.querySelector('#admin-unit-status').value;
 const list=units.filter(b=>(!status||b.status===status)&&(b.name+' '+b.brand).toLowerCase().includes(query));document.querySelector('#admin-unit-count').textContent=list.length+' of '+units.length+' motorcycles';
 const box=document.querySelector('#admin-units');box.innerHTML=list.length?list.map(b=>`<article class="admin-motorcycle"><div class="admin-motorcycle-photo">${adminPhoto(b)}<span class="showroom-status" data-status="${esc(b.status)}"><i></i>${esc(b.status)}</span><span class="admin-unit-id">UNIT #${String(b.id).padStart(3,'0')}</span></div><div class="admin-motorcycle-body"><div class="admin-motorcycle-brand">${esc(b.brand)} <span>${esc(b.type)}</span></div><h3>${esc(b.name)}</h3><strong class="admin-price">${adminMoney(b.price)}</strong><dl><div><dt>MODEL YEAR</dt><dd>${b.year||'Not specified'}</dd></div><div><dt>MILEAGE</dt><dd>${b.mileage==null?'Not specified':Number(b.mileage).toLocaleString()+' km'}</dd></div></dl><div class="admin-motorcycle-actions"><button class="button" data-edit="${b.id}">EDIT MOTORCYCLE <span>↗</span></button><a href="/#inventory" target="_blank" rel="noopener" aria-label="View ${esc(b.name)} in showroom">↗</a></div></div></article>`).join(''):'<div class="admin-empty"><span>◇</span><h3>'+ (units.length?'No motorcycles match.':'Build your showroom.')+'</h3><p>'+(units.length?'Try another search or availability filter.':'Add your first motorcycle to start your collection.')+'</p></div>';
 box.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>openEditor(units.find(b=>b.id===Number(button.dataset.edit))));
}
document.querySelector('#admin-unit-search').addEventListener('input',renderAdminUnits);document.querySelector('#admin-unit-status').addEventListener('change',renderAdminUnits);
function openEditor(bike){unitForm.reset();setEditorPhotos(bike);document.querySelector('#editor-photo').innerHTML=bike?adminPhoto(bike):'<div class="admin-photo-placeholder"><span>NEW MOTORCYCLE</span><small>Add the details below</small></div>';document.querySelector('#editor-message').textContent='';document.querySelector('#editor-title').textContent=bike?'Edit motorcycle':'Add motorcycle';unitForm.elements.year.max=new Date().getFullYear()+1;for(const key of ['id','name','brand','type','year','price','mileage','status','description'])unitForm.elements[key].value=bike?.[key]??(key==='status'?'available':key==='year'?(bike?'':new Date().getFullYear()):'');editor.showModal();}
document.querySelector('#new-unit').onclick=()=>openEditor();editor.querySelector('.close-dialog').onclick=()=>editor.close();
unitForm.onsubmit=async e=>{e.preventDefault();if(photosBusy)return;const button=unitForm.querySelector('[type=submit]');button.disabled=true;try{const body=Object.fromEntries(new FormData(unitForm));body.images=[...editorPhotos];await api(body.id?'bikes/'+body.id:'bikes',body.id?'PUT':'POST',body);editor.close();message.textContent='Unit saved.';await loadUnits();}catch(error){document.querySelector('#editor-message').textContent=error.message;}finally{button.disabled=false;}};
async function loadInbox(){const inquiries=await api('inquiries'),box=document.querySelector('#inbox');document.querySelector('#stat-inquiries').textContent=inquiries.filter(i=>i.status==='new').length;document.querySelector('#tab-inquiry-count').textContent=inquiries.reduce((n,i)=>n+(i.unread||0),0);box.innerHTML=inquiries.length?inquiries.map(i=>`<article class="inquiry-card"><span class="tag">#${i.id} · ${esc(i.kind.toUpperCase())}</span><h3>${esc(i.name)} ${i.unread?'<span class="unread-badge">'+i.unread+' NEW</span>':''}</h3><a class="text-link" href="tel:${esc(i.phone.replace(/[^+\d]/g,''))}">${esc(i.phone)} ↗</a><p>Unit: ${esc(units.find(b=>b.id===i.bikeId)?.name||'General inquiry')} · ${esc(i.created)} UTC</p><p class="unit-description">${esc(i.message)}</p><button class="button thread-open" data-thread="${i.id}">OPEN CONVERSATION ↗</button><label>Follow-up status<select data-inquiry="${i.id}">${['new','contacted','closed'].map(s=>`<option value="${s}" ${s===i.status?'selected':''}>${s}</option>`).join('')}</select></label></article>`).join(''):'<div class="admin-empty"><span>↗</span><h3>Your inbox is all clear.</h3><p>New customer inquiries will appear here. Follow up and update their status as you go.</p></div>';box.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>LuzioThreads.open(b.dataset.thread,()=>loadInbox().catch(()=>{})));box.querySelectorAll('[data-inquiry]').forEach(select=>{select.dataset.previous=select.value;select.onchange=async()=>{select.disabled=true;try{await api('inquiries/'+select.dataset.inquiry,'PATCH',{status:select.value});select.dataset.previous=select.value;message.textContent='Inquiry status saved.';await loadInbox();}catch(error){select.value=select.dataset.previous;message.textContent=error.message;}finally{select.disabled=false;}};});}
document.querySelector('#refresh-inbox').onclick=async()=>{try{await loadUnits();await loadInbox();message.textContent='Inbox refreshed.';}catch(error){message.textContent=error.message;}};
let activeAdminPane='motorcycles';
function selectAdminPane(name){
 if(name==='accounts'&&accountSession?.user?.role!=='admin')name='motorcycles';activeAdminPane=name;
 document.querySelectorAll('.admin-pane').forEach(p=>p.hidden=p.id!==name+'-panel');
 document.querySelectorAll('.admin-tabs [role=tab]').forEach(t=>{const selected=t.dataset.pane===name;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;});
}
document.querySelectorAll('.admin-tabs [role=tab]').forEach(tab=>{tab.onclick=()=>selectAdminPane(tab.dataset.pane);tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('.admin-tabs [role=tab]')].filter(t=>!t.hidden),index=tabs.indexOf(tab),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();selectAdminPane(tabs[next].dataset.pane);};});
let editorPhotos=[],photosBusy=false,photoGeneration=0;
function setEditorPhotos(bike){photoGeneration++;editorPhotos=[...(bike?.images|| (bike?.image?[bike.image]:[]))];document.querySelector('#photo-upload-status').textContent='';renderEditorPhotos();}
function renderEditorPhotos(){
 const box=document.querySelector('#photo-manager-grid');document.querySelector('#photo-count').textContent=editorPhotos.length+' / 12';
 box.innerHTML=editorPhotos.map((image,index)=>`<article class="photo-manager-card"><div><img src="${esc(image)}" alt="Motorcycle photo ${index+1}"><span>${index===0?'COVER':String(index+1).padStart(2,'0')}</span></div><button type="button" data-cover="${index}" ${index===0||photosBusy?'disabled':''}>${index===0?'✓ Cover photo':'Make cover'}</button><div class="photo-order"><button type="button" data-move="${index}" data-step="-1" aria-label="Move photo ${index+1} earlier" ${index===0||photosBusy?'disabled':''}>←</button><button type="button" data-move="${index}" data-step="1" aria-label="Move photo ${index+1} later" ${index===editorPhotos.length-1||photosBusy?'disabled':''}>→</button><button type="button" data-remove="${index}" aria-label="Remove photo ${index+1}" ${photosBusy?'disabled':''}>Remove</button></div></article>`).join('')||'<p>No photos added yet. You can save the unit without photos.</p>';
 box.querySelectorAll('[data-cover]').forEach(b=>b.onclick=()=>{const [photo]=editorPhotos.splice(Number(b.dataset.cover),1);editorPhotos.unshift(photo);renderEditorPhotos();});
 box.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.move),j=i+Number(b.dataset.step);[editorPhotos[i],editorPhotos[j]]=[editorPhotos[j],editorPhotos[i]];renderEditorPhotos();});
 box.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{editorPhotos.splice(Number(b.dataset.remove),1);renderEditorPhotos();});
 document.querySelector('#editor-photo').innerHTML=editorPhotos.length?'<img src="'+esc(editorPhotos[0])+'" alt="Selected cover photo">':'<div class="admin-photo-placeholder"><span>LG</span><small>NO COVER PHOTO</small></div>';
}
async function readUploadData(file){
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const png=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n),jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 const mime=png?'image/png':jpg?'image/jpeg':webp?'image/webp':null;
 if(!mime)throw Error('Unsupported file. Use PNG, JPEG, or WebP; HEIC/HEIF must be converted first.');
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this photo.'));reader.onabort=()=>reject(Error('Reading photo was cancelled.'));reader.readAsDataURL(file);});
 return 'data:'+mime+';base64,'+String(data).split(',')[1];
}
document.querySelector('#motorcycle-photos').onchange=async e=>{
 const input=e.target,files=[...input.files],status=document.querySelector('#photo-upload-status'),generation=photoGeneration;
 if(!files.length)return;
 photosBusy=true;input.disabled=true;unitForm.querySelector('[type=submit]').disabled=true;renderEditorPhotos();
 let added=0;const errors=[];
 try{
  for(let i=0;i<files.length;i++){
   const file=files[i];
   if(generation!==photoGeneration)break;
   if(editorPhotos.length>=12){errors.push(file.name+': gallery is full (12 photos maximum).');continue;}
   if(file.size>8*1024*1024){errors.push(file.name+': '+(file.size/1024/1024).toFixed(1)+' MB; maximum is 8 MB per photo.');continue;}
   if(!file.size){errors.push(file.name+': this file is empty.');continue;}
   status.textContent='Uploading '+(i+1)+' / '+files.length+': '+file.name;
   let timeout;
   try{
    const data=await readUploadData(file),controller=new AbortController();timeout=setTimeout(()=>controller.abort(),60000);
    const result=await api('uploads','POST',{data},{signal:controller.signal});
    if(generation!==photoGeneration)break;
    editorPhotos.push(result.image);added++;renderEditorPhotos();
   }catch(error){errors.push(file.name+': '+(error.name==='AbortError'?'Upload timed out. Check the server/connection and select this photo again.':error.message));}
   finally{clearTimeout(timeout);}
  }
  status.textContent=(added?added+' photo'+(added===1?'':'s')+' uploaded. Save the motorcycle to apply changes.':'No photos uploaded.')+(errors.length?'\n'+errors.join('\n'):'');
  if(errors.length)status.scrollIntoView({block:'nearest'});
 }finally{photosBusy=false;input.disabled=false;input.value='';unitForm.querySelector('[type=submit]').disabled=false;if(generation===photoGeneration)renderEditorPhotos();}
};
editor.addEventListener('cancel',e=>{if(photosBusy)e.preventDefault();});
const originalCloseEditor=editor.querySelector('.close-dialog').onclick;
editor.querySelector('.close-dialog').onclick=()=>{if(!photosBusy)originalCloseEditor();};

// Admin-only backup controls. Backup files are never served through the website.
let backupPanel;
async function loadBackupStatus(){
 if(accountSession?.user?.role!=='admin')return;
 if(!backupPanel){backupPanel=document.createElement('section');backupPanel.id='backup-panel';backupPanel.className='admin-backup';accountPanel.before(backupPanel);}
 const status=await api('backups');
 backupPanel.innerHTML='<div><p class="eyebrow">DATA PROTECTION</p><h3>Automatic backups</h3><p>'+(status.running?'Creating a verified snapshot…':status.last?'Last backup: '+esc(new Date(status.last.created).toLocaleString())+' · '+status.count+' saved snapshots':'First backup is being prepared.')+'</p><small>Every 24 hours while the server runs. Includes database, uploaded photos, and site assets.</small>'+(status.lastError?'<p role="alert">'+esc(status.lastError)+'</p>':'')+'</div><button class="button" id="backup-now" '+(status.running?'disabled':'')+'>BACK UP NOW ↗</button>';
 backupPanel.querySelector('button').onclick=async e=>{e.target.disabled=true;try{await api('backups','POST',{});message.textContent='Backup created and integrity verified.';await loadBackupStatus();}catch(error){message.textContent=error.message;e.target.disabled=false;}};
}

setInterval(()=>{if(accountSession?.authenticated&&!document.querySelector('#dashboard').hidden&&document.visibilityState==='visible'&&!document.querySelector('#inbox').contains(document.activeElement))loadInbox().catch(()=>{});},15000);
init();


setInterval(()=>{if(backupPanel&&accountSession?.user?.role==='admin'&&!document.querySelector('#dashboard').hidden&&document.visibilityState==='visible')loadBackupStatus().catch(()=>{});},60000);
