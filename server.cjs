const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const { createApi } = require('./backend.cjs');
const api = createApi(process.env.LUZIO_DATA_DIR || path.join(root, 'data'));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
http.createServer((req, res) => {
  let route;
  try { route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end('Bad request'); }
  if (route.startsWith('/api/')) return api(req, res, route);
  if (/^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(route)) {
    const file=path.join(process.env.LUZIO_DATA_DIR||path.join(root,'data'),route.slice(1));
    return fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':route.endsWith('.png')?'image/png':route.endsWith('.webp')?'image/webp':'image/jpeg','X-Content-Type-Options':'nosniff'});res.end(data);});
  }
  if (route === '/admin') route = '/admin.html';
  if (route === '/account') route = '/account.html';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  const file = path.resolve(root, '.' + (route === '/' ? '/index.html' : route));
  const allowed = ['index.html', 'styles.css', 'app.js', 'features.js', 'admin.html', 'admin.js', 'account.html', 'account.js', 'conversation-ui.js', path.join('assets', 'luzio-logo.png'), path.join('assets', 'ducati-panigale-v4s.png')];
  if (!allowed.includes(path.relative(root, file))) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}).listen(Number(process.env.PORT) || 4174, '127.0.0.1', () => {
  api.startBackups();
  console.log('Luzio Garage Trading: http://127.0.0.1:' + (process.env.PORT || 4174));
  if (!api.hasAdmin()) console.log('Admin setup code (enter at /admin): ' + api.setupCode);
});
