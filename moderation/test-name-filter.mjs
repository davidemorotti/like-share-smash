// Checks the nickname filter in game/index.html: bad names are caught, ordinary names pass.
// Usage: node test-name-filter.mjs
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');
const start = src.indexOf('  /* name-filter:start'), end = src.indexOf("  const BAD_NAME");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src.slice(start, end) + '\nthis.isBadName = isBadName;', ctx);
const { isBadName } = ctx;

const bad = [
  'fuck', 'KevFuck', 'f_u_c_k', 'F.U.C.K', 'fuuuuck', 'phuck', 'sh1t', 'b1tch', 'a$$hole', 'c0nnard', 'conn4rd', 'enculé', 'ENCULE', 'fils de pute', 'filsdepute',
  'nique ta mere', 'ntm93', 'zebi', 'salope', 'putain', 'pd', 'batard', 'sharmouta', 'kahba', 'orospu', 'siktir', 'amk',
  'cazzo', 'stronzo', 'vaffanculo', 'porcodio', 'troia', 'minchia', 'coglione', 'frocio', 'pirlone'.replace('pirlone', 'puttana'),
  'caralho', 'porra', 'filho da puta', 'paneleiro', 'merda', 'kanker', 'klootzak', 'kut', 'tering', 'hoer', 'godverdomme',
  'hurensohn', 'wichser', 'arschloch', 'fotze', 'gilipollas', 'hijo de puta', 'maricon', 'coño', 'pendejo',
  'qifsha', 'pidh', 'kurva', 'lavire', 'nigger', 'n1gga', 'hitler', 'heil hitler', '1488', 'kkk', 'nazi_boy', 'admin', 'Moderator', 'official',
];
const good = [
  'kev_2011', 'Davide Morotti', 'smashley', 'noemi.mp4', 'tiz_the_torch', 'bin_there', 'ricardo.live', 'lyon_lad', 'Davide', 'stiuis', 'JonnymcMail', 'mel', 'Pugi', 'krizon', 'hakfb',
  'Lucas', 'Hugo', 'Louis', 'Gabriel', 'Arthur', 'Jules', 'Adam', 'Raphaël', 'Léo', 'Nathan', 'Mohamed', 'Yanis', 'Rayan', 'Ilyes', 'Wassim', 'Bilal', 'Karim', 'Mehdi', 'Sofiane', 'Nassim',
  'Emma', 'Jade', 'Louise', 'Alice', 'Chloé', 'Inès', 'Léa', 'Manon', 'Camille', 'Sarah', 'Yasmine', 'Lina', 'Nour', 'Aïcha', 'Fatima', 'Claude', 'Pascal', 'Dominique', 'Benoît', 'Anaïs',
  'Noah', 'Liam', 'Milan', 'Lars', 'Daan', 'Sem', 'Finn', 'Jens', 'Pieter', 'Wout', 'Bram', 'Lotte', 'Fien', 'Saar', 'Noor', 'Femke', 'Lieve', 'Hanne', 'Elke', 'Joke',
  'Leonardo', 'Francesco', 'Alessandro', 'Lorenzo', 'Mattia', 'Andrea', 'Gabriele', 'Riccardo', 'Tommaso', 'Edoardo', 'Matteo', 'Giulia', 'Sofia', 'Aurora', 'Ginevra', 'Beatrice', 'Assunta', 'Raffaele', 'Concetta', 'Fabrizio', 'Cosimo', 'Nicola', 'Analisa',
  'João', 'Rodrigo', 'Martim', 'Afonso', 'Tomás', 'Duarte', 'Gonçalo', 'Santiago', 'Leonor', 'Matilde', 'Beatriz', 'Carolina', 'Mariana', 'Inês', 'Pinto', 'Conceição',
  'Ardit', 'Arbër', 'Besnik', 'Dritan', 'Erion', 'Florian', 'Gentian', 'Ilir', 'Kujtim', 'Luan', 'Mergim', 'Arta', 'Blerta', 'Drita', 'Elira', 'Fjolla', 'Jehona', 'Kaltrina', 'Teuta', 'Vjosa', 'Karadaku',
  'Cassandra', 'Dickson', 'Hancock', 'Sussex', 'Scunthorpe', 'Matsushita', 'Shitaye', 'Titus', 'Butterfield', 'Assange', 'Grape', 'Therapist', 'Peacock', 'Cockburn', 'Arsenal', 'Shuttlecock',
  'Charlotte', 'Pascale', 'Concha', 'Nigel', 'Niger', 'Analytic', 'Mississippi', 'Hello Kitty', 'Pussycat Doll', 'pommes frites', 'la_squadra', 'el_capitan', 'roma_ultras', 'boss', 'as_roma', 'Badminton', 'Supporter', 'Retardant', 'Clasp', 'Classic',
];
let fail = 0;
bad.forEach(n => { if (!isBadName(n)) { fail++; console.log('MISSED  ', n); } });
good.forEach(n => { if (isBadName(n)) { fail++; console.log('BLOCKED ', n); } });
console.log(`${bad.length} bad names, ${good.length} ordinary names, ${fail} wrong`);
if (process.argv[2] === '--dict') {
  const dict = fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter(w => w.length >= 4);
  const hit = dict.filter(w => isBadName(w));
  console.log(`dictionary: ${hit.length} of ${dict.length} English words blocked (${(hit.length / dict.length * 100).toFixed(2)}%), e.g. ${hit.filter((w, i) => i % Math.max(1, Math.floor(hit.length / 40)) === 0).slice(0, 40).join(' ')}`);
}
process.exitCode = fail ? 1 : 0;
