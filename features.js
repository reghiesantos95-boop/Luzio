(() => {
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(v);
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
 const calculator=document.createElement('div');calculator.className='calculator';
 calculator.innerHTML=`<h3>Monthly payment estimator</h3><p>Enter a lender’s quoted annual rate to explore an estimate. These are your inputs, not Luzio financing terms or an approval.</p><form id="estimate-form" class="form-grid"><label>Unit price (₱)<input name="price" type="number" min="1" max="100000000" step="1" required></label><label>Down payment (₱)<input name="down" type="number" min="0" step="1" value="0" required></label><label>Term (months)<input name="months" type="number" min="1" max="120" step="1" value="36" required></label><label>Annual interest rate (%)<input name="rate" type="number" min="0" max="100" step="0.01" required placeholder="Enter quoted rate"></label><div class="full"><button class="button" type="submit">CALCULATE ESTIMATE</button><p id="estimate-result" role="status"></p></div></form><p>Uses reducing-balance amortization. Fees, insurance, and lender-specific charges are excluded; actual terms may differ.</p><a class="text-link" href="#inquiry" id="finance-inquiry">ASK ABOUT FINANCING →</a>`;
 document.querySelector('#financing').append(calculator);
 function chooseInquiry(bike,kind='unit'){
  form.elements.kind.value=kind;form.elements.bikeId.value=bike?.id||'';
  if(bike)form.elements.message.value=`Hi, I’m interested in the ${bike.year} ${bike.name}. Is it available?`;
  if(dialog.open)dialog.close();location.hash='inquiry';renderPage();form.elements.name.focus({preventScroll:true});
 }
 document.querySelector('#finance-inquiry').onclick=()=>{form.elements.kind.value='financing';};
 document.querySelector('#estimate-form').onsubmit=e=>{
  e.preventDefault();const data=new FormData(e.target);const price=Number(data.get('price')),down=Number(data.get('down')),months=Number(data.get('months')),rate=Number(data.get('rate'))/1200;
  if(down>=price){document.querySelector('#estimate-result').textContent='Down payment must be less than the unit price.';return;}
  const principal=price-down,payment=rate===0?principal/months:principal*rate/(1-Math.pow(1+rate,-months));
  document.querySelector('#estimate-result').textContent=`Estimated ${money(payment)}/month · Loan principal ${money(principal)} · Total interest ${money(payment*months-principal)} · Total including down payment ${money(payment*months+down)}.`;
 };
 function showUnit(bike){
  dialog.innerHTML=`<button class="close-dialog" aria-label="Close unit details">×</button><div class="unit-placeholder"><span>LUZIO GARAGE</span><small>PHOTOS COMING SOON</small></div><p class="tag">${esc(bike.status.toUpperCase())}</p><h2>${esc(bike.name)}</h2><p>${esc(bike.brand)} · ${esc(bike.type)} · ${bike.year} · ${Number(bike.mileage).toLocaleString()} km</p><h3>${money(bike.price)}</h3><p class="unit-description">${esc(bike.description||'Contact the garage for further details and viewing arrangements.')}</p><div class="actions">${bike.status==='available'?'<button class="button inquire-unit">INQUIRE ABOUT THIS UNIT ↗</button>':'<p>This unit is '+esc(bike.status)+'. Contact us for alternatives.</p>'}<a class="text-link" href="tel:+639273046604">CALL THE GARAGE ↗</a></div>`;
  dialog.querySelector('.close-dialog').onclick=()=>dialog.close();dialog.querySelector('.inquire-unit')?.addEventListener('click',()=>chooseInquiry(bike));dialog.showModal();
 }
 function render(){
  const search=document.querySelector('#unit-search').value.trim().toLowerCase(),brand=document.querySelector('#brand-filter').value,status=document.querySelector('#status-filter').value,sort=document.querySelector('#sort-filter').value;
  const list=bikes.filter(b=>(!brand||b.brand===brand)&&(!status||b.status===status)&&`${b.name} ${b.brand} ${b.type}`.toLowerCase().includes(search));
  list.sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:sort==='year'?b.year-a.year:b.id-a.id);
  document.querySelector('#inventory-count').textContent=`${list.length} unit${list.length===1?'':'s'} found`;
  const grid=document.querySelector('#unit-grid');
  grid.innerHTML=list.length?list.map(b=>`<article class="unit-card"><div class="unit-placeholder"><span>LUZIO GARAGE</span><small>PHOTOS COMING SOON</small></div><div class="unit-card-body"><span class="tag">${esc(b.status.toUpperCase())}</span><h3>${esc(b.name)}</h3><p>${esc(b.brand)} · ${esc(b.type)}<br>${b.year} · ${Number(b.mileage).toLocaleString()} km</p><strong>${money(b.price)}</strong><button class="button" data-unit="${b.id}">VIEW UNIT ↗</button></div></article>`).join(''):`<div class="empty-state"><h3>${bikes.length?'No matching units.':'The garage is ready for its first listing.'}</h3><p>${bikes.length?'Try a different search or status filter.':'Contact us for current availability, or check back for newly added units.'}</p><a class="text-link" href="#inquiry">ASK THE GARAGE →</a></div>`;
  grid.querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>showUnit(bikes.find(b=>b.id===Number(button.dataset.unit))));
 }
 document.querySelectorAll('.filters input,.filters select').forEach(input=>input.addEventListener('input',render));
 form.onsubmit=async e=>{
  e.preventDefault();const result=document.querySelector('#inquiry-result'),button=form.querySelector('button');button.disabled=true;result.textContent='Sending…';
  try{const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});const data=await response.json();if(!response.ok)throw Error(data.error);result.textContent=`Inquiry #${data.id} saved. The garage can view it in the admin inbox. For an urgent response, call 0927 304 6604.`;form.reset();}
  catch(error){result.textContent='Could not send: '+(location.protocol==='file:'?'Start the local server with npm start, then open http://127.0.0.1:4174.':error.message);}
  finally{button.disabled=false;}
 };
 async function load(){
  const grid=document.querySelector('#unit-grid');grid.textContent='Loading inventory…';
  try{if(location.protocol==='file:')throw Error('For live inventory and forms, run npm start and open http://127.0.0.1:4174.');const response=await fetch('/api/bikes');if(!response.ok)throw Error('Inventory unavailable.');bikes=await response.json();
   document.querySelector('#brand-filter').innerHTML='<option value="">All brands</option>'+[...new Set(bikes.map(b=>b.brand))].sort().map(b=>`<option>${esc(b)}</option>`).join('');
   form.elements.bikeId.innerHTML='<option value="">No specific unit</option>'+bikes.filter(b=>b.status==='available').map(b=>`<option value="${b.id}">${esc(b.name)} (${b.year})</option>`).join('');render();
  }catch(error){grid.innerHTML=`<div class="empty-state"><h3>Connect to the garage.</h3><p>${esc(error.message)}</p><button class="button" id="retry-inventory">RETRY</button></div>`;document.querySelector('#retry-inventory').onclick=load;}
 }
 load();
})();
