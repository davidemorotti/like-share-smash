// Two-player test of the Firebase build: unique names, crew join/presence, Trending write/read.
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const chrome = process.argv[2];
const root = path.resolve('../game/web');
const server = http.createServer((req, res) => { const f = path.join(root, req.url === '/' ? 'index.html' : req.url); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(f).pipe(res); }).listen(8787);
const url = 'http://localhost:8787/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' :: ' + info : '')); };

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctxA = await browser.createBrowserContext(), ctxB = await browser.createBrowserContext();
const a = await ctxA.newPage(), b = await ctxB.newPage();
for (const p of [a, b]) { p.on('pageerror', e => console.log('pageerror', e.message)); p.on('console', m => { if (/\[lss\]|error/i.test(m.text())) console.log('console', m.text()); }); await p.setViewport({ width: 1280, height: 800 }); }
await Promise.all([a.goto(url, { waitUntil: 'networkidle2' }), b.goto(url, { waitUntil: 'networkidle2' })]);
await sleep(4000);

const nick = 'tester' + Math.random().toString(36).slice(2, 6);
const typeNick = async (p, n) => { await p.click('#nickIn', { clickCount: 3 }); await p.type('#nickIn', n); await sleep(1500); };

await typeNick(a, nick);
await a.$eval('#nickIn', el => el.blur());
await sleep(3000);
const noteA = await a.$eval('#nickNote', el => el.textContent);
check('A claims a unique name', /yours/i.test(noteA), noteA);

await typeNick(b, nick);
await sleep(2000);
const noteB = await b.$eval('#nickNote', el => el.textContent);
check('B sees the name as taken', /taken/i.test(noteB), noteB);
await typeNick(b, nick + 'b');
await b.$eval('#nickIn', el => el.blur());
await sleep(3000);
check('B claims a different name', /yours/i.test(await b.$eval('#nickNote', el => el.textContent)));

await typeNick(b, nick + 'c');
await b.$eval('#nickIn', el => el.blur());
await sleep(3000);
const released = await b.evaluate(async k => { const db = await window.__lssBackend.use('db'); return (await db.doc('names/' + k).get()).exists; }, nick + 'b');
check('Renaming releases the old name (one name per player)', released === false, 'old name exists: ' + released);
const fakeName = await b.evaluate(async () => { const db = await window.__lssBackend.use('db'); const u = await window.__lssBackend.use('user'); const uid = await u.id(); try { await db.doc('board/' + uid).set({ name: 'notmine', owed: 1, deeds: 1, views: 1, runs: 1, best: 1 }); return 'allowed'; } catch (e) { return 'denied'; } });
check('Trending refuses a name the player does not own', fakeName === 'denied', fakeName);

const crewEnabled = await a.$eval('#bCrew', el => !el.disabled);
check('Crews are online', crewEnabled, await a.$eval('#mpNote', el => el.textContent));
await a.click('#bCrew');
await sleep(500);
const code = await a.$eval('#myCode', el => el.textContent.trim());
await a.click('#bGo');
await sleep(7000);
const listed = await b.$eval('#crewList', el => el.textContent);
check('B sees A\'s crew in the lobby list', listed.includes(code), listed.slice(0, 80));
await b.type('#codeIn', code);
await b.click('#bJoin');
await sleep(6000);
const playersA = await a.$eval('#hPlayers', el => el.textContent.trim());
const playersB = await b.$eval('#hPlayers', el => el.textContent.trim());
check('Both see 2 players in the crew', playersA === '2' && playersB === '2', `A=${playersA} B=${playersB}`);

const board = await a.evaluate(async n => {
  const db = await window.__lssBackend.use('db');
  const user = await window.__lssBackend.use('user');
  const uid = await user.id();
  await db.doc('board/' + uid).set({ name: n, owed: 1234, deeds: 3, views: 98765, runs: 1, best: 1234 });
  return await new Promise(res => { const un = db.collection('board').orderBy('views', 'desc').limit(50).onSnapshot(s => { un(); res(s.docs.map(d => d.data().name)); }, e => res('error ' + e.message)); });
}, nick);
check('Trending write and read', Array.isArray(board) && board.includes(nick), JSON.stringify(board).slice(0, 120));

const forged = await b.evaluate(async () => {
  const db = await window.__lssBackend.use('db');
  try { await db.doc('board/someone-else').set({ name: 'x', owed: 1, deeds: 1, views: 1, runs: 1, best: 1 }); return 'allowed'; } catch (e) { return 'denied'; }
});
check('Writing someone else\'s score is denied', forged === 'denied', forged);

await browser.close();
server.close();
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
