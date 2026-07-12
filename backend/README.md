# HYPOX AI Backend — Railway deploy

1. Create a new Railway project → Deploy from GitHub repo (or empty service)
2. Set root directory to /backend
3. Add environment variable: ANTHROPIC_API_KEY = your key
4. Deploy. Copy the public URL.
5. In firebase-config.js set:
   aiEndpoint: "https://YOUR-APP.up.railway.app/api/prompts"
6. Push. The game will now generate unlimited fresh prompts.
