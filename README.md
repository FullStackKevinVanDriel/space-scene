 # Space Scene

Interactive browser-based 3D space scene (Earth, Moon, starfield, spaceship) using Three.js with a small API to control animation state.

Key points
- Frontend: `public/index.html`, `public/script.js`, `public/style.css` — Three.js renders Earth, moon, starfield and a flying spaceship.
- Backend: `server.js` — simple Express server that serves `public/` and exposes a small in-memory API.
- Serverless-ready: `api/state.js` and `api/update.js` provide Vercel-style handlers if you deploy to Vercel.
- Assets: `public/skybox/` and `public/spaceship/` contain images used by the scene.

Run locally

- Install dependencies:

	npm install

- Start the server (use this explicit command; `package.json` scripts point to `index.js` which is not present):

	node server.js

- Open the app in your browser:

	http://localhost:3000/

API

- Get current animation state:

	curl http://localhost:3000/api/state

- Update animation state (JSON body):

	curl -X POST -H "Content-Type: application/json" \
		-d '{"speed":2,"direction":"ccw"}' \
		http://localhost:3000/api/update

Notes

- The server keeps state in memory (no database); restarting the server resets `speed` and `direction` to defaults.
- The `api/*.js` files are written as serverless handlers and also document the same API used by `server.js`.
- `Dockerfile` exists for creating a dev container, but its `CMD` is `bash` — if you build the image, run the container and then start the server inside it (e.g., `node server.js`).

Development

- Tweak visuals in `public/script.js` and swap textures in `public/`.
- Assets used by the scene live under `public/skybox` and `public/spaceship`.

Deployment

- Deploy to Vercel (project includes `vercel.json` and `api/` handlers) or any static + Node host. On Vercel the `api/` handlers will be used as serverless endpoints.

Contributing

- Open an issue or PR describing the change. Small improvements: update `public/script.js`, add textures to `public/`, or add persistence for the API state.

License

- No license provided — add a `LICENSE` file if you want to set one.


