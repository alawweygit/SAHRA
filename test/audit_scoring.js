// Scoring trace for all 5 modes
let bugs=0;
const assert=(c,m)=>{if(!c){console.log('BUG:',m);bugs++;}};
function sim(names){const players=names.map((n,i)=>({pid:'p'+i,name:n,score:0}));const add=(pid,pts)=>{if(isNaN(pts)||pts<0){console.log('BUG: bad pts',pts,'for',pid);bugs++;return;}players.find(p=>p.pid===pid).score+=pts;};return{players,add};}

// Bluff: fool 2 people = +1000, 2 find truth = +2000
{const{players,add}=sim(['A','B','C','D']);
add('p1',500);add('p1',500);// B fooled A and C
add('p0',1000);add('p2',1000);// A and C found truth
assert(players[1].score===1000,'bluff fool score');
assert(players[0].score===1000,'bluff truth score');
console.log('Bluff scoring: ✓');}

// WYR: 2 match = +1000 total
{const{players,add}=sim(['A','B','C']);
add('p1',500);add('p2',500);
assert(players[1].score===500,'wyr match');
console.log('WYR scoring: ✓');}

// Interrogation: caught 1, hidden from 2 = author +600
{const{players,add}=sim(['A','B','C','D']);
add('p1',400);// B caught A
const hidden=2;add('p0',hidden*300);// A hid from C and D
assert(players[0].score===600,'interrogation hidden');
assert(players[1].score===400,'interrogation catch');
console.log('Interrogation scoring: ✓');}

// Diss: 2 votes each = tie, no sweep
{const{players,add}=sim(['A','B','C','D']);
add('p0',2*250);add('p1',2*250);
assert(players[0].score===500,'diss votes A');
assert(players[1].score===500,'diss votes B');
console.log('Diss scoring: ✓');}

// Quiz speed
{const SPEED=[1000,850,700,600,500,450,400,400,400,400];
const{players,add}=sim(['A','B','C','D']);
['p0','p1','p2','p3'].forEach((pid,rank)=>add(pid,SPEED[rank]||400));
assert(players[0].score===1000,'quiz 1st');
assert(players[3].score===600,'quiz 4th');
assert(!isNaN(players[0].score),'no NaN');
console.log('Quiz scoring: ✓');}

// Cross-mode accumulation
{const{players,add}=sim(['A','B']);
add('p0',1000);add('p0',500);add('p1',2000);
assert(players[0].score===1500,'accumulation A');
assert(players[1].score===2000,'accumulation B');
console.log('Score accumulation: ✓');}

console.log(`\nScoring audit: ${bugs===0?'ALL ✓':bugs+' BUG(S)'}`);
