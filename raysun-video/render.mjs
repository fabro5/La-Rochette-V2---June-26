import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync, rmSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const OUT = process.argv[2] || 'raysun-clients.mp4';
const FFMPEG = process.env.FFMPEG || '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';

// Diapos : mettez les fichiers logos dans ./logos puis listez-les ici.
// {img: 'logos/xxx.png'} pour un fichier, {name: 'Texte'} pour un placeholder.
// La dernière entrée est le logo final (raysun), affiché plus longtemps.
const SLIDES = existsSync(path.join(__dirname, 'slides.json'))
  ? JSON.parse((await import('fs')).readFileSync(path.join(__dirname, 'slides.json'), 'utf8'))
  : [
      { name: 'Brasserie du Bocq' },
      { name: 'BuzzyPark' },
      { name: 'FICO Energy' },
      { name: 'RaYSun' },
    ];

const framesDir = path.join(__dirname, '.frames');
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(__dirname, 'template.html'));
await page.evaluate(s => window.setSlides(s), SLIDES);
await page.evaluate(() => document.fonts.ready);

const total = await page.evaluate(() => window.getTotal());
const nFrames = Math.ceil(total * FPS);
console.log(`Durée ${total.toFixed(2)}s — ${nFrames} images`);

for (let i = 0; i < nFrames; i++) {
  await page.evaluate(t => window.seek(t), i / FPS);
  await page.screenshot({ path: path.join(framesDir, `f_${String(i).padStart(5, '0')}.png`) });
  if (i % 60 === 0) console.log(`  image ${i}/${nFrames}`);
}
await browser.close();

execFileSync(FFMPEG, [
  '-y', '-framerate', String(FPS),
  '-i', path.join(framesDir, 'f_%05d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart',
  path.join(__dirname, OUT),
], { stdio: 'inherit' });

rmSync(framesDir, { recursive: true, force: true });
console.log('OK →', OUT);
