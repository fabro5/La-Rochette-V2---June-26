// Sert _staging/ comme le fait GitHub Pages (repli 404.html) puis charge
// les pages du site dans Chromium pour vérifier qu'aucun asset ne manque.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..', '_staging');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.xml': 'application/xml' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  let file = join(ROOT, path === '/' ? 'index.html' : path);
  let status = 200;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    await stat(file);
  } catch {
    file = join(ROOT, '404.html');   // repli SPA, comme GitHub Pages
    status = 404;
  }
  const body = await readFile(file);
  res.writeHead(status, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(body);
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch();
const problems = [];
for (const route of ['/', '/reservation', '/en']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('response', (r) => {
    // GitHub Pages renvoie 404.html avec un statut 404 sur les routes du SPA :
    // c'est le fonctionnement attendu, seuls les assets manquants comptent.
    if (r.status() >= 400 && r.request().resourceType() !== 'document') {
      problems.push(`${route} -> ${r.status()} ${new URL(r.url()).pathname}`);
    }
  });
  page.on('pageerror', (e) => problems.push(`${route} -> erreur JS : ${e.message}`));
  await page.goto(`http://localhost:4173${route}`, { waitUntil: 'networkidle' });
  const shot = `/tmp/claude-0/-home-user-La-Rochette-V2---June-26/c97f3f87-006b-561a-8f9e-683fcd99f30f/scratchpad/staging${route.replace(/\W/g, '_')}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  const imgs = await page.evaluate(() => {
    const all = [...document.querySelectorAll('img')];
    return { total: all.length, broken: all.filter((i) => i.complete && i.naturalWidth === 0).length };
  });
  const title = await page.title();
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 90);
  console.log(`${route}\n  titre   : ${title}\n  images  : ${imgs.total} (${imgs.broken} cassées)\n  contenu : ${text}…\n  capture : ${shot}`);
  if (imgs.broken > 0) problems.push(`${route} -> ${imgs.broken} image(s) cassée(s)`);
  await page.close();
}
await browser.close();
server.close();

// Les scripts d'analytics Lovable pointent vers un domaine externe : hors sujet ici.
const real = problems.filter((p) => !/events\.js|flock|lovable\.dev|analytics/i.test(p));
console.log(real.length ? `\nPROBLÈMES :\n${real.map((p) => ' - ' + p).join('\n')}` : '\nAucun problème détecté.');
process.exit(real.length ? 1 : 0);
