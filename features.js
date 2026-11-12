(() => {
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(v);
 const placeholder='<div class="unit-placeholder"><span>LUZIO GARAGE</span><small>PHOTOS COMING SOON</small></div>';
 const photo=b=>/^(?:assets\/[a-z0-9-]+|uploads\/[a-f0-9]{32})\.(png|jpg|webp)$/.test(b.image||'')?'<img class="unit-photo" src="'+esc(b.image)+'" alt="'+esc(b.name)+'" loading="lazy">':placeholder;
 const specs=b=>[b.year?b.year+' model':'Year to be confirmed',b.mileage==null?'Mileage to be confirmed':Number(b.mileage).toLocaleString()+' km'].join(' · ');
 let bikes=[];
 const inventory=document.querySelector('.inventory-panel');
 inventory.outerHTML=`<div class="filters"><label>Search units<input id="unit-search" type="search" placeholder="Model, brand, type…"></label><label>Brand<select id="brand-filter"><option value="">All brands</option></select></label><label>Status<select id="status-filter"><option value="available">Available</option><option value="">All statuses</option><option>reserved</option><option>sold</option></select></label><label>Sort by<select id="sort-filter"><option value="new">Newest added</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="year">Model year</option></select></label></div><p id="inventory-count" role="status"></p><div id="unit-grid" class="unit-grid"></div>`;
 const dialog=document.createElement('dialog');dialog.className='unit-dialog';document.body.append(dialog);
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 const inquirySection=document.createElement('section');inquirySection.className='section inquiry-section';inquirySection.id='inquiry';
 inquirySection.innerHTML=`<p class="eyebrow">LET'S TALK ABOUT YOUR NEXT RIDE</p><h2>Send an inquiry.</h2><p>Leave your contact number and the garage can follow up. No payment or reservation is made through this form.</p><form id="inquiry-form" class="form-grid"><label>Your name<input name="name" autocomplete="name" required minlength="2" maxlength="100"></label><label>Mobile number<input name="phone" type="tel" autocomplete="tel" required pattern="[+0-9 ()-]{7,30}" maxlength="30" placeholder="09xx xxx xxxx"></label><label>Inquiry type<select name="kind"><option value="general">General inquiry</option><option value="unit">Motorcycle inquiry</option><option value="financing">Financing inquiry</option></select></label><label>Motorcycle<select name="bikeId"><option value="">No specific unit</option></select></label><label class="full">Message<textarea name="message" rows="4" required minlength="5" maxlength="2000" placeholder="Tell us what you’re looking for…"></textarea></label><p class="full">Your name, number, and message will be stored for Luzio Garage Trading to respond to this inquiry. Please avoid sharing IDs or financial documents.</p><label class="consent full"><input type="checkbox" required> I agree to be contacted about this inquiry.</label><div class="full"><button class="button" type="submit">SEND INQUIRY ↗</button><p id="inquiry-result" role="status" aria-live="polite"></p></div></form>`;
 document.querySelector('#contact').after(inquirySection);
 renderPage(false);
 const form=document.querySelector('#inquiry-form');
 const accountHint=document.createElement('p');accountHint.className='full';accountHint.innerHTML='<a class="text-link" href="/account">SIGN IN / REGISTER TO TRACK INQUIRIES →</a>';form.before(accountHint);
 fetch('/api/session').then(r=>r.json()).then(s=>{if(s.authenticated){document.querySelector('#customer-account-link').textContent=s.user.role==='client'?'My Account':'Team Dashboard';document.querySelector('#customer-account-link').href=s.user.role==='client'?'/account':'/admin';form.elements.name.value=s.user.name;accountHint.textContent=s.user.verified?'You’re signed in. This inquiry will be linked to your account.':'Verify your email in My Account before submitting an inquiry.';}}).catch(()=>{});

 const calculator=document.createElement('div');calculator.className='calculator';
 calculator.innerHTML=`<h3>Monthly payment estimator</h3><p>Enter a lender’s quoted annual rate to explore an estimate. These are your inputs, not Luzio financing terms or an approval.</p><form id="estimate-form" class="form-grid"><label>Unit price (₱)<input name="price" type="number" min="1" max="100000000" step="1" required></label><label>Down payment (₱)<input name="down" type="number" min="0" step="1" value="0" required></label><label>Term (months)<input name="months" type="number" min="1" max="120" step="1" value="36" required></label><label>Annual interest rate (%)<input name="rate" type="number" min="0" max="100" step="0.01" required placeholder="Enter quoted rate"></label><div class="full"><button class="button" type="submit">CALCULATE ESTIMATE</button><p id="estimate-result" role="status"></p></div></form><p>Uses reducing-balance amortization. Fees, insurance, and lender-specific charges are excluded; actual terms may differ.</p><a class="text-link" href="#inquiry" id="finance-inquiry">ASK ABOUT FINANCING →</a>`;
 document.querySelector('#financing').append(calculator);
 function chooseInquiry(bike,kind='unit'){
  form.elements.kind.value=kind;form.elements.bikeId.value=bike?.id||'';
  if(bike)form.elements.message.value=`Hi, I’m interested in the ${bike.year?bike.year+' ':''}${bike.name}. Is it available?`;
  if(dialog.open)dialog.close();location.hash='inquiry';renderPage();form.elements.name.focus({preventScroll:true});
 }
 document.querySelector('#finance-inquiry').onclick=()=>{form.elements.kind.value='financing';};
 document.querySelector('#estimate-form').onsubmit=e=>{
  e.preventDefault();const data=new FormData(e.target);const price=Number(data.get('price')),down=Number(data.get('down')),months=Number(data.get('months')),rate=Number(data.get('rate'))/1200;
  if(down>=price){document.querySelector('#estimate-result').textContent='Down payment must be less than the unit price.';return;}
  const principal=price-down,payment=rate===0?principal/months:principal*rate/(1-Math.pow(1+rate,-months));
  document.querySelector('#estimate-result').textContent=`Estimated ${money(payment)}/month · Loan principal ${money(principal)} · Total interest ${money(payment*months-principal)} · Total including down payment ${money(payment*months+down)}.`;
 };
 function detailSpecs(b){return '<dl class="showroom-specs"><div><dt>MODEL YEAR</dt><dd>'+esc(b.year||'To be confirmed')+'</dd></div><div><dt>MILEAGE</dt><dd>'+esc(b.mileage==null?'To be confirmed':Number(b.mileage).toLocaleString()+' km')+'</dd></div></dl>';}
 function extraSpecs(b){const fields=[['Engine size',b.engineCc?b.engineCc+' cc':''],['Transmission',b.transmission],['Registration & papers',b.papers],['Ownership history',b.ownership],['Modifications & accessories',b.modifications]];return '<div class="motor-extra-specs">'+fields.filter(([,v])=>v).map(([label,value])=>'<section><h3>'+esc(label)+'</h3><p>'+esc(value)+'</p></section>').join('')+'</div>';}
 function showUnit(bike){
  dialog.classList.add('showroom-dialog');dialog.setAttribute('aria-labelledby','showroom-unit-title');
  dialog.innerHTML=`<div class="showroom-dialog-bar"><span>LUZIO GARAGE <i>/</i> UNIT DETAILS</span><button class="close-dialog" aria-label="Close unit details">×</button></div><div class="showroom-detail"><div class="showroom-visual">${photo(bike)}<span class="showroom-image-label">${esc(bike.brand.toUpperCase())} / ${esc(bike.type.toUpperCase())}</span><span class="showroom-photo-index">${bike.image?'01 / 01':'PHOTO PENDING'}</span></div><section class="showroom-summary"><div class="showroom-meta"><span class="showroom-brand">${esc(bike.brand)}</span><span class="showroom-status" data-status="${esc(bike.status)}"><i></i>${esc(bike.status)}</span></div><h2 id="showroom-unit-title">${esc(bike.name)}</h2><p class="showroom-category">${esc(bike.type)} motorcycle · Luzio Garage Trading</p><div class="showroom-price"><span>ASKING PRICE</span><strong>${money(bike.price)}</strong><small>Philippine Peso / PHP</small></div>${detailSpecs(bike)}${extraSpecs(bike)}<p class="unit-description">${esc(bike.description||'Contact the garage for complete specifications and viewing arrangements.')}</p><div class="showroom-location"><span>↗</span><div><strong>See it at the garage.</strong><p>Heroes Hill, Quezon City<br>Contact us to arrange a viewing.</p></div></div><div class="showroom-detail-actions">${bike.status==='available'?'<button class="button inquire-unit">INQUIRE ABOUT THIS UNIT <span>↗</span></button>':'<p>This unit is '+esc(bike.status)+'. Ask us about other motorcycles.</p>'}<a class="showroom-call" href="tel:+639273046604">CALL 0927 304 6604 <span>↗</span></a></div></section></div>`;
  const images=bike.images?.length?bike.images:bike.image?[bike.image]:[];
  const visual=dialog.querySelector('.showroom-visual');
  if(images.length>1){const thumbs=document.createElement('div');thumbs.className='public-photo-thumbs';thumbs.setAttribute('aria-label','Motorcycle gallery');thumbs.innerHTML=images.map((image,index)=>'<button type="button" aria-label="Show photo '+(index+1)+'" aria-pressed="'+(index===0)+'"><img src="'+esc(image)+'" alt="" loading="lazy"></button>').join('');visual.append(thumbs);thumbs.querySelectorAll('button').forEach((button,index)=>button.onclick=()=>{visual.querySelector('.unit-photo').src=images[index];visual.querySelector('.showroom-photo-index').textContent=String(index+1).padStart(2,'0')+' / '+String(images.length).padStart(2,'0');thumbs.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));});}
  if(images.length)visual.querySelector('.showroom-photo-index').textContent='01 / '+String(images.length).padStart(2,'0');
  dialog.querySelector('.close-dialog').onclick=()=>dialog.close();dialog.querySelector('.inquire-unit')?.addEventListener('click',()=>chooseInquiry(bike));dialog.showModal();
 }
 function render(){
  const search=document.querySelector('#unit-search').value.trim().toLowerCase(),brand=document.querySelector('#brand-filter').value,status=document.querySelector('#status-filter').value,sort=document.querySelector('#sort-filter').value;
  const list=bikes.filter(b=>(!brand||b.brand===brand)&&(!status||b.status===status)&&`${b.name} ${b.brand} ${b.type}`.toLowerCase().includes(search));
  list.sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:sort==='year'?b.year-a.year:b.id-a.id);
  document.querySelector('#inventory-count').textContent=`${list.length} unit${list.length===1?'':'s'} found`;
  const grid=document.querySelector('#unit-grid');
  grid.innerHTML=list.length?list.map((b,index)=>`<article class="unit-card showroom-card"><div class="showroom-visual">${photo(b)}<span class="showroom-image-label">LUZIO GARAGE / THE COLLECTION</span><span class="showroom-photo-index">${String(index+1).padStart(2,'0')}</span></div><div class="unit-card-body"><div class="showroom-meta"><span class="showroom-brand">${esc(b.brand)}</span><span class="showroom-status" data-status="${esc(b.status)}"><i></i>${esc(b.status)}</span></div><span class="showroom-category">${esc(b.type).toUpperCase()} MOTORCYCLE</span><h3>${esc(b.name)}</h3><div class="showroom-price"><span>ASKING PRICE</span><strong>${money(b.price)}</strong></div>${detailSpecs(b)}<div class="showroom-card-bottom"><span>HEROES HILL · QUEZON CITY</span><button class="button" data-unit="${b.id}">EXPLORE UNIT <span>↗</span></button></div></div></article>`).join(''):`<div class="empty-state"><h3>${bikes.length?'No matching units.':'The garage is ready for its first listing.'}</h3><p>${bikes.length?'Try a different search or status filter.':'Contact us for current availability, or check back for newly added units.'}</p><a class="text-link" href="#inquiry">ASK THE GARAGE →</a></div>`;
  grid.querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>showUnit(bikes.find(b=>b.id===Number(button.dataset.unit))));
 }
 document.querySelectorAll('.filters input,.filters select').forEach(input=>input.addEventListener('input',render));
 form.onsubmit=async e=>{
  e.preventDefault();const result=document.querySelector('#inquiry-result'),button=form.querySelector('button');button.disabled=true;result.textContent='Sending…';
  try{const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});const data=await response.json();if(!response.ok)throw Error(data.error);result.textContent=`Inquiry #${data.id} saved. The garage can view it in the admin inbox. For an urgent response, call 0927 304 6604.`;form.reset();}
  catch(error){result.textContent='Could not send: '+(location.protocol==='file:'?'Start the local server with npm start, then open http://127.0.0.1:4174.':error.message);}
  finally{button.disabled=false;}
 };
 let showcaseTimer;
 function renderHomeShowcase(){
  clearInterval(showcaseTimer);
  const units=bikes.filter(b=>b.publication!=='draft'&&b.status!=='sold'&&/^(?:assets\/[a-z0-9-]+|uploads\/[a-f0-9]{32})\.(png|jpg|webp)$/.test(b.image||'')).slice(0,8);
  if(!units.length)return;
  const art=document.querySelector('.hero-art');art.classList.add('home-showcase');art.setAttribute('role','region');art.setAttribute('aria-roledescription','carousel');art.setAttribute('aria-label','Motorcycles in the garage');
  art.innerHTML='<div class="home-showcase-top"><span>IN THE GARAGE</span><span class="home-showcase-counter">01 / '+String(units.length).padStart(2,'0')+'</span></div>'+units.map((b,index)=>`<article class="home-motor-slide" role="group" aria-roledescription="slide" aria-label="${index+1} of ${units.length}: ${esc(b.name)}" ${index?'hidden':''}><img src="${esc(b.image)}" alt="${esc(b.name)}" loading="${index?'lazy':'eager'}"><div class="home-motor-caption"><div class="home-motor-brand"><span>${esc(b.brand)} / ${esc(b.type)}</span><span class="showroom-status" data-status="${esc(b.status)}"><i></i>${esc(b.status)}</span></div><h2>${esc(b.name)}</h2><div class="home-motor-bottom"><strong>${money(b.price)}</strong><button class="home-unit-link" data-showcase-unit="${b.id}">VIEW MOTORCYCLE <span>↗</span></button></div></div></article>`).join('')+(units.length>1?'<div class="home-showcase-controls"><div class="home-showcase-arrows"><button type="button" data-showcase-step="-1" aria-label="Previous motorcycle">←</button><button type="button" data-showcase-step="1" aria-label="Next motorcycle">→</button></div><div class="home-showcase-dots">'+units.map((b,index)=>'<button type="button" data-showcase-index="'+index+'" aria-label="Show '+esc(b.name)+'" '+(!index?'aria-current="true"':'')+'><span></span></button>').join('')+'</div><button type="button" class="home-showcase-pause" aria-label="Pause motorcycle slideshow">PAUSE Ⅱ</button></div>':'');
  let selected=0,hovered=false;const reduced=matchMedia('(prefers-reduced-motion: reduce)');let paused=reduced.matches;
  const slides=[...art.querySelectorAll('.home-motor-slide')],dots=[...art.querySelectorAll('[data-showcase-index]')],pause=art.querySelector('.home-showcase-pause');
  function updatePause(){if(!pause)return;pause.textContent=paused?'PLAY ▷':'PAUSE Ⅱ';pause.setAttribute('aria-label',(paused?'Play':'Pause')+' motorcycle slideshow');}
  function select(index){selected=(index+units.length)%units.length;slides.forEach((slide,i)=>slide.hidden=i!==selected);dots.forEach((dot,i)=>{if(i===selected)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');});art.querySelector('.home-showcase-counter').textContent=String(selected+1).padStart(2,'0')+' / '+String(units.length).padStart(2,'0');}
  art.querySelectorAll('[data-showcase-unit]').forEach(button=>button.onclick=()=>{paused=true;updatePause();showUnit(units.find(b=>b.id===Number(button.dataset.showcaseUnit)));});
  art.querySelectorAll('[data-showcase-step]').forEach(button=>button.onclick=()=>select(selected+Number(button.dataset.showcaseStep)));
  dots.forEach(button=>button.onclick=()=>select(Number(button.dataset.showcaseIndex)));
  art.addEventListener('pointerenter',()=>hovered=true);art.addEventListener('pointerleave',()=>hovered=false);
  art.addEventListener('focusin',()=>{paused=true;updatePause();});
  if(pause)pause.onclick=()=>{paused=!paused;updatePause();};
  reduced.addEventListener('change',()=>{if(reduced.matches){paused=true;updatePause();}});
  updatePause();
  if(units.length>1)showcaseTimer=setInterval(()=>{if(!paused&&!hovered&&!document.hidden&&!document.querySelector('#home').hidden&&!document.querySelector('dialog[open]'))select(selected+1);},6000);
 }

 async function load(){
  const grid=document.querySelector('#unit-grid');grid.textContent='Loading inventory…';
  try{if(location.protocol==='file:')throw Error('For live inventory and forms, run npm start and open http://127.0.0.1:4174.');const response=await fetch('/api/bikes');if(!response.ok)throw Error('Inventory unavailable.');bikes=await response.json();renderHomeShowcase();
   document.querySelector('#brand-filter').innerHTML='<option value="">All brands</option>'+[...new Set(bikes.map(b=>b.brand))].sort().map(b=>`<option>${esc(b)}</option>`).join('');
   form.elements.bikeId.innerHTML='<option value="">No specific unit</option>'+bikes.filter(b=>b.status==='available').map(b=>`<option value="${b.id}">${esc(b.name)}${b.year?' ('+b.year+')':''}</option>`).join('');render();
  }catch(error){grid.innerHTML=`<div class="empty-state"><h3>Connect to the garage.</h3><p>${esc(error.message)}</p><button class="button" id="retry-inventory">RETRY</button></div>`;document.querySelector('#retry-inventory').onclick=load;}
 }
 load();
})();
