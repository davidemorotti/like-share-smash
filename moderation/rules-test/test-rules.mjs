// Runs backend/firestore.rules in the Firestore emulator: bad nicknames are refused, ordinary ones are claimed,
// and Trending only takes a player's own, clean name. Usage: npm test (needs Java)
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, runTransaction, setDoc, serverTimestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-lss', firestore: { rules: fs.readFileSync(new URL('../../backend/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 } });
const nameKey = n => String(n).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 32);
let n = 0, fail = 0;
/* the same transaction the web build runs to claim a name */
const claim = (name, key = nameKey(name)) => {
  const db = env.authenticatedContext('u' + (++n)).firestore();
  return runTransaction(db, async tx => { tx.set(doc(db, 'names', key), { uid: 'u' + n, name, at: serverTimestamp() }); tx.set(doc(db, 'owners', 'u' + n), { key }); });
};
const expect = async (label, p, ok) => {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); } catch (e) { fail++; console.log('WRONG', label, '::', String(e.message).slice(0, 160)); }
};

/* the rules cannot fold accents or undo stretched letters, so these are the plain and leetspeak spellings */
for (const name of ['fuck', 'KevFuck', 'f_u_c_k', 'sh1t', 'c0nnard', 'encule', 'fils de pute', 'ntm93', 'cazzo', 'porcodio', 'caralho', 'kanker', 'hurensohn', 'gilipollas', 'qifsha', 'n1gga', 'hitler', '1488', 'admin', 'moderator']) {
  await expect('refuse ' + name, claim(name), false);
}
/* a clean key cannot smuggle in a bad display name */
await expect('refuse bad name under a clean key', claim('fuck you', 'nice-name'), false);
for (const name of ['kev_2011', 'smashley', 'noemi.mp4', 'Davide Morotti', 'Karim', 'Raphaël', 'Assunta', 'Scunthorpe', 'Cassandra', 'Matteo', 'Fjolla', 'Analisa', 'Badminton', 'Nigel', 'as_roma']) {
  await expect('claim ' + name, claim(name), true);
}
/* Trending: the name on the row must be the player's own clean name */
const db = env.authenticatedContext('trend').firestore();
await assertSucceeds(runTransaction(db, async tx => { tx.set(doc(db, 'names', 'trendy'), { uid: 'trend', name: 'trendy', at: serverTimestamp() }); tx.set(doc(db, 'owners', 'trend'), { key: 'trendy' }); }));
await expect('board with own name', setDoc(doc(db, 'board', 'trend'), { name: 'trendy', owed: 1, deeds: 1, views: 1, runs: 1, best: 1, at: serverTimestamp() }), true);
await expect('board with a bad name', setDoc(doc(db, 'board', 'trend'), { name: 'shithead', owed: 1, deeds: 1, views: 1, runs: 1, best: 1, at: serverTimestamp() }), false);

await env.cleanup();
console.log(fail ? `${fail} rule check(s) wrong` : 'all rule checks passed');
process.exitCode = fail ? 1 : 0;
