// Builds game/web/index.html: the standalone game for davidemorotti.com, wired to the self-hosted Supabase backend.
// Usage: FIREBASE_CONFIG='{"apiKey":...}' node make-web-build.mjs   (or SUPABASE_URL + SUPABASE_ANON_KEY)
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');
const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : null;
const url = process.env.SUPABASE_URL || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';
const adapter = fs.readFileSync(new URL(firebaseConfig ? '../backend/firebase-adapter.js' : '../backend/supabase-adapter.js', import.meta.url), 'utf8');

const swaps = [
  ["const use = name => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null);",
    "const use = name => (window.__lssBackend ? window.__lssBackend.use(name).catch(() => null) : Promise.resolve(null));"],
  ["Playing with friends works when the game is opened on claude.ai while signed in.", 'Playing with friends is offline right now. Solo play still works.'],
  ["Start a crew, then give friends the code. They need access to this page on claude.ai.", 'Start a crew, then send your friends the code.'],
  ["Unique names and the leaderboard work when the game is opened on claude.ai while signed in.", 'Names and Trending are offline right now. Solo play still works.'],
  ["Sign in to claude.ai to claim a name and join the leaderboard.", 'Names and Trending are offline right now. Solo play still works.'],
  ["Trending works when the game is opened on claude.ai while signed in.", 'Trending is offline right now.'],
  ["Could not save the name. Ask the owner for Contributor access to this page.", 'Could not save the name. Try again in a moment.'],
  ["Your score could not be saved. Ask the owner for Contributor access to this page.", 'Your score could not be saved this time.'],
  ['This viewer cannot join crews here. Solo play still works.', 'Crews are offline right now. Solo play still works.'],
];
let out = game;
for (const [a, b] of swaps) {
  if (!out.includes(a)) throw new Error('anchor not found: ' + a.slice(0, 70));
  out = out.split(a).join(b);
}
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const sdk = firebaseConfig
  ? ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js', 'firebase-database-compat.js'].map(f => `<script src="${FB}${f}"></script>`).join('\n') + `\n<script>window.LSS_FIREBASE = ${JSON.stringify(firebaseConfig)};</script>`
  : `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>\n<script>window.LSS_SUPABASE = ${JSON.stringify({ url, anonKey })};</script>`;
const backendScripts = `${sdk}
<script>
${adapter}
</script>
`;
const anchor = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
if (!out.includes(anchor)) throw new Error('three.js anchor not found');
out = out.replace(anchor, backendScripts + anchor);

const SITE = 'https://davidemorotti.com/4/';
const DESC = 'A free browser game about bored teenagers rioting for views. You smash, your mates film, and every broken window prints a bill your generation pays at 18. Play solo or with friends.';
const jsonLd = { "@context": "https://schema.org", "@type": "VideoGame", name: "Like, Share, Smash", url: SITE, description: DESC, image: SITE + "og.jpg", genre: ["Satire", "Action", "Browser game"], gamePlatform: "Web browser", applicationCategory: "Game", operatingSystem: "Any", playMode: ["SinglePlayer", "MultiPlayer"], inLanguage: "en", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" }, author: { "@type": "Person", name: "Davide Morotti", url: "https://davidemorotti.com/" }, datePublished: "2026-10-20" };
const head = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${DESC}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${SITE}">
<meta name="author" content="Davide Morotti">
<meta name="theme-color" content="#2a2228">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Davide Morotti">
<meta property="og:title" content="Like, Share, Smash · a protest against nothing in particular">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${SITE}">
<meta property="og:image" content="${SITE}og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Like, Share, Smash: a dithered city street, a burning car and a Writ of Future Debt for 13 245 euros">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Like, Share, Smash">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="${SITE}og.jpg">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<!-- Privacy-friendly analytics by Plausible -->
<script async src="https://analytics.ampsand.ch/js/pa-ksRamlsEIi9zimtWGqCC9.js"></script>
<script>
  window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
  plausible.init()
</script>
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
<noscript><h1>Like, Share, Smash</h1><p>${DESC}</p><p>This game needs JavaScript and WebGL.</p></noscript>
`;
fs.mkdirSync(new URL('../game/web/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../game/web/index.html', import.meta.url), head + out + '\n</body></html>\n');
console.log('wrote game/web/index.html', firebaseConfig ? `(firebase: ${firebaseConfig.projectId})` : url ? `(supabase: ${url})` : '(no backend configured: solo only)');
