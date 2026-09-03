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
const validPlayerRecord = (pid, player) => typeof pid === 'string' && pid.trim()
  && player && typeof player.name === 'string' && player.name.trim();

/* ---------------- Firebase (online) ---------------- */
class FirebaseNet {
  constructor(db) {
    this.db = db; this.isOffline = false; this.code = null; this.pid = null;
    this.isRoomOwner = false; this._collectors = {}; this._removalNotified = new Set();
    this._playerIdentity = null; this._closing = false; this._heartbeatBusy = false;
    this._hostEpoch = null; this._serverTimeOffset = 0; this._serverOffsetRef = null;
    this._presenceDisconnectKey = null; this._stalePresenceChecks = new Map();
  }

  _serverNow() { return Date.now() + Number(this._serverTimeOffset || 0); }
  _serverTimestamp() {
    try {
      return firebase.database.ServerValue.TIMESTAMP;
    } catch (_) {
      return this._serverNow();
    }
  }
  _watchServerTimeOffset() {
    if (this._serverOffsetRef) return;
    const ref = this.db.ref('.info/serverTimeOffset');
    this._serverOffsetRef = ref;
    ref.on('value', snap => {
      const offset = Number(snap.val());
      this._serverTimeOffset = Number.isFinite(offset) ? offset : 0;
    });
  }
  _withNetworkTimeout(promise, ms = 8000) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('network-timeout')), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }

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
    this.pid = this.pid || ('host_' + Date.now());
    await this.room().set({
      createdAt: Date.now(), lang,
      state: { phase: 'lobby' },
      host: { pid: this.pid, name: 'Host', epoch: Date.now() },
      hostStatus: { status: 'online', hostPid: this.pid, hostName: 'Host', epoch: Date.now() },
    });
    // Host connectivity is deliberately separate from the game phase. The
    // old implementation replaced `state` with {phase:'hostLeft'}, which
    // destroyed the active question and made phones render two partial
    // screens. A disconnect now leaves the active phase untouched while the
    // surviving phones elect a replacement host through hostStatus.
    await this._armHostDisconnect(this.pid, 'Host');
    return this.code;
  }

  async resumeHost(code, pid = null) {
    this.code = code.toUpperCase().trim();
    const roomSnap = await this.room().get();
    if (!roomSnap.exists()) throw new Error('no-room');
    const roomData = roomSnap.val() || {};
    const assignedHost = roomData.host || null;
    if (assignedHost?.pid && pid && assignedHost.pid !== pid) {
      const error = new Error('host-reassigned');
      error.host = assignedHost;
      throw error;
    }
    this.isRoomOwner = true;
    this.pid = pid || assignedHost?.pid || null;
    this.hostSelfPid = this.pid;
    this.playMode = roomData.playMode || 'tv';
    const existing = roomData.players || {};
    this._players = Object.entries(existing)
      .filter(([playerPid, player]) => validPlayerRecord(playerPid, player))
      .map(([playerPid, player]) => ({ pid: playerPid, ...player }))
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    const hostPlayer = this._players.find(player => player.pid === this.pid);
    await this._registerHostConnection(
      this.pid,
      hostPlayer?.name || assignedHost?.name || 'Host',
      assignedHost?.epoch,
      assignedHost?.previousHostPid ? 'transfer' : null,
    );
    // Preserve the active game state. The caller decides whether it is
    // reopening a lobby or restarting the interrupted round cleanly.
    return { players: this._players, playMode: this.playMode, session: roomData.gameSession || null };
  }

  async _armHostDisconnect(pid, name, epoch = null) {
    this._hostEpoch = epoch || this._hostEpoch || Date.now();
    try { await this.room('hostStatus').onDisconnect().cancel(); } catch (e) {}
    this.room('hostStatus').onDisconnect().set({
      status: 'offline', hostPid: pid || null, hostName: name || 'Host',
      epoch: this._hostEpoch, electionId: this._hostEpoch,
    });
  }

  async _registerHostConnection(pid, name, epoch = null, reason = null) {
    if (!pid) throw new Error('missing-host-pid');
    this._hostEpoch = epoch || Date.now();
    const assignment = { pid, name: name || 'Host', epoch: this._hostEpoch };
    await this.room('host').set(assignment);
    await this.room('hostStatus').set({
      status: 'online', hostPid: pid, hostName: assignment.name,
      epoch: this._hostEpoch, ...(reason ? { reason } : {}),
    });
    await this._armHostDisconnect(pid, assignment.name, this._hostEpoch);
    return assignment;
  }

  async setHostPlayer(pid, name) {
    this.pid = pid;
    this.hostSelfPid = pid;
    this.isRoomOwner = true;
    return this._registerHostConnection(pid, name, Date.now());
  }

  setGameSession(session) {
    return this.room('gameSession').set({ ...session, updatedAt: Date.now() });
  }
  async getGameSession() {
    const snap = await this.room('gameSession').get();
    return snap.val() || null;
  }

  onHostStatus(cb) {
    this.room('hostStatus').on('value', snap => cb(snap.val() || null));
  }

  async electReplacementHost() {
    const roomSnap = await this.room().get();
    if (!roomSnap.exists()) throw new Error('no-room');
    const roomData = roomSnap.val() || {};
    const status = roomData.hostStatus || {};
    const currentHost = roomData.host || {};
    if (status.status !== 'offline') return currentHost?.pid ? currentHost : null;

    const oldHostPid = status.hostPid || currentHost.pid || null;
    const realPlayers = Object.entries(roomData.players || {})
      .filter(([pid, player]) => validPlayerRecord(pid, player) && !player.isBot && pid !== oldHostPid)
      .map(([pid, player]) => ({ pid, ...player }));
    if (!realPlayers.length) return null;

    this._watchServerTimeOffset();
    const now = this._serverNow();
    const presence = roomData.presence || {};
    const connected = realPlayers.filter(player => now - Number(presence[player.pid]?.t || 0) < 90_000);
    const candidates = (connected.length ? connected : realPlayers)
      .sort((a, b) => String(a.pid).localeCompare(String(b.pid)));
    const seedText = String(status.electionId || status.epoch || roomData.createdAt || this.code);
    let seed = 0;
    for (let i = 0; i < seedText.length; i++) seed = ((seed * 31) + seedText.charCodeAt(i)) >>> 0;
    const chosen = candidates[seed % candidates.length];
    const assignmentRef = this.room('host');
    const result = await assignmentRef.transaction(current => {
      if (!current || current.pid === oldHostPid) {
        return { pid: chosen.pid, name: chosen.name, epoch: Date.now(), previousHostPid: oldHostPid };
      }
      return;
    });
    const assignment = result.snapshot.val();
    if (!assignment?.pid) return null;
    if (result.committed) {
      if (oldHostPid && roomData.players?.[oldHostPid]) {
        await this.room(`players/${oldHostPid}/isVip`).set(false);
      }
      await this.room(`players/${assignment.pid}/isVip`).set(true);
      await this.room('hostStatus').set({
        status: 'transferring', hostPid: assignment.pid, hostName: assignment.name,
        previousHostPid: oldHostPid, epoch: assignment.epoch, reason: 'transfer',
      });
    }
    return assignment;
  }

  async resumePlayer(code, pid, identity = {}) {
    this.code = code.toUpperCase().trim();
    const roomSnap = await this.room().get();
    if (!roomSnap.exists()) throw new Error('no-room');
    const roomData = roomSnap.val() || {};
    let player = roomData.players?.[pid];
    // A timed-out player is deliberately removed from the live roster so
    // the current collection can continue. If that same phone comes back,
    // restore its original pid and player data instead of treating the room
    // as ended or creating a duplicate participant.
    if (!player) {
      const disconnected = roomData.disconnected || {};
      const identityKey = String(identity.name || '').trim().toLowerCase();
      const disconnectedEntry = Object.entries(disconnected).find(([key, saved]) =>
        saved?.pid === pid || (identityKey && key === identityKey));
      const saved = disconnectedEntry?.[1] || {};
      const name = saved.name || identity.name;
      if (!name) throw new Error('no-player');
      const otherPlayers = Object.entries(roomData.players || {}).filter(([otherPid]) => otherPid !== pid);
      if (otherPlayers.some(([, p]) => p?.name?.trim().toLowerCase() === name.trim().toLowerCase())) {
        throw new Error('name-taken');
      }
      const takenEmojis = new Set(otherPlayers.map(([, p]) => p?.emoji).filter(Boolean));
      let emoji = saved.emoji || identity.emoji || '👤';
      let color = saved.color || identity.color || '#64748b';
      if (takenEmojis.has(emoji)) {
        const fallback = AVATARS.find(av => !takenEmojis.has(av.emoji));
        if (fallback) { emoji = fallback.emoji; color = fallback.color; }
      }
      player = {
        name: name.slice(0, 14), emoji, color,
        score: saved.score || 0,
        isVip: saved.isVip ?? !!identity.isVip,
        joinedAt: saved.joinedAt || Date.now(),
      };
      await this.room('players/' + pid).set(player);
      if (disconnectedEntry) {
        try { await this.room('disconnected/' + disconnectedEntry[0]).remove(); } catch (e) {}
      }
    }
    this.pid = pid;
    this.isRoomOwner = false;
    this._closing = false;
    this.playMode = roomSnap.val()?.playMode || 'tv';
    this._playerIdentity = { ...player, pid };
    this._removalNotified.delete(pid);
    return { pid, isVip: !!player.isVip, player, playMode: this.playMode };
  }

  async joinRoom(code, name, av) {
    this.code = code.toUpperCase().trim();
    const snap = await this.room('createdAt').get();
    if (!snap.exists()) throw new Error('no-room');
    const playersSnap = await this.room('players').get();
    const existing = playersSnap.val() || {};
    const existingArr = Object.values(existing);
    const n = existingArr.length;
    if (n >= 20) throw new Error('full');
    // Check name uniqueness (case-insensitive)
    const nameKey = name.trim().toLowerCase();
    const nameTaken = existingArr.some(p => p.name && p.name.trim().toLowerCase() === nameKey);
    if (nameTaken) throw new Error('name-taken');
    // Reclaim: someone who disconnected and was auto-removed gets their
    // original pid, identity, and score back when they rejoin with the exact
    // same name. The record lives with the room, so they may return at any
    // later point while that room/game still exists.
    // Uses a transaction (not get-then-remove) so two people rejoining
    // under the identical name at nearly the same instant can't both
    // claim the same stashed score -- whoever's transaction commits first
    // consumes it, the second just finds it already gone.
    let claimedDisc = null;
    try {
      const discRef = this.room('disconnected/' + nameKey);
      const result = await discRef.transaction(current => {
        if (current == null) return; // nothing stashed, abort
        claimedDisc = current; // capture pre-delete value for use below
        return null; // consume it
      });
      if (!result.committed) claimedDisc = null;
    } catch (e) {}
    if (!av) av = AVATARS[n % AVATARS.length];
    const takenEmojis = new Set(existingArr.map(p => p.emoji));
    let chosenAv = claimedDisc?.emoji ? { emoji: claimedDisc.emoji, color: claimedDisc.color } : av;
    if (takenEmojis.has(chosenAv.emoji)) {
      if (!claimedDisc) throw new Error('avatar-taken');
      chosenAv = AVATARS.find(candidate => !takenEmojis.has(candidate.emoji)) || chosenAv;
    }
    this.pid = claimedDisc?.pid || ('p' + Date.now() + Math.floor(Math.random() * 999));
    const player = {
      name: (claimedDisc?.name || name).slice(0, 14),
      emoji: chosenAv.emoji,
      color: chosenAv.color,
      score: claimedDisc?.score || 0,
      isVip: claimedDisc?.isVip ?? (n === 0),
      joinedAt: claimedDisc?.joinedAt || Date.now(),
    };
    await this.room('players/' + this.pid).set(player);
    this._playerIdentity = { ...player, pid: this.pid };
    this._closing = false;
    this._removalNotified.delete(this.pid);
    // The host may temporarily remove this record after a long heartbeat
    // outage; the saved identity above lets the same player reclaim it.
    return { pid: this.pid, isVip: !!player.isVip };
  }

  onPlayers(cb) {
    this.room('players').on('value', s => {
      const v = s.val() || {};
      // Ignore malformed score-only records such as the historical
      // players/null/score entry. A participant must have a real identity;
      // otherwise it must never reach lobbies, rounds, or scoreboards.
      const arr = Object.entries(v)
        .filter(([pid, p]) => validPlayerRecord(pid, p))
        .map(([pid, p]) => ({ pid, ...p }))
        .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      const previous = this._players || [];
      this._players = arr;
      // A pid may legitimately return after an earlier disconnect removal.
      // Re-arm its removal notification so a later disconnect is handled too.
      arr.forEach(player => this._removalNotified.delete(player.pid));
      // A player who taps Leave Game deletes their own player record. That
      // bypasses the host's stale-heartbeat remover entirely, so detect the
      // roster disappearance here and run the exact same host callback that
      // removes them locally and force-finishes any collection awaiting them.
      const currentPids = new Set(arr.map(player => player.pid));
      previous.forEach(player => {
        if (!currentPids.has(player.pid)) {
          this._notifyPlayerRemoved(player.pid);
        }
      });
      cb(arr);
    });
  }

  _notifyPlayerRemoved(pid) {
    if (!pid || pid === this.pid || pid === this.hostSelfPid) return;
    if ((this._botPids || []).includes(pid)) return;
    // Firebase's onPlayers listener and _removePlayerNow can observe the same
    // delete. Notify the host once so one departure cannot advance two phases.
    if (this._removalNotified.has(pid)) return;
    this._removalNotified.add(pid);
    if (this._onRemoveCb) {
      try { this._onRemoveCb(pid); } catch (e) { console.error('[HYPOX] onRemove callback threw', pid, e); }
    }
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

  async reserveUniqueAnswer(phaseId, value, meta = {}) {
    const normalized = normalizeUniqueAnswer(value);
    const claimRef = this.room(`inputClaims/${phaseId}/${uniqueAnswerKey(normalized)}`);
    await claimRef.set({ pid: '__hypox_reserved__', normalized, reserved: true, ...meta, t: Date.now() });
  }

  async getTruthDiscoveries(phaseId) {
    const snap = await this.room(`truthDiscoveries/${phaseId}`).get();
    return snap.val() || {};
  }

  async submitInput(phaseId, value, options = {}) {
    const inputRef = this.room(`inputs/${phaseId}/${this.pid}`);
    if (!options.enforceUnique) {
      await this._withNetworkTimeout(inputRef.set({ v: value, t: Date.now() }));
      return { accepted: true };
    }

    // Claim the normalized answer atomically. Client-side answer lists are
    // useful hints, but cannot prevent two phones submitting at the same time.
    const normalized = normalizeUniqueAnswer(value);
    const claimRef = this.room(`inputClaims/${phaseId}/${uniqueAnswerKey(normalized)}`);
    const claimedAt = Date.now();
    const result = await this._withNetworkTimeout(claimRef.transaction(current => {
      if (current == null || current.pid === this.pid) return { pid: this.pid, normalized, t: claimedAt };
      return; // abort transaction: another player owns this answer
    }));
    if (!result.committed || result.snapshot.val()?.pid !== this.pid) {
      const owner = result.snapshot.val();
      if (owner?.reserved && owner.reason === 'truth') {
        const points = Number(owner.points) || 1000;
        // One marker per player: repeated taps or retries cannot create
        // duplicate rewards. The host reads these markers after everyone has
        // supplied a real lie and applies the score exactly once.
        await this._withNetworkTimeout(
          this.room(`truthDiscoveries/${phaseId}/${this.pid}`).transaction(current =>
            current == null ? { points, t: Date.now() } : current)
        );
        return { accepted: false, reason: 'truth', points };
      }
      return { accepted: false, reason: 'duplicate' };
    }

    try {
      await this._withNetworkTimeout(inputRef.set({ v: value, t: Date.now() }));
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
      let expectedPids = [...pids];
      const finish = () => {
        if (done) return; done = true;
        ref.off(); clearTimeout(timer);
        // v118 — clear the force-finish hook so a stale one can't end the
        // NEXT phase early.
        if (typeof window !== 'undefined' && window.__hypoxForceCollect === finish) window.__hypoxForceCollect = null;
        if (typeof window !== 'undefined' && window.__hypoxDropCollectPid === dropPid) window.__hypoxDropCollectPid = null;
        // Close the host's own input overlay if it's still open (timer expired).
        if (this.hostSelfPid && typeof window !== 'undefined' && window.__hypoxDismissPP) window.__hypoxDismissPP();
        resolve(out);
      };
      const dropPid = pid => {
        if (done || !expectedPids.includes(pid)) return false;
        expectedPids = expectedPids.filter(expectedPid => expectedPid !== pid);
        delete out[pid];
        if (expectedPids.every(expectedPid => expectedPid in out)) finish();
        return true;
      };
      const timer = setTimeout(finish, ms);
      // v118 — lets the host end collection early with whatever has arrived.
      // Without this, one unreachable player (dropped connection, closed tab)
      // stalls the whole room for the full timeout with no way to advance.
      if (typeof window !== 'undefined') {
        window.__hypoxForceCollect = finish;
        window.__hypoxDropCollectPid = dropPid;
      }

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
          if (!(pid in out) && expectedPids.includes(pid)) {
            out[pid] = { value: entry.v, order: order++, t: entry.t, receivedAt: Date.now() };
            if (this._onEach) this._onEach(pid, entry.v);
          }
        }
        if (expectedPids.every(p => p in out)) finish();
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

  updateScore(pid, score) {
    const player = (this._players || []).find(p => p.pid === pid && validPlayerRecord(p.pid, p));
    if (!player || !Number.isFinite(score)) return Promise.resolve(false);
    return this.room(`players/${pid}/score`).set(score);
  }

  // Shared removal path used by both the automatic offline watcher and a
  // manual host-triggered removal (tapping a disconnected player's avatar).
  // Stashes the full player identity for a later rejoin, removes the
  // live player + presence records, then fires the registered onRemove
  // callback so host.js can update its local roster / toast / unstick any
  // in-flight collection.
  async _removePlayerNow(pid) {
    // The 4s watcher can tick again while Firebase writes are still in
    // flight. Keep one removal per pid active so the callback cannot fire
    // twice and accidentally advance two phases.
    if (!this._removingPids) this._removingPids = new Set();
    if (this._removingPids.has(pid)) return;
    this._removingPids.add(pid);
    try {
      let pData = null;
      try {
        const pSnap = await this.room('players/' + pid).get();
        pData = pSnap.val();
      } catch (e) { console.error('[HYPOX] failed reading player before removal', pid, e); }
      // Stash for reclaim -- isolated in its own try/catch so a failure here
      // (e.g. a permissions issue on this newer path) can never block the
      // actual removal below, which matters far more.
      if (pData && pData.name) {
        try {
          const nameKey = pData.name.trim().toLowerCase();
          await this.room('disconnected/' + nameKey).set({
            pid,
            name: pData.name,
            emoji: pData.emoji,
            color: pData.color,
            score: pData.score || 0,
            isVip: !!pData.isVip,
            joinedAt: pData.joinedAt || Date.now(),
            disconnectedAt: Date.now(),
          });
        } catch (e) { console.error('[HYPOX] failed stashing disconnected record (non-blocking)', pid, e); }
      }
      // Removing the live player is the only critical write. Presence is
      // cleanup data: if that second write is denied or transiently fails,
      // the host must still receive the callback and unstick the round.
      try {
        await this.room('players/' + pid).remove();
      } catch (e) {
        console.error('[HYPOX] FAILED removing player -- game may stay stuck', pid, e);
        return;
      }
      try {
        await this.room('presence/' + pid).remove();
      } catch (e) {
        console.error('[HYPOX] failed cleaning presence (non-blocking)', pid, e);
      }
      this._notifyPlayerRemoved(pid);
    } finally {
      this._removingPids.delete(pid);
    }
  }
  // Host-triggered manual removal, e.g. tapping a greyed-out disconnected
  // avatar in the status row. Doesn't wait for the conservative auto-detect window.
  async forceRemovePlayer(pid) {
    if (pid === this.pid || pid === this.hostSelfPid) return; // never remove self/host
    if ((this._botPids||[]).includes(pid)) return; // never remove bots
    await this._removePlayerNow(pid);
  }

  // ── AUTO-REMOVE OFFLINE PLAYERS ──
  watchAndRemoveOffline(onRemove) {
    // Always adopt the latest callback, even if the watcher is already
    // running. This is called twice -- once by the lobby, then again by
    // host.js when the game starts -- and an early return here would leave
    // _onRemoveCb pointing at the lobby's callback for the whole game,
    // so the game's own handler (which force-finishes a stuck collection)
    // would never run.
    if (onRemove) this._onRemoveCb = onRemove;
    if (this._offlineWatcher) return;
    // Mobile Safari can pause timers and delay writes during a radio/Wi-Fi
    // handoff while Firebase reads still arrive. A 20-second deadline falsely
    // removed healthy remote players, leaving them able to watch but unable to
    // submit. Only remove a player after a real heartbeat has gone stale for
    // 90 seconds on two consecutive checks. A missing heartbeat is not proof
    // of a disconnect; the host can still remove that player manually.
    const OFFLINE_MS = 90000;
    this._offlineWatcher = setInterval(async () => {
      if (!this.code) return;
      try {
        // Scan the authoritative player roster, but require an actual stale
        // presence timestamp before removing anyone automatically.
        const [presenceSnap, playersSnap] = await Promise.all([
          this.room('presence').get(),
          this.room('players').get(),
        ]);
        const presence = presenceSnap.val() || {};
        const livePlayers = playersSnap.val() || {};
        const now = this._serverNow();
        for (const [pid] of Object.entries(livePlayers)) {
          if (pid === this.pid || pid === this.hostSelfPid) continue; // never remove self or host
          if ((this._botPids||[]).includes(pid)) continue; // never remove bots
          const lastSeen = Number(presence[pid]?.t);
          if (!Number.isFinite(lastSeen) || lastSeen <= 0) {
            this._stalePresenceChecks.delete(pid);
            continue;
          }
          const age = now - lastSeen;
          if (age > OFFLINE_MS) {
            const checks = (this._stalePresenceChecks.get(pid) || 0) + 1;
            this._stalePresenceChecks.set(pid, checks);
            if (checks >= 2) {
              this._stalePresenceChecks.delete(pid);
              await this._removePlayerNow(pid);
            }
          } else {
            this._stalePresenceChecks.delete(pid);
          }
        }
      } catch(e) { console.error('[HYPOX] offline watcher tick failed', e); }
    }, 4000);
  }
  stopOfflineWatcher() {
    if (this._offlineWatcher) { clearInterval(this._offlineWatcher); this._offlineWatcher = null; }
    this._stalePresenceChecks.clear();
  }

  // ── PRESENCE / HEARTBEAT ──
  startHeartbeat() {
    this._watchServerTimeOffset();
    if (this._heartbeatInt) {
      this._heartbeatWrite?.();
      return;
    }
    const write = async () => {
      if (!this.code || !this.pid || this._closing || this._heartbeatBusy) return;
      this._heartbeatBusy = true;
      try {
        // A tab can regain connectivity without reloading after the host has
        // already timed it out. Detect that missing self-record and restore
        // it before publishing the next heartbeat.
        if (!this.isRoomOwner && this._playerIdentity) {
          const selfSnap = await this.room('players/' + this.pid).get();
          if (!selfSnap.exists() && !this._closing) {
            await this.resumePlayer(this.code, this.pid, this._playerIdentity);
          }
        }
        if (!this._closing) {
          const disconnectKey = `${this.code}:${this.pid}`;
          if (this._presenceDisconnectKey !== disconnectKey) {
            try { await this.room('presence/' + this.pid).onDisconnect().remove(); } catch (_) {}
            this._presenceDisconnectKey = disconnectKey;
          }
          await this.room('presence/' + this.pid).set({ t: this._serverTimestamp() });
        }
      } catch(e) {
      } finally {
        this._heartbeatBusy = false;
      }
    };
    this._heartbeatWrite = write;
    write();
    this._heartbeatInt = setInterval(write, 5000);
  }
  stopHeartbeat() {
    if (this._heartbeatInt) { clearInterval(this._heartbeatInt); this._heartbeatInt = null; }
    if (this.code && this.pid) {
      try { this.room('presence/' + this.pid).remove(); } catch(e) {}
    }
    this._heartbeatWrite = null;
    this._presenceDisconnectKey = null;
  }
  onPresence(cb) {
    if (!this.code) return;
    // Recompute status from a snapshot's timestamps. Split out so both the
    // Firebase 'value' listener and the local ticker below can use it.
    const computeAndEmit = () => {
      const v = this._lastPresenceVal || {};
      const now = this._serverNow();
      const status = {};
      for (const [pid, data] of Object.entries(v)) {
        const age = now - (data.t || 0);
        status[pid] = age < 15000 ? 'online' : age < 90000 ? 'away' : 'offline';
      }
      cb(status);
    };
    this.room('presence').on('value', s => {
      this._lastPresenceVal = s.val() || {};
      computeAndEmit();
    });
    // A disconnected device stops writing its heartbeat altogether, so the
    // 'value' listener above never fires again for it -- meaning a purely
    // event-driven status would stay stuck at whatever it last was
    // ('online') indefinitely. Re-evaluate on a local clock so going stale
    // is actually detected without needing a remote change that will never
    // arrive.
    if (this._presenceTicker) clearInterval(this._presenceTicker);
    this._presenceTicker = setInterval(computeAndEmit, 5000);
  }
  stopPresenceTicker() {
    if (this._presenceTicker) { clearInterval(this._presenceTicker); this._presenceTicker = null; }
  }

  async close() {
    if (!this.code) return;
    this._closing = true;
    const roomRef = this.room();
    const playerRef = this.pid ? this.room('players/' + this.pid) : null;
    this.stopHeartbeat();
    this.stopOfflineWatcher();
    this.stopPresenceTicker();
    if (this._serverOffsetRef) {
      try { this._serverOffsetRef.off(); } catch (_) {}
      this._serverOffsetRef = null;
    }
    try { await roomRef.onDisconnect().cancel(); } catch(e) {}
    try { await this.room('state').onDisconnect().cancel(); } catch(e) {}
    try { await this.room('hostStatus').onDisconnect().cancel(); } catch(e) {}
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
      this._playerIdentity = null;
      this._heartbeatBusy = false;
    }
  }
}

/* ---------------- Local (pass & play, one device) ---------------- */
class LocalNet {
  constructor() {
    this.isOffline = true; this.code = 'LOCAL';
    this.players = []; this._playersCb = null; this._onEach = null;
    this._inputClaims = new Map(); this._truthDiscoveries = new Map();
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
  async reserveUniqueAnswer(phaseId, value, meta = {}) {
    const key = `${phaseId}|${normalizeUniqueAnswer(value)}`;
    this._inputClaims.set(key, { pid: '__hypox_reserved__', reserved: true, ...meta });
  }
  async getTruthDiscoveries(phaseId) {
    return { ...(this._truthDiscoveries.get(phaseId) || {}) };
  }
  async submitInput(phaseId, value, options = {}) {
    if (!options.enforceUnique) return { accepted: true };
    const key = `${phaseId}|${normalizeUniqueAnswer(value)}`;
    const owner = this._inputClaims.get(key);
    if (owner?.reserved && owner.reason === 'truth') {
      const points = Number(owner.points) || 1000;
      const discoveries = this._truthDiscoveries.get(phaseId) || {};
      if (!discoveries[this.pid]) discoveries[this.pid] = { points, t: Date.now() };
      this._truthDiscoveries.set(phaseId, discoveries);
      return { accepted: false, reason: 'truth', points };
    }
    if (owner && owner.pid !== this.pid) return { accepted: false, reason: 'duplicate' };
    this._inputClaims.set(key, { pid: this.pid });
    return { accepted: true };
  }
  async collect(phaseId, spec, pids, ms) {
    const out = {}; let order = 0;
    for (const pid of pids) {
      const player = this.players.find(p => p.pid === pid);
      this.pid = pid;
      const submit = value => this.submitInput(phaseId, value, { enforceUnique: spec?.enforceUnique === true });
      const value = await this.promptLocal(spec, player, submit); // sequential pass-the-phone
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
    this._inputClaims.clear(); this._truthDiscoveries.clear();
    if (this._playersCb) this._playersCb([]);
  }
}

function createNet(preferOffline) {
  if (!preferOffline && FirebaseNet.available()) return FirebaseNet.create();
  return new LocalNet();
}
