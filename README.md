# Space Scene Project — FULL DETAILED PLAN RESTORED (One Block)

**Goal**  
Public 3D web app:  
- Wireframe Earth sphere rotating in space (speed + direction controllable via API)  
- Simple space plane flying in from top-left of camera view  
- Starfield background  
- Three.js client-side  

**API**  
- GET /api/state → { "speed": number, "direction": "cw"|"ccw" }  
- POST /api/update → JSON body { "speed": number, "direction": "cw"|"ccw" }  
- Frontend polls /api/state every few seconds to update animation  
- In-memory state (no DB for prototype)  

**Deploy**  
Vercel first (GitHub repo `space-scene`). Later optional vandromeda.com (restore SSH key, Cloudflare DNS, separate server, existing DB/API if persistence needed).

**Dev Environment**  
Ubuntu latest host. VS Code on host. Docker container for isolation. VS Code Remote-Containers attaches to container. All AI CLI work inside container.

**API Keys**  
.env file in project root. npm install dotenv. .gitignore includes .env.

**Multi-AI CLI Agents & Orchestration**  
Use all available agentic CLIs in parallel terminals inside container for planning, code generation, reviews. Combine best outputs. Aider as main orchestrator (model switching). CrewAI/AutoGen for advanced coordination (role-based or conversational agents).

**Tools**  
- Grok CLI (@superagent/grok-cli or current)  
- Claude Code CLI  
- Gemini CLI  
- Aider  
- Codex CLI (OpenAI)  
- Ollama (local models)  
- GitHub Copilot CLI  
- CrewAI & AutoGen (Python)  

**Three.js Animation**  
Manual requestAnimationFrame loop + THREE.Clock.getDelta() for frame-rate independent rotation. Plane fly-in manual or GSAP CDN. Stars PointsMaterial with random positions.

**Project Structure**  
space-scene/  
├── api/state.js  
├── api/update.js  
├── public/index.html  
├── public/style.css  
├── public/script.js  
├── Dockerfile  
├── vercel.json  
├── .env  
├── package.json  
├── .gitignore  

**Full Setup Steps**

**Host**  
sudo apt update && sudo apt upgrade -y  
sudo apt install docker.io git curl -y  
sudo usermod -aG docker $USER  # logout/login  

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

git clone https://github.com/YOURUSERNAME/space-scene.git  
cd space-scene  
npm init -y  
npm install express dotenv  
mkdir -p public api  
touch public/index.html public/style.css public/script.js api/state.js api/update.js vercel.json .gitignore .env  
echo "node_modules/\n.env" > .gitignore  
echo "OPENAI_API_KEY=\nANTHROPIC_API_KEY=\nXAI_API_KEY=\nGOOGLE_API_KEY=" > .env  

cat > Dockerfile << 'EOF'  
FROM ubuntu:24.10  
RUN apt update && apt install -y curl git nodejs npm python3 python3-pip gh  
RUN npm install -g vercel  
WORKDIR /app  
COPY . /app  
CMD ["bash"]  
EOF  

docker build -t space-dev .  
docker run -it -v $(pwd):/app space-dev  

**Inside Container**  
npm install  
pip install aider-chat crewai autogen  
curl -fsSL https://ollama.com/install.sh | sh  
ollama pull llama3  
gh extension install github/gh-copilot  
npm install -g @superagent/grok-cli  

**Attach VS Code**  
code . → Remote-Containers → Attach to Running Container → space-dev  

**Workflow**  
Multiple terminals in attached VS Code. Run parallel AI CLIs on same task/files. Combine code. Backend first, then Three.js. Test vercel dev. git push → Vercel live.

