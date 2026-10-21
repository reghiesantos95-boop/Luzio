const menu = document.querySelector('.menu');
const navigation = document.querySelector('#navigation');
menu.addEventListener('click', () => {
  const open = navigation.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
function closeMenu() {
  navigation.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Open navigation');
}
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('open')) {
    closeMenu();
    menu.focus();
  }
});
let currentPage = 'home';
let pageAnimation;
const pageMotion = matchMedia('(prefers-reduced-motion: reduce)');
pageMotion.addEventListener('change', () => {
  if (pageMotion.matches) pageAnimation?.cancel();
});
function renderPage(moveToPage = true) {
  const route = location.hash.slice(1).split('?')[0] || 'home';
  const page = route === 'inquiry' ? 'contact' : route === 'main' ? currentPage : ['home','inventory','financing','contact'].includes(route) ? route : 'home';
  const previousPage = currentPage;
  currentPage = page;
  pageAnimation?.cancel();
  document.querySelectorAll('main > section[id]').forEach(section => {
    section.hidden = section.id !== page && !(section.id === 'inquiry' && page === 'contact');
  });
  document.querySelector('.location-strip').hidden = page !== 'home';
  navigation.querySelectorAll('a').forEach(link => {
    const active = link.hash === '#' + page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const names = {home:'Home',inventory:'Inventory',financing:'Financing',contact:'Contact'};
  document.title = names[page] + ' | Luzio Garage Trading';
  closeMenu();
  if (moveToPage) {
    if (route === 'inquiry') document.querySelector('#inquiry')?.scrollIntoView({behavior:'instant',block:'start'});
    else window.scrollTo({top:0,behavior:'instant'});
    const heading = document.querySelector('#' + (route === 'inquiry' ? 'inquiry' : page) + ' h1, #' + (route === 'inquiry' ? 'inquiry' : page) + ' h2');
    if (heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); }
  }
  if (moveToPage && page !== previousPage && !pageMotion.matches) {
    const order = ['home','inventory','financing','contact'];
    const direction = order.indexOf(page) > order.indexOf(previousPage) ? 1 : -1;
    pageAnimation = document.querySelector('main').animate([
      {opacity:0,transform:`translateX(${direction * 36}px)`},
      {opacity:1,transform:'translateX(0)'}
    ], {duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
  }
}
window.addEventListener('hashchange', () => renderPage());
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  if (link.hash === location.hash) { event.preventDefault(); renderPage(); }
});
renderPage(false);
document.querySelector('#year').textContent = new Date().getFullYear();

// A short brand reveal on a fresh home visit. Anchor links stay immediate.
function playGarageIntro() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || (location.hash && location.hash !== '#home')) return;
  const intro = document.createElement('dialog');
  intro.className = 'garage-intro';
  intro.setAttribute('aria-label', 'Welcome to Luzio Garage Trading');
  intro.innerHTML = `<div class="garage-door door-left" aria-hidden="true"></div><div class="garage-door door-right" aria-hidden="true"></div><div class="intro-horizon" aria-hidden="true"></div><div class="garage-intro-content"><span class="garage-intro-kicker">QUEZON CITY · PHILIPPINES</span><div class="garage-intro-logo"><img src="assets/luzio-logo.png" alt="Luzio Garage"></div><p class="garage-intro-heading">YOUR NEXT <span>RIDE.</span></p><p class="garage-intro-signature">STARTS AT LUZIO GARAGE TRADING</p><div class="garage-intro-progress" aria-hidden="true"><span></span></div></div><span class="garage-intro-corner" aria-hidden="true">WELCOME TO THE GARAGE</span><button class="garage-intro-skip" type="button" autofocus>SKIP INTRO ↗</button>`;
  document.body.append(intro);
  const previousFocus = document.activeElement;
  document.body.classList.add('garage-intro-active');
  let timer, finished = false;
  const finish = (userSkipped = false) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    intro.close();
    intro.remove();
    document.body.classList.remove('garage-intro-active');
    document.querySelector('.hero').classList.add('garage-hero-arrive');
    if (previousFocus && previousFocus !== document.body && previousFocus.isConnected) previousFocus.focus({preventScroll:true});
    else if (userSkipped) document.querySelector('.hero .button').focus({preventScroll:true});
  };
  intro.querySelector('button').addEventListener('click', () => finish(true));
  intro.addEventListener('cancel', event => { event.preventDefault(); finish(true); });
  intro.addEventListener('animationend', event => {
    if (event.target === intro && event.animationName === 'garage-intro-exit') finish();
  });
  try { intro.showModal(); timer = setTimeout(finish, 3700); }
  catch { finish(); }
}
playGarageIntro();
