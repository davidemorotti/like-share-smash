/* Like, Share, Smash: makes the game's claude.ai capabilities (room, db, user) run on a self-hosted Supabase.
   Exposes window.__lssBackend.use(name) with the same subset of the API the game calls. */
(() => {
  const cfg = window.LSS_SUPABASE;
  if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lss-auth' },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  const peerId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  const ready = (async () => {
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const r = await sb.auth.signInAnonymously();
      if (r.error) throw r.error;
      session = r.data.session;
    }
    return session.user.id;
  })().catch(e => { console.warn('[lss] backend offline', e); return null; });

  /* ---------- rooms: Supabase realtime presence ---------- */
  function makeRoom(channelName, uid) {
    const ch = sb.channel(channelName, { config: { presence: { key: peerId } } });
    let mine = {}, listeners = [], known = new Map(), subscribed = false, trackTimer = null;
    const snapshot = () => {
      const st = ch.presenceState(), out = [];
      for (const key in st) {
        const metas = st[key];
        const p = metas[metas.length - 1] || {};
        out.push({ peer: key, by: typeof p.u === 'string' ? p.u : null, isMe: key === peerId, sameTab: key === peerId, kind: 'viewer', guest: false, presence: p.d && typeof p.d === 'object' ? p.d : {}, updatedAt: Date.now() });
      }
      return out;
    };
    const notify = () => {
      const peers = snapshot(), ids = new Set(peers.map(p => p.peer)), left = [];
      known.forEach((v, k) => { if (!ids.has(k)) left.push(v); });
      const joined = peers.filter(p => !known.has(p.peer));
      known = new Map(peers.map(p => [p.peer, p]));
      listeners.forEach(fn => { try { fn({ peers, joined, left, updated: peers }); } catch (e) { console.error(e); } });
    };
    ch.on('presence', { event: 'sync' }, notify);
    const subscribedP = new Promise((resolve, reject) => {
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') { subscribed = true; resolve(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { if (!subscribed) reject(Object.assign(new Error(status), { code: 'upstream_error' })); }
      });
    });
    subscribedP.catch(() => {});
    const flush = () => { trackTimer = null; if (subscribed) ch.track({ u: uid, d: mine }).catch(() => {}); };
    return {
      name: channelName,
      presence(patch) {
        for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
        if (!trackTimer) trackTimer = setTimeout(flush, 150);
        return Promise.resolve();
      },
      onPeers(fn) { listeners.push(fn); setTimeout(notify, 0); return () => { listeners = listeners.filter(f => f !== fn); }; },
      peers: snapshot,
      connected: () => subscribed,
      leave() { listeners = []; clearTimeout(trackTimer); return sb.removeChannel(ch).then(() => {}, () => {}); },
      ready: subscribedP,
    };
  }
  function lobby(uid) {
    const r = makeRoom('lss-lobby', uid);
    r.join = name => { const room = makeRoom('lss-' + name, uid); return room.ready.then(() => room); };
    r.ready.then(() => r.presence({}));
    return r;
  }

  /* ---------- db: the two collections the game uses ---------- */
  const keyCol = col => (col === 'names' ? 'key' : 'uid');
  const db = {
    doc(path) {
      const [col, id] = path.split('/');
      return {
        async get() {
          const { data, error } = await sb.from(col).select('*').eq(keyCol(col), id).maybeSingle();
          if (error) throw error;
          const body = data ? (col === 'names' ? { uid: data.uid, name: data.name } : data) : undefined;
          return { exists: !!data, data: () => body };
        },
        async acquire() { return { acquired: true }; },
        async set(body) {
          if (col === 'names') {
            const { data, error } = await sb.rpc('claim_name', { p_key: id, p_name: String(body.name || '').slice(0, 16) });
            if (error) throw error;
            if (!data) throw Object.assign(new Error('taken'), { code: 'taken' });
            return;
          }
          if (col === 'board') {
            const row = { uid: id, name: String(body.name || '').slice(0, 16), owed: Math.max(0, Math.round(body.owed || 0)), deeds: Math.max(0, body.deeds | 0), views: Math.max(0, Math.round(body.views || 0)), runs: Math.max(0, body.runs | 0), best: Math.max(0, Math.round(body.best || 0)), at: new Date().toISOString() };
            const { error } = await sb.from('board').upsert(row);
            if (error) throw error;
          }
        },
        async update(body) {
          if (col === 'board' && body.name) {
            const { error } = await sb.from('board').update({ name: String(body.name).slice(0, 16) }).eq('uid', id);
            if (error) throw error;
          }
        },
        async delete() { /* claim_name releases a player's previous name */ },
      };
    },
    collection(col) {
      let order = ['views', 'desc'], lim = 50;
      const q = {
        orderBy(field, dir) { order = [field, dir || 'asc']; return q; },
        limit(n) { lim = n; return q; },
        onSnapshot(next, onError) {
          let timer = null, dead = false;
          const load = async () => {
            timer = null;
            const { data, error } = await sb.from(col).select('*').order(order[0], { ascending: order[1] === 'asc' }).limit(lim);
            if (dead) return;
            if (error) { if (onError) onError(error); return; }
            next({ docs: data.map(r => ({ id: r.uid, exists: true, data: () => r })) });
          };
          load();
          const ch = sb.channel('lss-board-' + peerId).on('postgres_changes', { event: '*', schema: 'public', table: col }, () => { if (!timer) timer = setTimeout(load, 2000); }).subscribe();
          return () => { dead = true; clearTimeout(timer); sb.removeChannel(ch); };
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
