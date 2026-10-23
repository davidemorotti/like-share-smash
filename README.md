# LIKE, SHARE, SMASH 📱🔥

> **The world's first riot simulator where the real damage is to your future.**

**Play it free in your browser: [davidemorotti.com/4](https://davidemorotti.com/4/)**

## What Is This? 🤔

You are a teenager. You have a phone, a street full of bus shelters, and an urgent need for views. Smash things, film it, go viral. Every deed prints a **Writ of Future Debt**: the exact bill your generation pays back when it turns 18. The views are temporary. The invoice is not.

It's a satire about doing stupid things for an algorithm that forgets you by Tuesday.

## Features Nobody Asked For ✨

- 🏙️ **A 3D city rendered tiny and dithered into dots**, because 4K riots are tacky
- 🧾 **Itemised debt receipts** for every bin, window and car, with interest
- 👮 **Shared police**: in a crew, the cops arrest whoever they reach first. Choose your friends wisely
- 🚧 **Police lines** that block the street until you smash through (one hit, we're not monsters)
- 🚓 **Patrol cars** with red and blue lights and sirens, just driving by, judging you
- 👯 **Crews**: share a code and riot with friends in real time
- 📈 **Trending**: a global leaderboard of who owes the most. Congratulations?
- 🙈 **"Logged off" shame screen** for quitters with low engagement
- 🤬 **A bad-word filter in 10+ languages** with no AI, just regex and disappointment

## How It Was Made 🤖

I wrote the notes ("too dark", "hold the phone like you're filming, not serving food"). Claude, an AI, wrote the code. About 40 notes and a few thousand lines later, here we are. Directed by a human, typed by a machine.

## What's in the Box 📦

| Folder | What lives there |
| --- | --- |
| `game/index.html` | The whole game in one HTML file: three.js, shaders, Web Audio, the lot |
| `game/web/` | The standalone web build, wired to Firebase (generated, don't edit) |
| `game/audio`, `game/assets` | Crowd recording and the Departure Mono font |
| `backend/` | Firebase adapter and security rules (Realtime Database for crews, Firestore for names and Trending) |
| `moderation/` | The nickname filter: word lists, build script and tests |
| `tools/` | The web build script and two-phone multiplayer tests |

## Running It Locally 🚀

```bash
git clone https://github.com/davidemorotti/like-share-smash.git
cd like-share-smash

# Just play (solo works offline, crews and Trending need Firebase)
npx serve game/web
```

### Building the web version against your own Firebase

```bash
cd tools
FIREBASE_CONFIG="$(cat ../backend/firebase-config.json)" node make-web-build.mjs
```

Swap `backend/firebase-config.json` for your own project's web config (it's public by design, the rules do the protecting), then publish `backend/database.rules.json` and `backend/firestore.rules` to your project.

### Changing the bad-word filter

```bash
cd moderation
# edit custom.txt, allow.txt, drop.txt or exact.txt
node build-name-filter.mjs   # writes the filter into the game and the Firestore rules
node test-name-filter.mjs    # checks bad names are blocked and normal ones pass
cd rules-test && npm install && npm test   # checks the rules in the Firestore emulator (needs Java)
```

### Multiplayer tests

```bash
cd tools && npm install
node police-test.mjs "/path/to/Chrome"   # two headless phones share one police force
```

## Known Issues (There Are Many) 🐛

- **Smashing things is not actually free** (this is the entire point)
- **The views do not pay off the debt** (we checked)
- **Your friends will get you arrested** (the cops take whoever they reach first)
- **iPhone silent mode** may mute the riot (flip the switch, embrace the chaos)
- **May cause the realisation that you've been doing this on social media for years**

## Contributing (Please Don't) 🤝

1. Fork it (bold move)
2. Make a branch (name it after your worst post)
3. Open a pull request (it goes on your bill)

## License 📜

Licensed under the **"Smash It, Share It, Your Generation Pays For It"** License, which is the MIT License wearing a balaclava. See [LICENSE](LICENSE). Fonts, sound and word lists keep their own licenses, listed there too.

---

*"Like, share, smash. Pay later."* – every 14-year-old's financial advisor

**Do not try this at home. Or outside. Especially outside.** 🚫🧱
