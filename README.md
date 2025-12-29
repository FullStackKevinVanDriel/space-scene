cat > README.md << 'EOF'
# Space Scene Project

## Goal
Public 3D one-page app:
- Wireframe rotating Earth sphere
- Simple space plane flies in from top-left
- Starfield background
- API to change Earth rotation speed + direction

## Current Target
Vercel deploy via GitHub (repo: space-scene already created)

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
├── Dockerfile
├── vercel.json
├── package.json
├── .gitignore
└── README.md

## API
GET /api/state → { "speed": 0.01, "direction": "cw" }
POST /api/update → { "speed": number, "direction": "cw"|"ccw" }

## Development Environment (Ubuntu latest)
- Editor: VS Code installed with extensions
  sudo snap install --classic code
  code --install-extension ms-vscode-remote.remote-containers
  code --install-extension ms-azuretools.vscode-docker
  code --install-extension ms-vscode.live-server
  code --install-extension esbenp.prettier-vscode
  code --install-extension dbaeumer.vscode-eslint
  code --install-extension ms-vscode.vscode-typescript-next
  code --install-extension aerokaido.three-js-snippets
  code --install-extension frenco.vscode-vercel
  code --install-extension github.copilot
  code --install-extension github.copilot-chat

- Security: Docker dev container for all AI CLI work
  sudo apt install docker.io -y
  sudo usermod -aG docker $USER  # logout/login
  docker build -t space-dev .
  docker run -it -v $(pwd):/app space-dev
  Inside container: attach VS Code via Remote-Containers extension

## Multi-AI CLI Strategy (run inside Docker container only)
- Grok CLI: npm i -g @superagent/grok-cli
- Claude Code: pip install claude-code
- Aider: pip install aider-chat
- Ollama: curl -fsSL https://ollama.com/install.sh | sh
- GitHub Copilot CLI: gh extension install github/gh-copilot

Use multiple agents in parallel terminals for code ideas/reviews.

## Dockerfile (basic)
FROM ubuntu:24.10
RUN apt update && apt install -y curl git nodejs npm python3 python3-pip
WORKDIR /app
COPY . /app
CMD ["bash"]

## Deploy
Push to GitHub → vercel.com import → auto-deploy

## Status
Plan complete. Ready when you are to start coding.

EOF
echo "README.md updated with VS Code + extensions, Docker isolation, multi-AI CLIs, and everything else."
