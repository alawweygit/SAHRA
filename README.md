# SAHRA (سهرة) — Party Games Platform

Jackbox-style party platform, original content, Arabic + English, built for the GCC.
Five game modes, one shared engine, zero build step — pure static HTML/CSS/JS.

## Play modes (pick on the title screen)
- **📺 TV + Phones**: open the site on a TV/laptop → the big screen shows the game, everyone's phone is a controller. Players join with the 4-letter room code.
- **📱 Phones Only**: no TV needed. The creator's phone runs the game AND is a player; everyone else joins on their own phone and sees a live "mirror" of the game (prompt, host, scores) right above their controls. Great for a car, a majlis, anywhere without a shared screen.
- **🤝 One Device**: pass & play on a single phone, zero setup, no internet. The phone is passed around for private inputs.

The first two need Firebase configured (below). One Device works with zero setup.

## Game modes (all bilingual)
| Mode | Loop | Scoring |
|---|---|---|
| Bluff Banquet · وليمة الكذب | write a lie → vote the truth | fool +500/each · truth +1000 |
| Would You Rather: Personal · يا هذا يا هذا | hot seat answers secretly, others predict | match +500 |
| The Interrogation · التحقيق | anonymous answers → vote who wrote it | catch +400 · hide +300/fooled |
| Diss Track Wars · حرب القصايد | 1v1 roast, crowd votes | +250/vote · sweep +500 |
| Majlis Quiz · كويز المجلس | speed trivia | 1000→400 by speed |

Scores persist across modes in one session ("party total"), winner crowned after each pack.

## Setup

### 1. Local test (Pass & Play) — works immediately
Open `index.html` in a browser. Done.

### 2. Online multiplayer (Firebase — same as the padel app)
1. [console.firebase.google.com](https://console.firebase.google.com) → Add project → name it `sahra`
2. Build → **Realtime Database** → Create database → start in **test mode**
3. Project settings → General → Your apps → Web app → copy the config object
4. Paste the values into `firebase-config.js`
5. Before real users: Database → Rules →
```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": true,
        ".write": true,
        ".indexOn": ["createdAt"]
      }
    }
  }
}
```
(Good enough for v1; rooms self-delete when the host disconnects.)

### 3. Deploy (your usual flow)
```bash
cd sahra
git init && git add . && git commit -m "SAHRA v1"
# create repo on GitHub, then:
git remote add origin https://github.com/alawweygit/sahra.git
git push -u origin main
```
Import into Vercel as a static site (no framework, no build command, output dir = root).

## AI prompt hook (later)
Set `aiEndpoint` in `firebase-config.js` to a Railway endpoint. Contract:

```
POST { "mode": "bluff|wyr|interrogation|diss|quiz", "lang": "en|ar", "count": 3 }
→ 200 { "prompts": [ ...same shapes as PACKS in js/content.js... ] }
```
On any failure the game silently falls back to the built-in packs — safe to ship the hook dark.

## Architecture
```
index.html          shell: 6 screens + host character + overlays
css/style.css       theme, RTL support, all animations
js/i18n.js          every UI string in en/ar (t(), setLang())
js/audio.js         Web Audio synth: SFX + 3 music loops, no files
js/fx.js            confetti canvas, wipe transition, helpers
js/content.js       original prompt packs (en/ar) + AI hook, region-aware
js/regions.js       regional trivia/fact packs (mena/weur/asia/africa)
js/net.js           FirebaseNet + LocalNet — identical API (+ mirror channel for Phones-Only)
js/controller.js    phone input renderers (text/choice/wait)
js/host.js          game engine: shared frames + 5 mode scripts
js/main.js          routing, lobby, join flow, pass & play overlay
firebase-config.js  the only file you edit
```
Key design decision: `net.collect(phaseId, spec, pids, ms)` is the whole
multiplayer abstraction. Online it fans out to phones over RTDB; offline it
drives the pass-the-phone overlay. Game modes never know the difference.

## Adding content
Append to the arrays in `js/content.js` — shapes are documented at the top of the file. Keep en/ar in the same order.

## Adding a game mode
1. Write `playMyMode()` in `js/host.js` using `collectWithTimer`, `showScores`, `say`
2. Register it in `MODES` + add icon in `MODE_ICONS` (main.js)
3. Add `mode_names/mode_taglines/mode_rules` entries in both languages (i18n.js)
4. Add a content pack (content.js)
