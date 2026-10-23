/* Like, Share, Smash: makes the game's claude.ai capabilities (room, db, user) run on Firebase.
   Crews and the lobby use Realtime Database presence; names and Trending use Firestore.
   Exposes window.__lssBackend.use(name) with the same subset of the API the game calls. */
(() => {
  const cfg = window.LSS_FIREBASE;
  if (!cfg || !cfg.apiKey || !window.firebase) return;
  firebase.initializeApp(cfg);
  const auth = firebase.auth(), fs = firebase.firestore(), rtdb = firebase.database();
  const peerId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  let uidNow = null;

  const ready = (async () => {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    await new Promise(resolve => { const off = auth.onAuthStateChanged(() => { off(); resolve(); }); });
    if (!auth.currentUser) await auth.signInAnonymously();
    uidNow = auth.currentUser.uid;
    return uidNow;
  })().catch(e => { console.warn('[lss] backend offline', e); return null; });

  /* ---------- rooms: Realtime Database presence, removed on disconnect ---------- */
  function makeRoom(roomName, uid) {
    const base = rtdb.ref('rooms/' + roomName), me = base.child(peerId), connRef = rtdb.ref('.info/connected');
    let mine = {}, listeners = [], state = {}, known = new Map(), connected = false, trackTimer = null, notifyTimer = null;
    const snapshot = () => Object.entries(state).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => ({
      peer: k, by: typeof v.u === 'string' ? v.u : null, isMe: k === peerId, sameTab: k === peerId, kind: 'viewer', guest: false,
      presence: v.d && typeof v.d === 'object' ? v.d : {}, updatedAt: Date.now(),
    }));
    const notify = () => {
      notifyTimer = null;
      const peers = snapshot(), ids = new Set(peers.map(p => p.peer)), left = [];
      known.forEach((v, k) => { if (!ids.has(k)) left.push(v); });
      const joined = peers.filter(p => !known.has(p.peer));
      known = new Map(peers.map(p => [p.peer, p]));
      listeners.forEach(fn => { try { fn({ peers, joined, left, updated: peers }); } catch (e) { console.error(e); } });
    };
    const schedule = () => { if (!notifyTimer) notifyTimer = setTimeout(notify, 50); };
    const onAdd = base.on('child_added', s => { state[s.key] = s.val(); schedule(); });
    const onChange = base.on('child_changed', s => { state[s.key] = s.val(); schedule(); });
    const onRemove = base.on('child_removed', s => { delete state[s.key]; schedule(); });
    /* only changed fields go over the wire: keeps crew bandwidth (and the Blaze bill) small */
    let sent = {}, sentOnce = false;
    const flush = () => {
      trackTimer = null;
      if (!connected) return;
      const upd = {};
      let n = 0;
      for (const k in mine) { const v = JSON.stringify(mine[k]); if (sent[k] !== v) { upd['d/' + k] = mine[k]; sent[k] = v; n++; } }
      for (const k in sent) if (!(k in mine)) { upd['d/' + k] = null; delete sent[k]; n++; }
      if (!n && sentOnce) return;
      upd.u = uid; upd.t = firebase.database.ServerValue.TIMESTAMP;
      sentOnce = true;
      me.update(upd).catch(() => {});
    };
    let resolveReady;
    const readyP = new Promise(r => { resolveReady = r; });
    const onConn = connRef.on('value', s => {
      connected = !!s.val();
      if (connected) { sent = {}; sentOnce = false; me.onDisconnect().remove(); flush(); resolveReady(); }
    });
    return {
      name: roomName,
      presence(patch) {
        for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
        if (!trackTimer) trackTimer = setTimeout(flush, 150);
        return Promise.resolve();
      },
      onPeers(fn) { listeners.push(fn); setTimeout(notify, 0); return () => { listeners = listeners.filter(f => f !== fn); }; },
      peers: snapshot,
      connected: () => connected,
      leave() {
        listeners = []; clearTimeout(trackTimer);
        base.off('child_added', onAdd); base.off('child_changed', onChange); base.off('child_removed', onRemove); connRef.off('value', onConn);
        me.onDisconnect().cancel();
        return me.remove().catch(() => {});
      },
      ready: readyP,
    };
  }
  function lobby(uid) {
    const r = makeRoom('lss-lobby', uid);
    r.join = name => { const room = makeRoom(name, uid); return Promise.race([room.ready, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'upstream_error' })), 10000))]).then(() => room); };
    return r;
  }

  /* ---------- db: the two Firestore collections the game uses ---------- */
  const int = v => Math.max(0, Math.round(Number(v) || 0));
  const db = {
    doc(path) {
      const [col, id] = path.split('/');
      const ref = fs.collection(col).doc(id);
      return {
        async get() { const s = await ref.get(); return { exists: s.exists, data: () => s.data() }; },
        async acquire() { return { acquired: true }; },
        async set(body) {
          if (col === 'names') {
            /* one name per player: the owners/{uid} pointer and the name move together, the old name is released in the same commit */
            const ownerRef = fs.collection('owners').doc(uidNow);
            await fs.runTransaction(async tx => {
              const s = await tx.get(ref);
              if (s.exists && s.data().uid !== uidNow) throw Object.assign(new Error('taken'), { code: 'taken' });
              const o = await tx.get(ownerRef);
              const oldKey = o.exists ? o.data().key : null;
              if (oldKey && oldKey !== id) {
                const oldRef = fs.collection('names').doc(oldKey);
                const old = await tx.get(oldRef);
                if (old.exists && old.data().uid === uidNow) tx.delete(oldRef);
              }
              tx.set(ref, { uid: uidNow, name: String(body.name || '').slice(0, 16), at: firebase.firestore.FieldValue.serverTimestamp() });
              tx.set(ownerRef, { key: id });
            });
            return;
          }
          if (col === 'board') {
            await ref.set({ name: String(body.name || '').slice(0, 16), owed: int(body.owed), deeds: int(body.deeds), views: int(body.views), runs: int(body.runs), best: int(body.best), at: firebase.firestore.FieldValue.serverTimestamp() });
          }
        },
        async update(body) { if (col === 'board' && body.name) await ref.update({ name: String(body.name).slice(0, 16), at: firebase.firestore.FieldValue.serverTimestamp() }); },
        async delete() { if (col !== 'names') await ref.delete(); /* names are released by the claim transaction */ },
      };
    },
    collection(col) {
      let order = ['views', 'desc'], lim = 50;
      const q = {
        orderBy(field, dir) { order = [field, dir || 'asc']; return q; },
        limit(n) { lim = n; return q; },
        onSnapshot(next, onError) {
          return fs.collection(col).orderBy(order[0], order[1]).limit(lim).onSnapshot(
            s => next({ docs: s.docs.map(d => ({ id: d.id, exists: true, data: () => d.data() })) }),
            e => { if (onError) onError(e); },
          );
        },
      };
      return q;
    },
  };

  const user = uid => ({
    id: () => Promise.resolve(uid),
    profiles: ids => Promise.resolve(Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: '', guest: false }]))),
  });

  window.__lssBackend = {
    use(name) {
      return ready.then(uid => {
        if (!uid) return null;
        if (name === 'db') return db;
        if (name === 'user') return user(uid);
        if (name === 'room') return lobby(uid);
        return null;
      });
    },
  };
})();
