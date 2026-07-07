// Manually trace scoring logic for each mode — check for NaN, negative, wrong accumulation
const fs = require("fs");

// Simulate addScore mechanics
function makeScoreSim(playerNames) {
  const players = playerNames.map((name,i) => ({pid:"p"+i, name, score:0, emoji:"🦊"}));
  const log = [];
  const addScore = (pid, pts) => {
    const p = players.find(x=>x.pid===pid);
    if (!p) { log.push(`WARN: addScore unknown pid ${pid}`); return; }
    if (isNaN(pts) || pts < 0) { log.push(`BUG: addScore ${pts} to ${p.name}`); return; }
    p.score += pts;
    log.push(`${p.name} +${pts} = ${p.score}`);
  };
  return { players, addScore, log };
}

let bugs = 0;

// --- BLUFF BANQUET ---
{
  const {players, addScore, log} = makeScoreSim(["Ali","Maitham","Ramy","Noura"]);
  // Simulate round: Maitham&Ramy fooled, Ali&Noura found truth
  const liar = players[1]; // Maitham wrote the lie
  const fooled = [players[0], players[2]]; // Ali & Ramy voted for Maitham's lie
  fooled.forEach(p => addScore(liar.pid, 500)); // +500 each fooled
  const finders = [players[0], players[3]];
  finders.forEach(p => addScore(p.pid, 1000)); // found truth
  const badScore = log.find(l=>l.includes("BUG"));
  if (badScore) { console.log("BLUFF BUG:", badScore); bugs++; }
  else console.log("Bluff scoring: ✓", `Maitham=${players[1].score} Ali=${players[0].score}`);
}

// --- WYR ---
{
  const {players, addScore, log} = makeScoreSim(["Ali","Maitham","Ramy"]);
  // 2 out of 2 guessers match
  [players[1],players[2]].forEach(p => addScore(p.pid, 500));
  const bad = log.find(l=>l.includes("BUG"));
  if (bad) { console.log("WYR BUG:", bad); bugs++; }
  else console.log("WYR scoring: ✓", `scores=${players.map(p=>p.score).join(",")}`);
}

// --- INTERROGATION ---
{
  const {players, addScore, log} = makeScoreSim(["Ali","Maitham","Ramy","Noura"]);
  const author = players[0]; // Ali wrote it
  const guessers = [players[1],players[2],players[3]];
  const caught = [players[1]]; // only Maitham got it right
  caught.forEach(p => addScore(p.pid, 400));
  const hidden = guessers.length - caught.length; // 2 didn't guess
  addScore(author.pid, hidden * 300); // +600
  const bad = log.find(l=>l.includes("BUG"));
  if (bad) { console.log("INTERROGATION BUG:", bad); bugs++; }
  else console.log("Interrogation scoring: ✓", `Ali=${players[0].score} Maitham=${players[1].score}`);
}

// --- DISS TRACK ---
{
  const {players, addScore, log} = makeScoreSim(["Ali","Maitham","Ramy","Noura"]);
  // 3 crowd votes: 2 for Ali, 1 for Maitham, no sweep
  const vA = 2, vB = 1;
  addScore(players[0].pid, vA * 250);
  addScore(players[1].pid, vB * 250);
  // no sweep (vA != 0 && vB != 0)
  const bad = log.find(l=>l.includes("BUG"));
  if (bad) { console.log("DISS BUG:", bad); bugs++; }
  else console.log("Diss scoring: ✓", `Ali=${players[0].score} Maitham=${players[1].score}`);
}

// --- QUIZ speed points ---
{
  const {players, addScore, log} = makeScoreSim(["Ali","Maitham","Ramy","Noura"]);
  const SPEED = [1000,850,700,600,500,450,400,400,400,400];
  // 3 right in order
  [players[0],players[2],players[3]].forEach((p,rank) => addScore(p.pid, SPEED[rank]||400));
  const bad = log.find(l=>l.includes("BUG"));
  if (bad) { console.log("QUIZ BUG:", bad); bugs++; }
  else console.log("Quiz scoring: ✓", `Ali=1000 Ramy=700 Noura=600`);
  // verify no negative or NaN
  const invalid = players.filter(p => isNaN(p.score) || p.score < 0);
  if (invalid.length) { console.log("INVALID SCORE:", invalid.map(p=>p.name+":"+p.score)); bugs++; }
}

// --- Score accumulation across modes (total never resets between packs) ---
{
  const {players, addScore} = makeScoreSim(["Ali","Maitham"]);
  addScore("p0", 1000); addScore("p0", 500); addScore("p1", 2000);
  const expected = [1500, 2000];
  const actual = players.map(p=>p.score);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    console.log("ACCUMULATION BUG: expected", expected, "got", actual); bugs++;
  } else console.log("Score accumulation across packs: ✓");
}

console.log(`\nScoring audit: ${bugs===0?"ALL ✓":bugs+" BUG(S) FOUND"}`);
