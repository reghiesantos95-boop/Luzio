(() => {
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(v);
 const placeholder='<div class="unit-placeholder"><span>LUZIO GARAGE</span><small>PHOTOS COMING SOON</small></div>';
 const photo=b=>/^(?:assets\/[a-z0-9-]+|uploads\/[a-f0-9]{32})\.(png|jpg|webp)$/.test(b.image||'')?'<img class="unit-photo" src="'+esc(b.image)+'" alt="'+esc(b.name)+'" loading="lazy">':placeholder;
 const specs=b=>[b.year?b.year+' model':'Year to be confirmed',b.mileage==null?'Mileage to be confirmed':Number(b.mileage).toLocaleString()+' km'].join(' · ');
 let bikes=[];
 const inventory=document.querySelector('.inventory-panel');
 inventory.outerHTML=`<section class="inventory-finder" aria-labelledby="finder-title"><div class="finder-heading"><div><span class="finder-kicker">THE RIGHT BIKE. YOUR NEXT CHAPTER.</span><h3 id="finder-title">Find your next ride<span>.</span></h3></div><span class="finder-note">Explore the garage</span></div><div class="filters"><label class="finder-search">Search motorcycles<span class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="unit-search" type="search" placeholder="Search model, brand or style…"></span></label><label>Brand<select id="brand-filter"><option value="">All brands</option></select></label><label>Status<select id="status-filter"><option value="available">Available</option><option value="">All statuses</option><option>reserved</option><option>sold</option></select></label><label>Sort by<select id="sort-filter"><option value="new">Newest added</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="year">Model year</option></select></label></div></section><p id="inventory-count" role="status"></p><div id="unit-grid" class="unit-grid"></div>`;
 const dialog=document.createElement('dialog');dialog.className='unit-dialog';document.body.append(dialog);
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 const facebookUrl='https://www.facebook.com/profile.php?id=100063721998692';
 const inquirySection=document.createElement('section');inquirySection.id='inquiry';inquirySection.className='section facebook-inquiry';
 inquirySection.innerHTML='<div><p class="eyebrow">LET’S TALK MOTORCYCLES</p><h2>Your next ride starts<br>with a message.</h2><p>Ask about a motorcycle, pricing, payment options or a garage visit. Continue on our Facebook page and talk directly with Luzio Garage Trading.</p></div><a class="button facebook-cta" href="'+facebookUrl+'">INQUIRE ON FACEBOOK <span>↗</span></a>';
 document.querySelector('#contact').after(inquirySection);renderPage(false);
 const calculator=document.createElement('div');calculator.className='calculator';
 calculator.innerHTML=`<h3>Monthly payment estimator</h3><p>Enter a lender’s quoted annual rate to explore an estimate. These are your inputs, not Luzio financing terms or an approval.</p><form id="estimate-form" class="form-grid"><label>Unit price (₱)<input name="price" type="number" min="1" max="100000000" step="1" required></label><label>Down payment (₱)<input name="down" type="number" min="0" step="1" value="0" required></label><label>Term (months)<input name="months" type="number" min="1" max="120" step="1" value="36" required></label><label>Annual interest rate (%)<input name="rate" type="number" min="0" max="100" step="0.01" required placeholder="Enter quoted rate"></label><div class="full"><button class="button" type="submit">CALCULATE ESTIMATE</button><p id="estimate-result" role="status"></p></div></form><p>Uses reducing-balance amortization. Fees, insurance, and lender-specific charges are excluded; actual terms may differ.</p><a class="text-link" href="#inquiry" id="finance-inquiry">ASK ABOUT FINANCING →</a>`;
 document.querySelector('#financing').append(calculator);
 function chooseInquiry(){if(dialog.open)dialog.close();location.assign(facebookUrl);}
 document.querySelector('#finance-inquiry').href=facebookUrl;
 document.querySelector('#finance-inquiry').textContent='ASK ON FACEBOOK ↗';
 document.querySelector('#estimate-form').onsubmit=e=>{
  e.preventDefault();const data=new FormData(e.target);const price=Number(data.get('price')),down=Number(data.get('down')),months=Number(data.get('months')),rate=Number(data.get('rate'))/1200;
  if(down>=price){document.querySelector('#estimate-result').textContent='Down payment must be less than the unit price.';return;}
  const principal=price-down,payment=rate===0?principal/months:principal*rate/(1-Math.pow(1+rate,-months));
  document.querySelector('#estimate-result').textContent=`Estimated ${money(payment)}/month · Loan principal ${money(principal)} · Total interest ${money(payment*months-principal)} · Total including down payment ${money(payment*months+down)}.`;
 };
 function detailSpecs(b){return '<dl class="showroom-specs"><div><dt>MODEL YEAR</dt><dd>'+esc(b.year||'To be confirmed')+'</dd></div><div><dt>MILEAGE</dt><dd>'+esc(b.mileage==null?'To be confirmed':Number(b.mileage).toLocaleString()+' km')+'</dd></div></dl>';}
 function extraSpecs(b){const fields=[['Engine size',b.engineCc?b.engineCc+' cc':''],['Transmission',b.transmission],['Registration & papers',b.papers],['Ownership history',b.ownership],['Modifications & accessories',b.modifications]];return '<div class="motor-extra-specs">'+fields.filter(([,v])=>v).map(([label,value])=>'<section><h3>'+esc(label)+'</h3><p>'+esc(value)+'</p></section>').join('')+'</div>';}
 function showUnit(bike){
  dialog.classList.remove('photo-expanded');dialog.classList.add('showroom-dialog');dialog.setAttribute('aria-labelledby','showroom-unit-title');
  dialog.innerHTML=`<div class="showroom-dialog-bar"><span>LUZIO GARAGE <i>/</i> UNIT DETAILS</span><button class="close-dialog" aria-label="Close unit details">×</button></div><div class="showroom-detail"><div class="showroom-visual">${photo(bike)}<span class="showroom-image-label">${esc(bike.brand.toUpperCase())} / ${esc(bike.type.toUpperCase())}</span><span class="showroom-photo-index">${bike.image?'01 / 01':'PHOTO PENDING'}</span></div><section class="showroom-summary"><div class="showroom-meta"><span class="showroom-brand">${esc(bike.brand)}</span><span class="showroom-status" data-status="${esc(bike.status)}"><i></i>${esc(bike.status)}</span></div><h2 id="showroom-unit-title">${esc(bike.name)}</h2><p class="showroom-category">${esc(bike.type)} motorcycle · Luzio Garage Trading</p><div class="showroom-price"><span>ASKING PRICE</span><strong>${money(bike.price)}</strong><small>Philippine Peso / PHP</small></div>${detailSpecs(bike)}${extraSpecs(bike)}<p class="unit-description">${esc(bike.description||'Contact the garage for complete specifications and viewing arrangements.')}</p><div class="showroom-location"><span>↗</span><div><strong>See it at the garage.</strong><p>Heroes Hill, Quezon City<br>Contact us to arrange a viewing.</p></div></div><div class="showroom-detail-actions">${bike.status==='available'?'<button class="button inquire-unit">INQUIRE ON FACEBOOK <span>↗</span></button>':'<p>This unit is '+esc(bike.status)+'. Ask us about other motorcycles.</p>'}<a class="showroom-call" href="tel:+639273046604">CALL 0927 304 6604 <span>↗</span></a></div></section></div>`;
  const images=bike.images?.length?bike.images:bike.image?[bike.image]:[];
  const visual=dialog.querySelector('.showroom-visual');
  let photoIndex=0,gesture=null,suppressTapUntil=0,photoRequest=0,photoAnimations=[],outgoingPhoto=null;
  const imageElement=visual.querySelector('.unit-photo');
  const thumbs=document.createElement('div');thumbs.className='public-photo-thumbs';thumbs.setAttribute('aria-label','Motorcycle gallery');
  async function selectPhoto(index,animate=true){
   const target=(index+images.length)%images.length,direction=index>photoIndex?1:-1;
   const request=++photoRequest;
   if(animate&&target===photoIndex)return;
   const incoming=new Image();incoming.src=images[target];
   try{await incoming.decode();}catch{return;}
   if(request!==photoRequest)return;
   photoAnimations.forEach(animation=>animation.cancel());outgoingPhoto?.remove();
   const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
   if(animate&&!reduceMotion&&imageElement.complete){
    outgoingPhoto=imageElement.cloneNode(false);outgoingPhoto.removeAttribute('role');outgoingPhoto.removeAttribute('tabindex');outgoingPhoto.removeAttribute('aria-label');outgoingPhoto.removeAttribute('aria-pressed');outgoingPhoto.setAttribute('aria-hidden','true');
    Object.assign(outgoingPhoto.style,{position:'absolute',top:imageElement.offsetTop+'px',left:imageElement.offsetLeft+'px',width:imageElement.getBoundingClientRect().width+'px',height:imageElement.getBoundingClientRect().height+'px',minHeight:'0',maxHeight:'none',margin:'0',pointerEvents:'none',zIndex:'0'});
    visual.append(outgoingPhoto);
   }
   photoIndex=target;imageElement.src=images[photoIndex];
   imageElement.alt=bike.name+' — photo '+(photoIndex+1)+' of '+images.length;
   visual.querySelector('.showroom-photo-index').textContent=String(photoIndex+1).padStart(2,'0')+' / '+String(images.length).padStart(2,'0');
   thumbs.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===photoIndex)));
   if(outgoingPhoto){
    const oldPhoto=outgoingPhoto,options={duration:380,easing:'cubic-bezier(.22,.68,.2,1)',fill:'none'};
    const slideIn=imageElement.animate([{transform:'translateX('+direction*100+'%)'},{transform:'translateX(0)'}],options);
    const slideOut=oldPhoto.animate([{transform:'translateX(0)'},{transform:'translateX('+(-direction*100)+'%)'}],options);
    photoAnimations=[slideIn,slideOut];
    Promise.allSettled(photoAnimations.map(animation=>animation.finished)).then(()=>{oldPhoto.remove();if(outgoingPhoto===oldPhoto)outgoingPhoto=null;});
   }
  }
  function toggleGallery(){
   const hidden=visual.classList.toggle('gallery-clean');thumbs.inert=hidden;
   imageElement.setAttribute('aria-pressed',String(hidden));
   imageElement.setAttribute('aria-label',hidden?'Show photo controls':'Hide photo controls. Swipe left or right to change photos.');
  }
  if(images.length>1){
   thumbs.innerHTML=images.map((image,index)=>'<button type="button" aria-label="Show photo '+(index+1)+'" aria-pressed="'+(index===0)+'"><img src="'+esc(image)+'" alt="" loading="lazy"></button>').join('');visual.append(thumbs);
   thumbs.querySelectorAll('button').forEach((button,index)=>button.onclick=()=>selectPhoto(index));
  }
  if(images.length&&imageElement){
   visual.classList.add('interactive-gallery');imageElement.draggable=false;imageElement.tabIndex=0;imageElement.setAttribute('role','button');imageElement.setAttribute('aria-pressed','false');imageElement.setAttribute('aria-label','Hide photo controls. Swipe left or right to change photos.');
   const expand=document.createElement('button');expand.type='button';expand.className='gallery-expand';expand.textContent='⛶ Full screen';expand.setAttribute('aria-label','View photos full screen');expand.setAttribute('aria-pressed','false');
   dialog.querySelector('.showroom-dialog-bar').insertBefore(expand,dialog.querySelector('.close-dialog'));
   function setExpanded(expanded){
    photoAnimations.forEach(animation=>animation.cancel());outgoingPhoto?.remove();outgoingPhoto=null;
    dialog.classList.toggle('photo-expanded',expanded);expand.textContent=expanded?'↙ Back to details':'⛶ Full screen';expand.setAttribute('aria-label',expanded?'Exit full screen photos':'View photos full screen');expand.setAttribute('aria-pressed',String(expanded));dialog.scrollTop=0;
   }
   expand.onclick=()=>setExpanded(!dialog.classList.contains('photo-expanded'));
   dialog.oncancel=event=>{if(dialog.classList.contains('photo-expanded')){event.preventDefault();setExpanded(false);expand.focus();}};
   dialog.onclose=()=>{++photoRequest;photoAnimations.forEach(animation=>animation.cancel());outgoingPhoto?.remove();dialog.classList.remove('photo-expanded');};
   selectPhoto(0,false);
   visual.addEventListener('click',event=>{if(!event.target.closest('button')&&Date.now()>suppressTapUntil)toggleGallery();});
   visual.addEventListener('keydown',event=>{if(event.target!==imageElement)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleGallery();}else if(images.length>1&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();selectPhoto(photoIndex+(event.key==='ArrowRight'?1:-1));}});
   visual.addEventListener('pointerdown',event=>{if(event.target.closest('button')||!event.isPrimary)return;gesture={id:event.pointerId,x:event.clientX,y:event.clientY};});
   visual.addEventListener('pointercancel',()=>{gesture=null;});
   visual.addEventListener('pointerup',event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture=null;
    if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){suppressTapUntil=Date.now()+500;if(images.length>1)selectPhoto(photoIndex+(dx<0?1:-1));}
    else if(Math.abs(dy)>15||Math.abs(dx)>15)suppressTapUntil=Date.now()+500;
   });
  }
  dialog.querySelector('.close-dialog').onclick=()=>dialog.close();dialog.querySelector('.inquire-unit')?.addEventListener('click',()=>chooseInquiry(bike));dialog.showModal();
 }
 function render(){
  const search=document.querySelector('#unit-search').value.trim().toLowerCase(),brand=document.querySelector('#brand-filter').value,status=document.querySelector('#status-filter').value,sort=document.querySelector('#sort-filter').value;
  const list=bikes.filter(b=>(!brand||b.brand===brand)&&(!status||b.status===status)&&`${b.name} ${b.brand} ${b.type}`.toLowerCase().includes(search));
  list.sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:sort==='year'?b.year-a.year:b.id-a.id);
  document.querySelector('#inventory-count').textContent=`${list.length} motorcycle${list.length===1?'':'s'} ${status==='available'?'available':status==='reserved'?'reserved':status==='sold'?'sold':'in the garage'}`;
  const grid=document.querySelector('#unit-grid');
  grid.innerHTML=list.length?list.map((b,index)=>`<article class="unit-card showroom-card"><div class="showroom-visual">${photo(b)}<span class="showroom-image-label">LUZIO GARAGE / THE COLLECTION</span><span class="showroom-photo-index">${String(index+1).padStart(2,'0')}</span></div><div class="unit-card-body"><div class="showroom-meta"><span class="showroom-brand">${esc(b.brand)}</span><span class="showroom-status" data-status="${esc(b.status)}"><i></i>${esc(b.status)}</span></div><span class="showroom-category">${esc(b.type).toUpperCase()} MOTORCYCLE</span><h3>${esc(b.name)}</h3><div class="showroom-price"><span>ASKING PRICE</span><strong>${money(b.price)}</strong></div>${detailSpecs(b)}<div class="showroom-card-bottom"><span>HEROES HILL · QUEZON CITY</span><button class="button" data-unit="${b.id}">EXPLORE UNIT <span>↗</span></button></div></div></article>`).join(''):`<div class="empty-state"><h3>${bikes.length?'No matching units.':'The garage is ready for its first listing.'}</h3><p>${bikes.length?'Try a different search or status filter.':'Contact us for current availability, or check back for newly added units.'}</p><a class="text-link" href="https://www.facebook.com/profile.php?id=100063721998692">ASK THE GARAGE →</a></div>`;
  grid.querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>showUnit(bikes.find(b=>b.id===Number(button.dataset.unit))));
 }
 document.querySelectorAll('.filters input,.filters select').forEach(input=>input.addEventListener('input',render));
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
   render();
  }catch(error){grid.innerHTML=`<div class="empty-state"><h3>Connect to the garage.</h3><p>${esc(error.message)}</p><button class="button" id="retry-inventory">RETRY</button></div>`;document.querySelector('#retry-inventory').onclick=load;}
 }
 load();
})();
