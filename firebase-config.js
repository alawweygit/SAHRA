/* HYPOX — configuration
   1) ONLINE PLAY: create a Firebase project → Realtime Database → paste the web config below.
      (Same steps as your padel app.) Until then, Pass & Play works with zero setup.
   2) AI PROMPTS (later): point aiEndpoint at your Railway backend.
      It receives POST { mode, lang, count } and must return { prompts: [...] }
      matching the shapes in js/content.js. Leave as null to use built-in packs. */

window.HYPOX_CONFIG = {
  firebase: {
    apiKey: "PASTE_YOUR_API_KEY",
    authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
    databaseURL: "PASTE_YOUR_DATABASE_URL", // e.g. https://sahra-xxxx-default-rtdb.firebaseio.com
    projectId: "PASTE_YOUR_PROJECT",
    storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
    messagingSenderId: "PASTE_SENDER_ID",
    appId: "PASTE_APP_ID",
  },
  aiEndpoint: null, // e.g. "https://your-backend.up.railway.app/api/prompts"
};
