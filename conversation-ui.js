(() => {
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dialog=document.createElement('dialog');dialog.className='conversation-dialog';dialog.setAttribute('aria-labelledby','conversation-title');
 dialog.innerHTML='<div class="conversation-heading"><div><p class="eyebrow">LUZIO GARAGE / MESSAGES</p><h2 id="conversation-title">Inquiry conversation</h2></div><button type="button" class="close-dialog" aria-label="Close conversation">×</button></div><p class="conversation-note"></p><div class="conversation-messages" aria-live="polite" aria-label="Conversation messages"></div><form class="conversation-composer"><label>Your reply<textarea name="message" rows="3" maxlength="3000" required placeholder="Write a reply…"></textarea></label><div><span class="conversation-result" role="status"></span><button class="button" type="submit">SEND REPLY ↗</button></div></form>';
 document.body.append(dialog);let active=null,timer=null,lastId=-1,generation=0,onUpdate=()=>{};
 async function api(route,method='GET',body){const r=await fetch('/api/'+route,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Could not load conversation.');return data;}
 const result=dialog.querySelector('.conversation-result'),messages=dialog.querySelector('.conversation-messages'),form=dialog.querySelector('form');
 async function refresh(){
  const selected=active,run=generation;if(!selected||!dialog.open)return;
  const data=await api('inquiries/'+selected+'/messages');if(run!==generation||!dialog.open)return;
  dialog.querySelector('.conversation-note').textContent=data.canReply?'Messages stay in your Luzio account. The conversation refreshes while open.':'Guest inquiry: contact this customer using their phone number.';
  form.hidden=!data.canReply;
  if(data.lastId!==lastId){const nearBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<100||lastId<0;messages.innerHTML=data.messages.map(m=>'<article class="conversation-bubble '+(m.mine?'mine':'')+'"><div><strong>'+esc(m.mine?'You':m.name)+'</strong><span>'+esc(m.role==='client'||m.role==='guest'?'Customer':'Garage team')+'</span></div><p>'+esc(m.message)+'</p><time>'+esc(new Date(m.created.replace(' ','T')+'Z').toLocaleString())+'</time></article>').join('');lastId=data.lastId;if(nearBottom)messages.scrollTop=messages.scrollHeight;}
  if(document.visibilityState==='visible'&&dialog.open){await api('inquiries/'+selected+'/read','POST',{lastId:data.lastId});if(run===generation)onUpdate();}
 }
 function cleanup(){clearInterval(timer);active=null;generation++;}
 dialog.querySelector('.close-dialog').onclick=()=>dialog.close();dialog.addEventListener('close',cleanup);
 form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button'),selected=active;button.disabled=true;result.textContent='Sending…';try{await api('inquiries/'+selected+'/messages','POST',{message:form.elements.message.value});if(active!==selected)return;form.reset();result.textContent='Reply sent.';await refresh();}catch(e){result.textContent=e.message;}finally{button.disabled=false;}};
 window.LuzioThreads={async open(id,callback=()=>{}){cleanup();active=Number(id);onUpdate=callback;lastId=-1;messages.innerHTML='';form.reset();result.textContent='Loading conversation…';form.hidden=true;dialog.querySelector('#conversation-title').textContent='Inquiry #'+id;dialog.showModal();try{await refresh();result.textContent='';}catch(e){result.textContent=e.message;form.hidden=false;}timer=setInterval(()=>{if(dialog.open&&document.visibilityState==='visible')refresh().catch(e=>result.textContent=e.message);},10000);}};
})();
