/* HYPOX — networking: FirebaseNet (online) + LocalNet (pass & play)
   Both expose the same API so the game engine never cares which is active.

   API:
     createRoom(lang)                 -> code
     joinRoom(code, name)             -> { pid, isVip }   (player side)
     onPlayers(cb)                    -> cb(playersArray) live
     addLocalPlayer(name)             -> player            (LocalNet only)
     setState(obj)                    -> publish host phase to controllers
     onState(cb)                      -> controller listens for phases
     collect(phaseId, spec, pids, ms) -> Promise<{pid: value}> gathers inputs
     submitInput(phaseId, value)      -> controller sends input
     updateScore(pid, score)
     isOffline (bool)
*/

const AVATARS = [
  { emoji: '🦊', color: '#ff3d8a' }, { emoji: '🐼', color: '#2de1fc' },
  { emoji: '🐸', color: '#7dff6a' }, { emoji: '🦄', color: '#ffd23f' },
  { emoji: '🤖', color: '#b78bff' }, { emoji: '🐫', color: '#ff9d3d' },
  { emoji: '🦅', color: '#8be9fd' }, { emoji: '🐙', color: '#ff6a6a' },
  { emoji: '🦁', color: '#ffe36a' }, { emoji: '🐢', color: '#5affc3' },
];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O — avoids confusion
const makeCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/* All clients must turn equivalent text into the same Firebase-safe key.
   NFKC handles visually equivalent Unicode, while whitespace/case folding
   makes " monkeys ", "MONKEYS" and "monkeys" the same answer. */
const normalizeUniqueAnswer = value => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .replace(/\s+/g, ' ')
  .toUpperCase();
const uniqueAnswerKey = value => encodeURIComponent(normalizeUniqueAnswer(value)).replace(/\./g, '%2E');

/* ---------------- Firebase (online) ---------------- */
class FirebaseNet {
  constructor(db) { this.db = db; this.isOffline = false; this.code = null; this.pid = null; this.isRoomOwner = false; this._collectors = {}; }

  static available() {
    return typeof firebase !== 'undefined'
      && window.HYPOX_CONFIG && window.HYPOX_CONFIG.firebase
      && window.HYPOX_CONFIG.firebase.databaseURL
      && !String(window.HYPOX_CONFIG.firebase.databaseURL).includes('PASTE_');
  }
  static create() {
    if (!firebase.apps.length) firebase.initializeApp(window.HYPOX_CONFIG.firebase);
    return new FirebaseNet(firebase.database());
  }

  room(path = '') { return this.db.ref(`rooms/${this.code}${path ? '/' + path : ''}`); }

  async createRoom(lang) {
    this.code = makeCode();
    this.isRoomOwner = true;
    await this.room().set({
      createdAt: Date.now(), lang,
      state: { phase: 'lobby' },
    });
    this.room().onDisconnect().remove(); // rooms die with the host
    return this.code;
  }

  async joinRoom(code, name, av) {
    this.code = code.toUpperCase().trim();
    const snap = await this.room('createdAt').get();
    if (!snap.exists()) throw new Error('no-room');
    const playersSnap = await this.room('players').get();
    const existing = playersSnap.val() || {};
    const n = Object.keys(existing).length;
    if (n >= 20) throw new Error('full');
    if (!av) av = AVATARS[n % AVATARS.length];
    this.pid = 'p' + Date.now() + Math.floor(Math.random() * 999);
    const isVip = n === 0;
    await this.room('players/' + this.pid).set({
      name: name.slice(0, 14), emoji: av.emoji, color: av.color, score: 0, isVip, joinedAt: Date.now(),
    });
    // Player NOT removed on disconnect (iOS backgrounds tab = disconnect)
    // Player persists until explicit close() call
    return { pid: this.pid, isVip };
  }

  onPlayers(cb) {
    this.room('players').on('value', s => {
      const v = s.val() || {};
      const arr = Object.entries(v).map(([pid, p]) => ({ pid, ...p }))
        .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      this._players = arr;
      cb(arr);
    });
  }

  setState(obj) { return this.room('state').set({ ...obj, ts: Date.now() }); }
  onState(cb) { this.room('state').on('value', s => { const v = s.val(); if (v) cb(v); else cb({ phase: 'hostLeft' }); }); }

  setPlayMode(mode) { this.playMode = mode; return this.room('playMode').set(mode); }
  async getPlayMode() {
    const s = await this.room('playMode').get();
    this.playMode = s.val() || 'tv';
    return this.playMode;
  }

  /* Stub — online rooms use joinRoom() not addLocalPlayer() */
  addLocalPlayer() { return null; }

  /* Lightweight mirror channel: speech/pill/headline updates for phones-only
     players, published between input phases without disturbing the main state. */
  setMirror(m) { return this.room('mirror').set({ ...m, ts: Date.now() }); }
  onMirror(cb) { this.room('mirror').on('value', s => { const v = s.val(); if (v) cb(v); }); }

  /* Full shared presentation used by Phones Only. Kept separate from state so
     visual updates never restart or replace a player's active input phase. */
  setSharedScreen(view) { return this.room('sharedScreen').set({ ...view, ts: Date.now() }); }
  onSharedScreen(cb) { this.room('sharedScreen').on('value', s => cb(s.val() || null)); }

  async submitInput(phaseId, value, options = {}) {
    const inputRef = this.room(`inputs/${phaseId}/${this.pid}`);
    if (!options.enforceUnique) {
      await inputRef.set({ v: value, t: Date.now() });
      return { accepted: true };
    }

    // Claim the normalized answer atomically. Client-side answer lists are
    // useful hints, but cannot prevent two phones submitting at the same time.
    const normalized = normalizeUniqueAnswer(value);
    const claimRef = this.room(`inputClaims/${phaseId}/${uniqueAnswerKey(normalized)}`);
    const claimedAt = Date.now();
    const result = await claimRef.transaction(current => {
      if (current == null || current.pid === this.pid) return { pid: this.pid, normalized, t: claimedAt };
      return; // abort transaction: another player owns this answer
    });
    if (!result.committed || result.snapshot.val()?.pid !== this.pid) {
      return { accepted: false, reason: 'duplicate' };
    }

    try {
      await inputRef.set({ v: value, t: Date.now() });
      return { accepted: true };
    } catch (error) {
      // Do not leave a dead claim behind if the answer write fails.
      try {
        const claim = await claimRef.get();
        if (claim.val()?.pid === this.pid) await claimRef.remove();
      } catch (_) { /* original error is more useful */ }
      throw error;
    }
  }

  collect(phaseId, spec, pids, ms) {
    return new Promise(resolve => {
      const ref = this.room(`inputs/${phaseId}`);
      const out = {}; let done = false; let order = 0;
      const finish = () => {
        if (done) return; done = true;
        ref.off(); clearTimeout(timer);
        // Close the host's own input overlay if it's still open (timer expired).
        if (this.hostSelfPid && typeof window !== 'undefined' && window.__hypoxDismissPP) window.__hypoxDismissPP();
        resolve(out);
      };
      const timer = setTimeout(finish, ms);

      // Phones-only: the host is also a player. Collect their own input via the
      // local overlay and write it in, just like a remote submission.
      if (this.hostSelfPid && pids.includes(this.hostSelfPid) && this.promptLocal && spec) {
        const me = (this._players || []).find(p => p.pid === this.hostSelfPid) || { pid: this.hostSelfPid };
        const submit = value => this.submitInput(phaseId, value, { enforceUnique: spec.enforceUnique === true });
        // phonesHostPrompt performs the submission before dismissing, so a
        // duplicate can stay editable and show the same error as every phone.
        this.promptLocal(spec, me, submit).catch(() => {});
      }

      ref.on('value', s => {
        const v = s.val() || {};
        for (const [pid, entry] of Object.entries(v)) {
          if (!(pid in out) && pids.includes(pid)) {
            out[pid] = { value: entry.v, order: order++, t: entry.t, receivedAt: Date.now() };
            if (this._onEach) this._onEach(pid, entry.v);
          }
        }
        if (pids.every(p => p in out)) finish();
      });
    });
  }
  onEachInput(cb) { this._onEach = cb; }

  async addBot(botPid, name, av) {
    if (!this._botPids) this._botPids = [];
    this._botPids.push(botPid);
    await this.room('players/' + botPid).set({
      pid: botPid, name, emoji: av.emoji||'🤖', color: av.color||'#b78bff',
      score: 0, isVip: false, joinedAt: Date.now(), isBot: true
    });
    return botPid;
  }
  getBotPids() { return this._botPids || []; }

  updateScore(pid, score) { return this.room(`players/${pid}/score`).set(score); }

  async close() {
    if (!this.code) return;
    const roomRef = this.room();
    const playerRef = this.pid ? this.room('players/' + this.pid) : null;
    try { await roomRef.onDisconnect().cancel(); } catch(e) {}
    if (playerRef) {
      try { await playerRef.onDisconnect().cancel(); } catch(e) {}
    }
    roomRef.off();
    try {
      if (this.isRoomOwner) await roomRef.remove();
      else if (playerRef) await playerRef.remove();
    } finally {
      this.code = null;
      this.pid = null;
      this.isRoomOwner = false;
      this._players = [];
    }
  }
}

/* ---------------- Local (pass & play, one device) ---------------- */
class LocalNet {
  constructor() {
    this.isOffline = true; this.code = 'LOCAL';
    this.players = []; this._playersCb = null; this._onEach = null;
    /* main.js injects this: (spec, player) => Promise<value|null> */
    this.promptLocal = null;
  }
  async createRoom() { return this.code; }
  addLocalPlayer(name, av) {
    const n = this.players.length;
    if (n >= 20) return null;
    if (!av) av = AVATARS[n % AVATARS.length];
    const p = { pid: 'local' + n, name: name.slice(0, 14), emoji: av.emoji, color: av.color, score: 0, isVip: n === 0 };
    this.players.push(p);
    if (this._playersCb) this._playersCb(this.players.slice());
    return p;
  }
  onPlayers(cb) { this._playersCb = cb; cb(this.players.slice()); }
  setState() { /* no remote controllers to inform */ }
  onState() { }
  setMirror() { /* pass & play has no remote phones */ }
  onMirror() { }
  setPlayMode(mode) { this.playMode = mode; }
  async getPlayMode() { return this.playMode || 'offline'; }
  setSharedScreen() { }
  onSharedScreen() { }
  onEachInput(cb) { this._onEach = cb; }
  async collect(phaseId, spec, pids, ms) {
    const out = {}; let order = 0;
    for (const pid of pids) {
      const player = this.players.find(p => p.pid === pid);
      const value = await this.promptLocal(spec, player); // sequential pass-the-phone
      if (value !== null && value !== undefined) {
        const submittedAt = Date.now();
        out[pid] = { value, order: order++, t: submittedAt, receivedAt: submittedAt };
        if (this._onEach) this._onEach(pid);
      }
    }
    return out;
  }
  updateScore(pid, score) {
    const p = this.players.find(x => x.pid === pid);
    if (p) p.score = score;
  }
  async close() {
    this.players = [];
    if (this._playersCb) this._playersCb([]);
  }
}

function createNet(preferOffline) {
  if (!preferOffline && FirebaseNet.available()) return FirebaseNet.create();
  return new LocalNet();
}
