window.HYPOX_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCwLgQPaMojnCtph326HPeBauvOKuXg3nw",
    authDomain: "highpox-1eec7.firebaseapp.com",
    databaseURL: "https://highpox-1eec7-default-rtdb.firebaseio.com",
    projectId: "highpox-1eec7",
    storageBucket: "highpox-1eec7.firebasestorage.app",
    messagingSenderId: "305902826099",
    appId: "1:305902826099:web:7ec2e126cbf5ad82913006",
  },
  // v128 — this was never set. Every mode's game content (Bluff, WYR,
  // Trivia, etc. — anything going through Content.get) checks for this
  // exact field before attempting an AI call; without it, the game always
  // silently used the small static fallback pack, regardless of the
  // Railway backend, the API key, or anything server-side. Translate and
  // HarfHunt validation were unaffected because those call this URL
  // directly, hardcoded — only content generation depended on this.
  aiEndpoint: "https://hypox-ai-backend-production.up.railway.app/api/prompts",
};
