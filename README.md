# space-scene
A scene in space of a space ship traversing from camera top left towards a rotating globe

mkdir space-scene && cd space-scene && git init && npm init -y && npm install express && mkdir -p public api && touch vercel.json public/index.html public/style.css public/script.js api/state.js api/update.js .gitignore && cat > README.md << 'EOF'
# Space Scene Project

## Goal
Public 3D one-page app:
- Wireframe rotating Earth sphere
- Simple space plane flies in from top-left
- Starfield background
- API to change Earth rotation speed + direction

## Current Target
Vercel deploy (fast preview via GitHub). Later optional migrate to vandromeda.com.

## Tech
- Frontend: HTML/CSS/JS + Three.js CDN
- Backend: Express API (serverless on Vercel)
- State: In-memory object

## Structure
space-scene/
├── api/
│   ├── state.js     # GET /api/state
│   └── update.js    # POST /api/update
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js    # Three.js + polling
├── vercel.json
├── package.json
├── .gitignore
└── README.md

## API
GET /api/state → { "speed": 0.01, "direction": "cw" }
POST /api/update → { "speed": number, "direction": "cw"|"ccw" }

## Multi-AI CLI Strategy
Use multiple AI coding agents via CLI for planning, code generation, reviews:
- Grok CLI (npm i -g @superagent/grok-cli) – xAI models
- Claude Code (npm i -g @anthropic-ai/claude-code)
- Gemini CLI (gemini cli install or similar)
- Aider (pip install aider-chat) – multi-model pair programmer
- GitHub Copilot CLI (gh copilot)
- Ollama (curl -fsSL https://ollama.com/install.sh | sh) – local models

Run each in separate terminals on same task, combine best outputs.

## Deploy
1. GitHub repo → push code
2. vercel.com → Import repo → auto-deploy

EOF
echo "node_modules/" > .gitignore
echo "Project scaffold done with multi-AI plan included. Next: install CLIs or code api/state.js?"
