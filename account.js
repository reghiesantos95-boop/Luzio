(() => {
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const message=document.querySelector('#account-message'),form=document.querySelector('#customer-form'),auth=document.querySelector('#customer-auth'),dashboard=document.querySelector('#customer-dashboard');
 let mode='login',session;
 async function api(route,method='GET',body){const response=await fetch('/api/'+route,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed.');return data;}
 const email='<label>Email address<input name="email" type="email" autocomplete="email" required maxlength="254"></label>';
 const password=fresh=>`<label>${fresh?'Password (at least 12 characters)':'Password'}<input name="password" type="password" required minlength="${fresh?12:1}" maxlength="200" autocomplete="${fresh?'new-password':'current-password'}"></label>`;
 const confirm='<label>Confirm password<input name="confirm" type="password" required minlength="12" maxlength="200" autocomplete="new-password"></label>';
 function show(next){
  mode=next;auth.hidden=false;dashboard.hidden=true;
  const titles={login:'Welcome back.',register:'Create your account.',forgot:'Forgot your password?',pending:'Verify your email.',verify:'Confirm your email.',reset:'Choose a new password.'};
  document.querySelector('#customer-title').textContent=titles[mode]||titles.login;
  form.innerHTML=mode==='register'?'<label>Your name<input name="name" autocomplete="name" required minlength="2" maxlength="100"></label>'+email+password(true)+confirm+'<label class="consent full"><input name="consent" type="checkbox" required> I agree to receive emails about my account and be contacted about inquiries I submit.</label>':mode==='login'?email+password(false):mode==='forgot'?email:mode==='reset'?password(true)+confirm:mode==='pending'?`<p class="full">Check the inbox for ${esc(session?.user?.email)}. Verify your email to access your account.</p>`:'<p class="full">Confirm your email to activate your Luzio Garage Trading account.</p>';
  const labels={register:'CREATE ACCOUNT',login:'SIGN IN',forgot:'SEND RESET LINK',reset:'SAVE PASSWORD',verify:'VERIFY EMAIL',pending:'RESEND VERIFICATION'};
  form.insertAdjacentHTML('beforeend',`<div class="full"><button class="button" type="submit">${labels[mode]} →</button></div>`);
  const actions=document.querySelector('#customer-actions');actions.innerHTML='';
  function action(text,handler){const b=document.createElement('button');b.className='button';b.type='button';b.textContent=text;b.onclick=handler;actions.append(b);}
  if(mode==='login'){action('CREATE AN ACCOUNT',()=>{message.textContent='';show('register');});if(!session?.localTesting)action('FORGOT PASSWORD?',()=>{message.textContent='';show('forgot');});}
  else if(mode==='pending')action('LOG OUT',logout);
  else action('BACK TO SIGN IN',()=>{history.replaceState(null,'',location.pathname);message.textContent='';show('login');});
 }
 async function loadInquiries(){
  const inquiries=await api('my-inquiries');
  document.querySelector('#customer-inquiries').innerHTML=inquiries.length?inquiries.map(i=>`<article class="inquiry-card"><span class="tag">#${i.id} · ${esc(i.status.toUpperCase())}</span><h3>${esc(i.kind==='financing'?'Financing inquiry':i.kind==='unit'?'Motorcycle inquiry':'General inquiry')}</h3><p>${esc(i.created)} UTC${i.bikeName?' · '+esc(i.bikeName):''}</p><p class="unit-description">${esc(i.message)}</p><button class="button" data-thread="${i.id}">OPEN CONVERSATION ${i.unread?'<span class="unread-badge">'+i.unread+' NEW</span>':'↗'}</button></article>`).join(''):'<div class="empty-state"><h3>No inquiries yet.</h3><p>Browse the garage and send an inquiry while signed in to track it here.</p><a class="text-link" href="/#inventory">EXPLORE INVENTORY →</a></div>';
 }
 document.querySelector('#customer-inquiries').addEventListener('click',e=>{const b=e.target.closest('[data-thread]');if(b)LuzioThreads.open(b.dataset.thread,()=>loadInquiries().catch(()=>{}));});
 setInterval(()=>{if(!dashboard.hidden&&document.visibilityState==='visible')loadInquiries().catch(()=>{});},15000);
 async function init(){
  try{
   session=await api('session');document.querySelector('#account-notice').textContent=session.localTesting?'Local testing: you can register and sign in without email verification.':session.emailConfigured?'':'Email registration and recovery are waiting for the garage’s email configuration.';
   const action=location.hash.slice(1).split('?')[0];if(['verify','reset'].includes(action)){show(action);return;}
   if(!session.authenticated){show('login');return;}
   if(session.user.role!=='client'){auth.hidden=true;dashboard.hidden=true;message.innerHTML='Your account belongs to the garage team. <a class="text-link" href="/admin">OPEN TEAM DASHBOARD →</a>';return;}
   if(!session.user.verified){show('pending');return;}
   auth.hidden=true;dashboard.hidden=false;document.querySelector('#customer-greeting').textContent='Hello, '+session.user.name+'.';document.querySelector('#customer-email').textContent=session.user.email;await loadInquiries();
  }catch(error){message.textContent=error.message;}
 }
 async function logout(){try{await api('logout','POST',{});message.textContent='Signed out.';await init();}catch(error){message.textContent=error.message;}}
 form.onsubmit=async e=>{
  e.preventDefault();const button=form.querySelector('button');button.disabled=true;message.textContent='';const body=Object.fromEntries(new FormData(form));
  try{
   if(['register','reset'].includes(mode)&&body.password!==body.confirm)throw Error('Passwords do not match.');
   if(mode==='register'){
    await api('register','POST',body);await api('login','POST',{email:body.email,password:body.password});await init();message.textContent=session.localTesting?'Account created. You’re signed in.':'Account created. Check your email for the verification link.';
   }else if(mode==='login'){await api('login','POST',body);form.reset();await init();}
   else if(mode==='forgot'){const result=await api('forgot-password','POST',body);message.textContent=result.message;}
   else if(mode==='pending'){await api('verification/resend','POST',{});message.textContent='Verification link sent. Check your inbox and spam folder.';}
   else{
    const token=new URLSearchParams(location.hash.split('?')[1]||'').get('token');await api(mode==='verify'?'verify':'reset-password','POST',{token,password:body.password});
    const done=mode;history.replaceState(null,'',location.pathname);message.textContent=done==='verify'?'Email verified. You can now sign in.':'Password updated. Sign in with your new password.';await init();
   }
  }catch(error){message.textContent=error.message;}
  finally{button.disabled=false;}
 };
 document.querySelector('#customer-logout').onclick=logout;
 document.querySelector('#customer-refresh').onclick=async()=>{try{await loadInquiries();message.textContent='Inquiries refreshed.';}catch(error){message.textContent=error.message;}};
 window.addEventListener('hashchange',init);init();
})();
