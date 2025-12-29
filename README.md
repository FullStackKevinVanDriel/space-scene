# space-scene
A scene in space of a space ship traversing from camera top left towards a rotating globe

mkdir space-scene && cd space-scene && git init && npm init -y && npm install express && mkdir -p public api && touch vercel.json public/index.html public/style.css public/script.js api/state.js api/update.js .gitignore && cat > README.md << 'EOF'
# Space Scene Project

## Overview
A 3D web app with:
- Wireframe rotating Earth-like sphere
- Simple space plane flying in from top-left
- Starfield background
- API to control Earth's rotation speed and direction

Target: Quick preview on Vercel.

## Tech Stack
- Frontend: HTML/CSS/JS + Three.js (CDN)
- Backend: Express (API endpoints)
- Deployment: Vercel (GitHub auto-deploy)
- State: In-memory object

## Project Structure
space-scene/
├── api/
│   ├── state.js     # GET /api/state
│   └── update.js    # POST /api/update
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js    # Three.js scene + polling API
├── vercel.json      # Optional routing config
├── package.json
├── .gitignore
└── README.md

## Local Setup (already done by this script)
npm install express
# Test locally later with vercel dev or node server

## API Endpoints
- GET /api/state → { "speed": 0.01, "direction": "cw" }
- POST /api/update → body { "speed": number, "direction": "cw"|"ccw" }

## Deployment to Vercel
1. Create empty GitHub repo (e.g. space-scene)
2. git remote add origin <your-repo-url>
3. git add . && git commit -m "init" && git push -u origin main
4. Go to vercel.com → Import GitHub repo → Deploy

## Next Steps
- Implement api/state.js and api/update.js first
- Then build the Three.js scene in public/script.js

EOF
echo "node_modules/" > .gitignore && echo "Project created. Push to GitHub and import to Vercel when ready."
