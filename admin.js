const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let needsSetup=false,units=[],accountSession,authMode='login';
let adminViewReady=false,restoreAdminViewOnLoad=true,adminScrollTimer;
const adminViewKey='luzio-admin-view-v1';
if('scrollRestoration' in history)history.scrollRestoration='manual';
function readAdminView(){try{return JSON.parse(sessionStorage.getItem(adminViewKey)||'null');}catch{return null;}}
function saveAdminView(){
 if(!adminViewReady||!accountSession?.authenticated)return;
 const filters={};for(const id of ['admin-unit-search','admin-type-filter','admin-unit-status','admin-publication'])filters[id]=document.getElementById(id)?.value||'';
 try{sessionStorage.setItem(adminViewKey,JSON.stringify({userId:accountSession.user.id,pane:activeAdminPane,section:activeSecuritySection,y:window.scrollY,filters}));}catch{}
}
window.addEventListener('pagehide',saveAdminView);
window.addEventListener('scroll',()=>{clearTimeout(adminScrollTimer);adminScrollTimer=setTimeout(saveAdminView,150);},{passive:true});

const message=document.querySelector('#admin-message'),editor=document.querySelector('#unit-editor'),unitForm=document.querySelector('#unit-form');
document.querySelector('#auth-panel').innerHTML='<h2 id="auth-title">Sign in</h2><form id="auth-form" class="form-grid"></form><div id="auth-actions" class="actions"></div>';
const emailNotice=document.createElement('p');emailNotice.id='email-notice';emailNotice.setAttribute('role','status');message.after(emailNotice);
async function api(route,method='GET',body,requestOptions={}){const response=await fetch('/api/'+route,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),...requestOptions});const data=await response.json();if(!response.ok){if(response.status===401&&route!=='login')showAuth(false);throw Error(data.error||'Request failed.');}return data;}
const emailField='<label>Email address<input name="email" type="email" autocomplete="email" required maxlength="254"></label>';
const nameField='<label>Your name<input name="name" autocomplete="name" required minlength="2" maxlength="100"></label>';
const passwordField=(fresh=false)=>`<label>${fresh?'New password (at least 12 characters)':'Password'}<input name="password" type="password" required minlength="${fresh?12:1}" maxlength="200" autocomplete="${fresh?'new-password':'current-password'}"></label>`;
function setAuthMode(mode){
 authMode=mode;document.querySelector('#auth-panel').hidden=false;document.querySelector('#dashboard').hidden=true;
 const form=document.querySelector('#auth-form'),actions=document.querySelector('#auth-actions');
 const titles={setup:'Create your admin account',login:'Sign in to the garage',legacy:'Existing password-only account',forgot:'Reset your password',attach:'Add your account email',pending:'Verify your email',verify:'Confirm your email',reset:'Choose a new password',recover:'Recover your account',code:'Check your email',invite:'Accept your account invitation'};
 document.querySelector('#auth-title').textContent=titles[mode];
 let fields=mode==='recover'?emailField+'<label>Recovery code<input name="code" required autocomplete="off"></label>'+passwordField(true):mode==='code'?'<p class="full">Enter the 6-digit code sent to your admin email. Expires in 10 minutes. To request another code, return to sign in after one minute.</p><label>Sign-in code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>':mode==='setup'?'<label>Setup code from the server terminal<input name="code" required autocomplete="off"></label>'+nameField+emailField+passwordField(true):mode==='login'?(accountSession?.passwordOnlyAdmin?'':emailField)+passwordField():mode==='legacy'?passwordField():mode==='forgot'?emailField:mode==='attach'?nameField+emailField:['reset','invite'].includes(mode)?passwordField(true)+`<label>Confirm new password<input name="confirm" type="password" required minlength="12" maxlength="200" autocomplete="new-password"></label>`:mode==='pending'?`<p class="full">A verification link is needed for ${esc(accountSession?.user?.email)}. Check your inbox and spam folder.</p>`:'<p class="full">Confirm that this is your email to activate your Luzio account.</p>';
 const labels={recover:'RESET PASSWORD & SIGN OUT DEVICES',code:'VERIFY & SIGN IN',setup:'CREATE ACCOUNT',login:'SIGN IN',legacy:'SIGN IN',forgot:'SEND RESET LINK',attach:'SAVE EMAIL & SEND VERIFICATION',pending:'RESEND VERIFICATION',verify:'VERIFY EMAIL',reset:'SAVE NEW PASSWORD',invite:'SET PASSWORD & ACTIVATE'};
 form.innerHTML=fields+`<div class="full"><button class="button" type="submit">${labels[mode]} →</button></div>`;
 actions.innerHTML='';
 function action(label,next){const button=document.createElement('button');button.className='button';button.type='button';button.textContent=label;button.onclick=()=>{message.textContent='';setAuthMode(next);};actions.append(button);}
 if(mode==='login')action('USE A RECOVERY CODE','recover');
 if(mode==='login'&&!accountSession?.passwordOnlyAdmin){if(!accountSession?.localTesting)action('FORGOT PASSWORD?','forgot');}
 if(['recover','code','forgot','legacy','verify','reset','invite'].includes(mode))action('BACK TO SIGN IN','login');
}
function showAuth(setup){adminViewReady=false;needsSetup=setup;document.querySelector('#logout').hidden=true;setAuthMode(setup?'setup':'login');}
async function init(){
 try{
  if(location.protocol==='file:')throw Error('Run npm start, then open http://127.0.0.1:4174/admin.');
  accountSession=await api('session');
  emailNotice.textContent=accountSession.passwordOnlyAdmin?'Testing mode: sign in with your admin password. Email is not required.':accountSession.localTesting?'Sign in with your admin email and password. Email codes are not enabled in this draft yet.':accountSession.emailConfigured?'':'Email delivery is not configured. Email codes and email password resets are unavailable. Saved recovery codes can still be used.';
  const mode=location.hash.slice(1).split('?')[0];
  if(['verify','reset','invite'].includes(mode)){setAuthMode(mode);return;}
  if(!accountSession.authenticated)return showAuth(accountSession.needsSetup);
  document.querySelector('#logout').hidden=false;
  if(!accountSession.user.email){setAuthMode('attach');return;}
  if(!accountSession.user.verified){setAuthMode('pending');return;}
  document.querySelector('#auth-panel').hidden=true;document.querySelector('#dashboard').hidden=false;
  document.querySelector('h1').textContent=accountSession.user.superAdmin?'Super Admin dashboard.':'Admin dashboard.';document.querySelector('#tab-security').textContent=accountSession.user.superAdmin?'Accounts & Security':'My Security';
  const saved=restoreAdminViewOnLoad?readAdminView():null,restore=saved?.userId===accountSession.user.id?saved:null;
  if(restore){activeAdminPane=restore.pane;activeSecuritySection=restore.section;}
  await loadUnits();
  if(restore?.filters){for(const id of ['admin-unit-search','admin-type-filter','admin-unit-status','admin-publication']){const field=document.getElementById(id);if(field&&typeof restore.filters[id]==='string')field.value=restore.filters[id];}renderAdminUnits();}
  document.querySelector('#admin-signed-in').textContent=accountSession.user.name;await selectAdminPane(activeAdminPane);
  if(restore){await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.scrollTo({top:Math.max(0,Math.min(Number(restore.y)||0,document.documentElement.scrollHeight-innerHeight)),behavior:'instant'});}
  restoreAdminViewOnLoad=false;adminViewReady=true;saveAdminView();
 }catch(error){message.textContent=error.message;}
}
document.querySelector('#auth-form').onsubmit=async e=>{
 e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;message.textContent='';
 try{
  const body=Object.fromEntries(new FormData(e.target)),token=new URLSearchParams(location.hash.split('?')[1]||'').get('token');
  if(['reset','invite'].includes(authMode)&&body.password!==body.confirm)throw Error('Passwords do not match.');
  if(authMode==='setup'){
   await api('setup','POST',body);const login=await api('login','POST',{email:body.email,password:body.password});if(login.verificationRequired){setAuthMode('code');return;}await init();message.textContent=accountSession.localTesting?'Account created. You’re signed in.':'Account created. Check your email for the verification link.';
  }else if(['login','legacy'].includes(authMode)){const login=await api('login','POST',body);e.target.reset();if(login.verificationRequired){setAuthMode('code');message.textContent='Code sent to '+login.maskedEmail;return;}await init();}
  else if(authMode==='recover'){await api('security/recover','POST',{email:body.email,code:body.code,newPassword:body.password});setAuthMode('login');message.textContent='Password reset. All devices have been signed out. Sign in with your new password.';}
  else if(authMode==='code'){await api('login/verify','POST',body);await init();}
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
document.querySelector('#logout').onclick=async()=>{try{await api('logout','POST',{});adminViewReady=false;try{sessionStorage.removeItem(adminViewKey);}catch{}history.replaceState(null,'',location.pathname);message.textContent='Logged out.';await init();}catch(error){message.textContent=error.message;}};
window.addEventListener('hashchange',init);
const adminMoney=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(n);
const adminPhoto=b=>/^(?:assets\/[a-z0-9-]+|uploads\/[a-f0-9]{32})\.(png|jpg|webp)$/.test(b.image||'')?'<img src="'+esc(b.image)+'" alt="'+esc(b.name)+'" loading="lazy">':'<div class="admin-photo-placeholder"><span>LG</span><small>PHOTO COMING SOON</small></div>';
async function loadUnits(){units=await api('admin/bikes');const typeSelect=document.querySelector('#admin-type-filter'),oldType=typeSelect.value;typeSelect.innerHTML='<option value="">All types</option>'+[...new Set(units.map(b=>b.type.toLowerCase()))].sort().map(t=>'<option value="'+esc(t)+'">'+esc(t[0].toUpperCase()+t.slice(1))+'</option>').join('');typeSelect.value=oldType;renderAdminUnits();if(accountSession?.user?.role==='admin')await loadDeletedUnits();else if(deletedPanel)deletedPanel.hidden=true;}
function renderAdminUnits(){
 const query=document.querySelector('#admin-unit-search').value.trim().toLowerCase(),status=document.querySelector('#admin-unit-status').value;
 const type=document.querySelector('#admin-type-filter').value;const visibility=document.querySelector('#admin-publication').value;const list=units.filter(b=>(!type||b.type.toLowerCase()===type)&&(!visibility||b.publication===visibility)&&(!status||b.status===status)&&(b.name+' '+b.brand).toLowerCase().includes(query));document.querySelector('#admin-unit-count').textContent=list.length+' of '+units.length+' motorcycles';
 const box=document.querySelector('#admin-units');box.innerHTML=list.length?list.map(b=>`<article class="admin-motorcycle"><div class="admin-motorcycle-photo">${adminPhoto(b)}<span class="showroom-status" data-status="${esc(b.status)}"><i></i>${esc(b.status)}</span><span class="publication-badge">${b.publication==='draft'?'DRAFT · HIDDEN':'PUBLISHED'}</span><span class="admin-unit-id">UNIT #${String(b.id).padStart(3,'0')}</span></div><div class="admin-motorcycle-body"><div class="admin-motorcycle-brand">${esc(b.brand)} <span>${esc(b.type)}</span></div><h3>${esc(b.name)}</h3><strong class="admin-price">${adminMoney(b.price)}</strong><dl><div><dt>MODEL YEAR</dt><dd>${b.year||'Not specified'}</dd></div><div><dt>MILEAGE</dt><dd>${b.mileage==null?'Not specified':Number(b.mileage).toLocaleString()+' km'}</dd></div></dl><div class="admin-motorcycle-actions"><button class="button" data-edit="${b.id}">EDIT MOTORCYCLE <span>↗</span></button><a href="/#inventory" target="_blank" rel="noopener" aria-label="View ${esc(b.name)} in showroom">↗</a></div>${accountSession?.user?.role==='admin'?'<button type="button" class="admin-delete-unit" data-delete="'+b.id+'">DELETE UNIT</button>':''}</div></article>`).join(''):'<div class="admin-empty"><span>◇</span><h3>'+ (units.length?'No motorcycles match.':'Build your showroom.')+'</h3><p>'+(units.length?'Try another search or availability filter.':'Add your first motorcycle to start your collection.')+'</p></div>';
 box.querySelectorAll('[data-delete]').forEach(button=>button.onclick=()=>confirmUnitDelete(units.find(b=>b.id===Number(button.dataset.delete))));
 box.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>openEditor(units.find(b=>b.id===Number(button.dataset.edit))));
}
document.querySelector('#admin-type-filter').addEventListener('change',renderAdminUnits);document.querySelector('#admin-unit-search').addEventListener('input',renderAdminUnits);document.querySelector('#admin-unit-status').addEventListener('change',renderAdminUnits);document.querySelector('#admin-publication').addEventListener('change',renderAdminUnits);
function openEditor(bike){unitForm.reset();setEditorPhotos(bike);document.querySelector('#editor-photo').innerHTML=bike?adminPhoto(bike):'<div class="admin-photo-placeholder"><span>NEW MOTORCYCLE</span><small>Add the details below</small></div>';document.querySelector('#editor-message').textContent='';document.querySelector('#editor-title').textContent=bike?'Edit motorcycle':'Add motorcycle';unitForm.elements.year.max=new Date().getFullYear()+1;for(const key of ['id','name','brand','type','year','price','mileage','status','description','publication','engineCc','transmission','papers','ownership','modifications'])unitForm.elements[key].value=bike?.[key]??(key==='status'?'available':key==='publication'?(bike?'published':'draft'):key==='year'?(bike?'':new Date().getFullYear()):'');editor.showModal();}
document.querySelector('#new-unit').onclick=()=>openEditor();editor.querySelector('.close-dialog').onclick=()=>editor.close();
unitForm.onsubmit=async e=>{e.preventDefault();if(photosBusy)return;const button=unitForm.querySelector('[type=submit]');button.disabled=true;try{const body=Object.fromEntries(new FormData(unitForm));body.images=[...editorPhotos];await api(body.id?'bikes/'+body.id:'bikes',body.id?'PUT':'POST',body);editor.close();message.textContent=body.publication==='draft'?'Draft saved. Hidden from the public showroom.':'Motorcycle published to the showroom.';await loadUnits();}catch(error){document.querySelector('#editor-message').textContent=error.message;}finally{button.disabled=false;}};
let activeAdminPane='motorcycles';
async function selectAdminPane(name){
 if(!['motorcycles','admins','activity','security'].includes(name))name='motorcycles';if(name==='admins')name='security';activeAdminPane=name;if(name==='security')await loadSecurity().catch(e=>message.textContent=e.message);if(name==='admins')await loadAdminEmails().catch(e=>message.textContent=e.message);if(name==='activity')await loadActivity().catch(e=>message.textContent=e.message);
 document.querySelectorAll('.admin-pane').forEach(p=>p.hidden=p.id!==name+'-panel');
 document.querySelectorAll('.admin-tabs [role=tab]').forEach(t=>{const selected=t.dataset.pane===name;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;});
 saveAdminView();
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

const activityPanel=document.createElement('section');activityPanel.id='activity-panel';activityPanel.className='admin-pane';activityPanel.hidden=true;activityPanel.setAttribute('role','tabpanel');activityPanel.setAttribute('aria-labelledby','tab-activity');document.querySelector('#dashboard').append(activityPanel);
async function loadActivity(){const rows=await api('activity');activityPanel.innerHTML='<div class="section-head"><div><p class="eyebrow">WORKSPACE HISTORY</p><h2>Listing activity.</h2></div><button class="button" id="activity-refresh">REFRESH ↻</button></div><p>Latest 100 listing changes. Records show who changed each field and when.</p>'+ (rows.length?rows.map(r=>'<article class="activity-entry"><div><span class="admin-role-label">'+esc(r.action)+'</span><h3>'+esc(r.unit_name)+'</h3><p>'+esc(r.actor_name)+' · '+esc(new Date(r.created.replace(' ','T')+'Z').toLocaleString())+'</p></div><details><summary>'+Object.keys(r.changes).length+' changed fields</summary>'+Object.entries(r.changes).map(([key,c])=>'<div class="activity-change"><strong>'+esc(key)+'</strong><span>'+esc(c.before==null?'—':typeof c.before==='object'?JSON.stringify(c.before):c.before)+'</span><span>→</span><span>'+esc(c.after==null?'—':typeof c.after==='object'?JSON.stringify(c.after):c.after)+'</span></div>').join('')+'</details></article>').join(''):'<div class="admin-empty"><h3>No listing changes recorded yet.</h3><p>New edits will appear here. Existing listings are preserved.</p></div>');activityPanel.querySelector('#activity-refresh').onclick=()=>loadActivity().catch(e=>message.textContent=e.message);}
let deletedPanel;
const deleteDialog=document.createElement('dialog');deleteDialog.className='unit-delete-dialog';deleteDialog.setAttribute('aria-labelledby','delete-unit-title');document.body.append(deleteDialog);
function confirmUnitDelete(bike){
 if(!bike)return;
 deleteDialog.innerHTML='<h2 id="delete-unit-title">Delete this motorcycle?</h2><p><strong>'+esc(bike.name)+'</strong> will be removed from the showroom and active inventory. You can restore the unit from Deleted units.</p><form><label>Type DELETE to confirm<input name="confirmation" required pattern="DELETE" autocomplete="off" placeholder="DELETE"></label><p class="delete-error" role="status"></p><div class="actions"><button type="button" class="button delete-cancel">CANCEL</button><button type="submit" class="button delete-confirm">DELETE UNIT</button></div></form>';
 const form=deleteDialog.querySelector('form');deleteDialog.querySelector('.delete-cancel').onclick=()=>deleteDialog.close();
 form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{await api('bikes/'+bike.id,'DELETE',{confirmName:bike.name});deleteDialog.close();message.textContent=bike.name+' deleted. You can restore it below.';await loadUnits();}catch(error){form.querySelector('.delete-error').textContent=error.message;}finally{button.disabled=false;}};
 deleteDialog.showModal();
}
async function loadDeletedUnits(){
 if(accountSession?.user?.role!=='admin')return;
 if(!deletedPanel){deletedPanel=document.createElement('details');deletedPanel.className='deleted-units';document.querySelector('#motorcycles-panel').append(deletedPanel);}
 deletedPanel.hidden=false;const rows=await api('admin/deleted-bikes');
 deletedPanel.innerHTML='<summary>Deleted units ('+rows.length+')</summary>'+(rows.length?rows.map(b=>'<article class="deleted-unit-row"><div><h3>'+esc(b.name)+'</h3><p>Deleted '+esc(new Date(b.deletedAt).toLocaleString())+'</p></div><button class="button" data-restore="'+b.id+'">RESTORE ↗</button></article>').join(''):'<p>No deleted motorcycles.</p>');
 deletedPanel.querySelectorAll('[data-restore]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api('bikes/'+button.dataset.restore+'/restore','POST',{});message.textContent='Motorcycle restored.';await loadUnits();}catch(error){message.textContent=error.message;button.disabled=false;}});
}

init();



document.querySelector('#check-upload-service').onclick=async e=>{const b=e.target,status=document.querySelector('#photo-upload-status');b.disabled=true;status.textContent='Checking server image processor…';try{const h=await api('upload-health');status.textContent='Image processor OK · sharp '+h.sharp+' · Node '+h.node+' · '+h.platform+'/'+h.arch+' · Max '+h.maxMegapixels+' MP. If a file still fails, send its upload reference and the original photo.';}catch(error){status.textContent=error.message;}finally{b.disabled=false;}};

async function loadAdminEmails(){
 const panel=document.querySelector('#admins-panel'),admins=await api('admin-accounts');
 panel.innerHTML='<div class="section-head"><div><p class="eyebrow">ADMIN ACCESS</p><h2>Admin emails.</h2></div></div><p>Only Super Admins can view this list and add another admin. New admins choose their own password using an activation link.</p><form id="add-admin-form" class="form-grid admin-email-form">'+nameField.replace('Your name','Admin name')+emailField+'<label>Account access<select name="role" id="new-admin-role"><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select></label><label id="new-super-confirm" hidden>Your current password<input name="password" type="password" autocomplete="current-password"></label><p class="full">The recipient signs up through the activation link and creates their own password. Super Admins can manage accounts and logged-in devices.</p><div class="full"><button type="submit" class="button">INVITE ACCOUNT →</button><p id="admin-invite-result" role="status"></p></div></form><div class="admin-email-list">'+admins.map(u=>'<article class="admin-email-card"><div><h3>'+esc(u.name)+'</h3><p>'+esc(u.email||'Email not linked')+'</p><small>'+ (u.superAdmin?'SUPER ADMIN':'ADMIN')+'</small></div><span>'+ (u.id===accountSession.user.id?'YOUR ACCOUNT':u.pending?'AWAITING ACTIVATION':u.active?'ACTIVE ADMIN':'INACTIVE')+'</span></article>').join('')+'</div>';
 if(panel.closest('[data-security-section]')){panel.querySelector('.admin-email-list').remove();panel.querySelector('h2').textContent='Invite an account';}
 panel.querySelector('#new-admin-role').onchange=event=>{const label=panel.querySelector('#new-super-confirm');label.hidden=event.target.value!=='super_admin';label.querySelector('input').required=!label.hidden;};
 panel.querySelector('form').onsubmit=async event=>{
  event.preventDefault();const button=event.target.querySelector('button'),result=panel.querySelector('#admin-invite-result');button.disabled=true;result.textContent='Adding admin…';
  try{
   const added=await api('admin-accounts','POST',Object.fromEntries(new FormData(event.target)));if(panel.closest('[data-security-section]'))await loadSecurity();else await loadAdminEmails();
   const updated=panel.querySelector('#admin-invite-result');
   if(added.activationPath){updated.textContent='Admin added. Testing activation link (expires in 30 minutes): ';const link=document.createElement('a');link.href=added.activationPath;link.textContent='Set up this admin account ↗';link.className='text-link';updated.append(link);}
   else updated.textContent='Admin added. An activation email has been sent.';
  }catch(error){result.textContent=error.message;button.disabled=false;}
 };
}

function securityDeviceCard(d){
 const mobile=/iOS|Android/i.test(d.device),icon=mobile?'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>':'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>';
 return `<article class="security-card security-device-card${d.current?' is-current-device':''}"><div class="security-account-header"><span class="security-avatar" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">${icon}</svg></span><div class="security-account-identity"><h3>${esc(d.device)}</h3><p>${esc(d.name)}</p></div></div><div class="security-account-badges"><span class="security-status-badge" data-active="true"><i></i>Active session</span>${d.current?'<span class="security-role-badge" data-elevated="true">This device</span>':''}</div><p class="security-device-email">${esc(d.email||'Email not linked')}</p><dl class="security-device-details"><div><dt>IP address</dt><dd>${esc(d.ip||'Unavailable')}</dd></div><div><dt>Last active</dt><dd>${d.lastSeen?esc(new Date(d.lastSeen).toLocaleString()):'Unavailable for older session'}</dd></div></dl><div class="security-device-actions"><button class="button" type="button" data-revoke="${esc(d.id)}">LOG OUT DEVICE ↗</button><button class="security-logout-all" type="button" data-revoke-all="${d.userId}">Log out all devices for this admin</button></div><p class="security-account-feedback" role="status"></p></article>`;
}
function securityAccountCard(u){
 const own=u.id===accountSession.user.id,role=u.superAdmin?'Super Admin':'Admin';
 return `<form class="security-account security-card${own?' is-own-account':''}" data-account="${u.id}"><div class="security-account-header"><span class="security-avatar" aria-hidden="true">${esc(u.name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase())}</span><div class="security-account-identity"><h3>${esc(u.name)}</h3><p>${esc(u.email||'Email not linked')}</p></div></div><div class="security-account-badges"><span class="security-role-badge" data-elevated="${!!u.superAdmin}">${role}</span><span class="security-status-badge" data-active="${!!u.active}"><i></i>${u.active?'Active':'Disabled'}</span>${own?'<span class="security-own-badge">Your account</span>':''}</div><div class="security-access-fields"><label class="security-role-select">Access level<select name="superAdmin" ${own?'disabled':''}><option value="false" ${!u.superAdmin?'selected':''}>Admin</option><option value="true" ${u.superAdmin?'selected':''}>Super Admin</option></select></label><label class="security-account-toggle"><span>Account access</span><span class="security-toggle-control"><input type="checkbox" name="active" role="switch" aria-label="Enable account for ${esc(u.name)}" ${u.active?'checked':''} ${own?'disabled':''}><span class="security-toggle-track" aria-hidden="true"></span><span>Enabled</span></span></label></div><div class="security-account-footer"><small>${own?'Your access is protected from changes here.':'Saving changes signs out this account’s devices.'}</small><button class="button" ${own?'disabled':''}>${own?'YOUR ACCOUNT':'SAVE CHANGES ↗'}</button></div><p class="security-account-feedback" role="status"></p></form>`;
}
async function loadSecurity(){
 const invitationPanel=document.querySelector('#admins-panel');if(invitationPanel){invitationPanel.hidden=true;document.querySelector('#dashboard').append(invitationPanel);}
 const panel=document.querySelector('#security-panel'),status=await api('security/status');
 panel.innerHTML='<div class="section-head"><div><p class="eyebrow">ACCOUNT PROTECTION</p><h2>Accounts &amp; Security.</h2></div><button class="button" id="security-refresh">REFRESH</button></div><p>'+ (status.superAdmin?'Super Admin access · Manage devices and admin permissions.':'Protect your account. Account and device management is restricted to Super Admins.')+'</p><div class="security-grid"><section class="security-card security-personal-card"><div class="security-personal-heading"><span class="security-avatar" aria-hidden="true">↗</span><div><h3>Change password</h3><p>Keep your garage account secure.</p></div></div><form id="security-password" class="form-grid">'+passwordField()+passwordField(true).replace('name="password"','name="newPassword"')+'<div class="full"><button class="button">CHANGE & SIGN OUT ALL DEVICES</button><p role="status"></p></div></form></section><section class="security-card security-personal-card"><div class="security-personal-heading"><span class="security-avatar" aria-hidden="true">#</span><div><h3>Recovery codes</h3><p>Backup access for your account.</p></div></div><p>'+status.recoveryCodes+' unused codes. Keep these offline in a safe place. Each code resets your password and signs out every device. Generating a new set replaces the old set.</p><form id="security-recovery">'+passwordField()+'<button class="button">GENERATE 8 CODES</button><div id="recovery-result" role="status"></div></form></section></div>';
 if(!status.superAdmin)panel.querySelector('h2').textContent='My Security.';
 panel.querySelector('#security-refresh').onclick=()=>loadSecurity().catch(e=>message.textContent=e.message);
 panel.querySelector('#security-password').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button');button.disabled=true;try{await api('security/password','POST',Object.fromEntries(new FormData(form)));await init();message.textContent='Password changed. All devices signed out. Sign in again.';}catch(err){form.querySelector('[role=status]').textContent=err.message;}finally{button.disabled=false;}};
 panel.querySelector('#security-recovery').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button'),result=form.querySelector('#recovery-result');button.disabled=true;try{const data=await api('security/recovery-codes','POST',Object.fromEntries(new FormData(form)));form.reset();result.innerHTML='<p>Save these now. They will not be shown again.</p><pre class="recovery-codes">'+data.codes.map(esc).join('\n')+'</pre>';}catch(err){result.textContent=err.message;}finally{button.disabled=false;}};
 if(!status.superAdmin){await organiseSecurity(panel,status);return;}
 const [accounts,devices,events]=await Promise.all([api('security/accounts'),api('security/devices'),api('security/events')]);
 const block=document.createElement('section');block.className='security-super';
 block.innerHTML='<h3>Admin access</h3><p>Disabling an account or changing its role immediately signs out all its devices. Your own access cannot be changed here.</p><label class="security-confirm">Your current password to confirm access changes<input id="security-confirm-password" type="password" autocomplete="current-password"></label><div class="admin-email-list">'+accounts.map(securityAccountCard).join('')+'</div><h3>Logged-in devices</h3><p>Browser and system names are reported by the device. IP addresses may be shared; location is not inferred. Activity updates about once per minute.</p><div class="security-devices">'+devices.map(securityDeviceCard).join('')+'</div><h3>Security activity</h3><div>'+events.map(v=>'<article class="activity-entry"><div><strong>'+esc(v.actor_name)+'</strong><p>'+esc(v.action)+' · Account #'+esc(v.target_id)+'</p><small>'+esc(new Date(v.created).toLocaleString())+'</small></div></article>').join('')+'</div>';
 panel.append(block);
 const confirmPassword=()=>block.querySelector('#security-confirm-password').value;
 block.querySelectorAll('[data-account]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await api('security/accounts','PATCH',{userId:Number(form.dataset.account),active:form.elements.active.checked,superAdmin:form.elements.superAdmin.value==='true',password:confirmPassword()});await loadSecurity();message.textContent='Access updated. Account devices signed out.';}catch(err){form.querySelector('[role=status]').textContent=err.message;}finally{button.disabled=false;}});
 block.querySelectorAll('[data-revoke],[data-revoke-all]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api('security/revoke','POST',{password:confirmPassword(),...(button.dataset.revoke?{deviceId:button.dataset.revoke}:{userId:Number(button.dataset.revokeAll)})});await init();if(accountSession.authenticated)await loadSecurity();message.textContent='Selected sessions signed out.';}catch(err){button.closest('article').querySelector('[role=status]').textContent=err.message;}finally{button.disabled=false;}});
 await organiseSecurity(panel,status);
}

let activeSecuritySection='accounts';
async function organiseSecurity(panel,status){
 const names=status.superAdmin?[['accounts','Accounts'],['devices','Devices'],['mine','My Security'],['events','Security Activity']]:[['mine','My Security']];
 if(!names.some(([key])=>key===activeSecuritySection))activeSecuritySection='mine';
 const nav=document.createElement('div');nav.className='security-subtabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Accounts and security sections');
 const mine=document.createElement('section');mine.dataset.securitySection='mine';mine.append(panel.querySelector('.security-grid'));panel.append(mine);
 const block=panel.querySelector('.security-super');let confirmation;
 if(block){
  const children=[...block.children];const sections={};for(const [key] of names.filter(([k])=>k!=='mine')){const section=document.createElement('section');section.dataset.securitySection=key;sections[key]=section;}
  let key='accounts';for(const child of children){if(child.tagName==='H3'){if(child.textContent==='Logged-in devices')key='devices';if(child.textContent==='Security activity')key='events';}sections[key].append(child);}
  confirmation=sections.accounts.querySelector('.security-confirm');block.append(confirmation,...Object.values(sections));
  const invites=document.querySelector('#admins-panel');sections.accounts.prepend(invites);invites.hidden=false;await loadAdminEmails();
 }
 for(const [key,label] of names){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.securityTarget=key;button.setAttribute('role','tab');button.id='security-tab-'+key;button.setAttribute('aria-controls','security-section-'+key);nav.append(button);}
 panel.querySelector('.section-head').after(nav);
 function select(key,focus=false){activeSecuritySection=key;nav.querySelectorAll('button').forEach(button=>{const selected=button.dataset.securityTarget===key;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;if(selected&&focus)button.focus();});panel.querySelectorAll('[data-security-section]').forEach(section=>{section.id='security-section-'+section.dataset.securitySection;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','security-tab-'+section.dataset.securitySection);section.hidden=section.dataset.securitySection!==key;});if(confirmation)confirmation.hidden=!['accounts','devices'].includes(key);saveAdminView();}
 nav.querySelectorAll('button').forEach(button=>{button.onclick=()=>select(button.dataset.securityTarget);button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...nav.children],i=buttons.indexOf(button),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;select(buttons[next].dataset.securityTarget,true);};});select(activeSecuritySection);
}
