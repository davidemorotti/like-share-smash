// Two-phone test of shared police on the Firebase build: one phone runs the police, both see the same cops,
// cops take whoever they reach first, the other phone takes over, and barricades block until smashed.
// Plays without names, so nothing is written to Firestore. Usage: node police-test.mjs <chrome path>
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const chrome = process.argv[2];
const root = path.resolve('../game/web');
const hook = "  window.__g = { get world() { return world; }, get player() { return player; }, get mode() { return mode; }, get crew() { return crewCode; }, runsPolice: () => !policeHost(), lastEnd: () => lastEnd, shove: () => { const p = world.police.find(c => c.stun <= 0 && !c.leaving); if (!p) return null; shoveCop(p, player); return p.id; }, remotes: () => [...remotes.values()].map(r => ({ x: r.x, out: r.out, hk: r.hk })) };\n";
const anchor = "  newWorld(null); setMode('title');\n  requestAnimationFrame(frame);\n";
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!page.includes(anchor)) throw new Error('hook anchor not found');
const testPage = page.replace(anchor, anchor + hook);
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(testPage); return; }
  const f = path.join(root, req.url); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200); fs.createReadStream(f).pipe(res);
}).listen(8788);
const url = 'http://localhost:8788/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' :: ' + info : '')); };

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctxA = await browser.createBrowserContext(), ctxB = await browser.createBrowserContext();
const a = await ctxA.newPage(), b = await ctxB.newPage();
for (const [p, n] of [[a, 'A'], [b, 'B']]) {
  p.on('pageerror', e => console.log(n, 'pageerror', e.message));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
}
await Promise.all([a.goto(url, { waitUntil: 'networkidle2' }), b.goto(url, { waitUntil: 'networkidle2' })]);
await sleep(4000);

await a.evaluate(() => document.getElementById('bCrew').click());
await sleep(500);
const code = await a.$eval('#myCode', el => el.textContent.trim());
await a.evaluate(() => document.getElementById('bGo').click());
await sleep(5000);
await b.evaluate(c => { const i = document.getElementById('codeIn'); i.value = c; i.dispatchEvent(new Event('input')); document.getElementById('bJoin').click(); }, code);
await sleep(6000);
const g = (p, fn, arg) => p.evaluate(fn, arg);
check('Both play in the same crew', await g(a, () => window.__g.mode) === 'play' && await g(b, () => window.__g.mode) === 'play' && await g(a, () => window.__g.crew) === code, code);

const runA = await g(a, () => window.__g.runsPolice()), runB = await g(b, () => window.__g.runsPolice());
check('Exactly one phone runs the police', runA !== runB, `A=${runA} B=${runB}`);
const [runner, follower] = runA ? [a, b] : [b, a];

/* the follower makes the noise and stands still; the runner walks far ahead */
await g(runner, () => { window.__g.player.x += 40; });
let copsR = [], copsF = [];
for (let i = 0; i < 20 && !copsR.length; i++) {
  await g(follower, () => { window.__g.world.heat = 96; }); await sleep(400);
  copsR = await g(runner, () => window.__g.world.police.map(p => ({ id: p.id, x: p.x })));
  copsF = await g(follower, () => window.__g.world.police.map(p => ({ id: p.id, x: p.x })));
}
await sleep(1000);
copsR = await g(runner, () => window.__g.world.police.map(p => ({ id: p.id, x: p.x })));
copsF = await g(follower, () => window.__g.world.police.map(p => ({ id: p.id, x: p.x })));
const same = copsR.length > 0 && copsR.every(c => { const f = copsF.find(q => q.id === c.id); return f && Math.abs(f.x - c.x) < 3; });
const shoved = await g(follower, () => window.__g.shove());
await sleep(1200);
const stunned = shoved != null && await g(runner, id => { const p = window.__g.world.police.find(c => c.id === id); return !!p && p.stun > 0; }, shoved);
check('A friend\'s shove knocks the cop down for everyone', stunned, 'cop ' + shoved);
check('Both phones see the same cops', same, `runner ${JSON.stringify(copsR.map(c => [c.id, Math.round(c.x)]))} follower ${JSON.stringify(copsF.map(c => [c.id, Math.round(c.x)]))}`);

let caught = false;
for (let i = 0; i < 30 && !caught; i++) { await g(follower, () => { window.__g.world.heat = 96; }); await sleep(500); caught = await g(follower, () => window.__g.mode) === 'over'; }
check('The cops take the player they reach first', caught && await g(follower, () => window.__g.lastEnd()) === 'caught' && await g(runner, () => window.__g.mode) === 'play', 'follower ' + await g(follower, () => window.__g.mode));
await sleep(1500);
check('The free player runs the police now', await g(runner, () => window.__g.runsPolice()) === true);
check('The free player sees the friend as out', (await g(runner, () => window.__g.remotes()))[0]?.out === true);

/* barricade: both phones have it in the same place, it blocks, and breaking it shows up for the other phone */
const barR = await g(runner, () => { const o = window.__g.world.objects.find(o => o.type === 'barricade' && !o.broken && o.x > window.__g.player.x); return o && { id: o.id, x: o.x }; });
check('A barricade lies ahead', !!barR, JSON.stringify(barR));
if (barR) {
  await g(runner, x => { window.__g.world.heat = 0; window.__g.world.police.forEach(p => { p.leaving = true; }); window.__g.player.x = x - 3; }, barR.x);
  await g(runner, () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  await sleep(2500);
  const px = await g(runner, () => window.__g.player.x);
  check('The barricade blocks the way', px <= barR.x - .2, `player ${px.toFixed(2)} barricade ${barR.x.toFixed(2)}`);
  for (let i = 0; i < 40; i++) {
    await g(runner, () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
    await sleep(130);
    await g(runner, () => { document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); });
    await sleep(130);
    if (await g(runner, id => window.__g.world.byId.get(id).broken, barR.id)) break;
  }
  await sleep(2500);
  const px2 = await g(runner, () => window.__g.player.x);
  check('Smashed, the way is open', await g(runner, id => window.__g.world.byId.get(id).broken, barR.id) && px2 > barR.x, `player ${px2.toFixed(2)}`);
  await g(runner, () => document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })));
  const seen = await g(follower, id => { const o = window.__g.world.byId.get(id); return o ? o.broken : 'not generated'; }, barR.id);
  check('The friend sees the barricade broken', seen === true || seen === 'not generated', String(seen));
}
await a.screenshot({ path: 'police-a.png' }); await b.screenshot({ path: 'police-b.png' });
await browser.close();
server.close();
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
