BUGFIX AUDIT — Trace: Trace-20260101T192657.json
=============================================

Summary
-------
- I scanned the trace (large trace file) and the runtime code in `public/script.js`.
- The trace shows sustained high counts of main-thread tasks and compositor work, repeated layout/paint events, many V8 GC events, and dropped frames. These point to heavy per-frame work, frequent allocations, and expensive rendering operations.

High-level findings (what is bad)
--------------------------------
- Excessive per-frame DOM creation and layout:
  - `updateTargetingHUD()` clears and rebuilds HUD elements every frame (`hudContainer.innerHTML = ''`) and creates many DOM nodes (reticles, health bars, labels) per asteroid. This causes repeated style/layout/paint work (many `Layout` / `Paint` / `UpdateLayer` events in the trace).

- High main-thread CPU work and frequent RunTask/GPUTask:
  - Trace shows very high counts of `RunTask`, `AnimationFrame`, `AnimationFrame::StyleAndLayout`, `Paint`, `UpdateLayer`, `GPUTask` and many `BeginMainThreadFrame` / `DrawFrame` / `Swap` events. This indicates heavy JS + rendering per frame.

- Frequent and visible garbage collection:
  - The trace contains many V8 GC related events (scavenge/major concurrent marking, background scavenger events). Frequent allocations (temporary vectors, geometry/material creation) likely cause memory churn and GC pauses.

- Per-frame Three.js allocations and expensive operations:
  - Many `new THREE.Vector3()`, `.clone()`, new geometries/materials, and `THREE.Mesh` creation occur inside animation loop paths (laser creation, explosion/spark creation, asteroid movement updates). These allocations are visible in trace as CPU + GC pressure.
  - `cubeCamera.update(renderer, scene)` is called frequently (every few frames) and triggers expensive cubemap renders.

- Not disposing GPU resources on removal:
  - Objects removed from the scene (explosions, asteroids, laser bolts) are not consistently disposing geometries, materials, textures, or sprites which will increase GPU memory usage over time.

- Many dynamic lights and high-resolution shadow maps:
  - Directional light shadow map size set to 4096x4096 and many dynamic point lights (explosions, engine lights) add GPU and CPU cost to compositing and rendering.

- Debug and extension noise:
  - The trace includes many `ScriptCatchup` entries from browser extensions/content scripts. These can muddy profiling results — disable extensions when profiling.

Specific code hotspots (where to look)
-------------------------------------
- `public/script.js` — updateTargetingHUD() — heavy DOM work and raycasts per frame.
- `public/script.js` — createExplosion(), createHitSpark() — create many geometries, meshes, materials per event and add to `explosions` without explicit disposal.
- `public/script.js` — fireLasers() — creates `THREE.Group`, Mesh, Sprite, PointLight objects on each fire; removed later but not always disposed.
- `public/script.js` — asteroid creation & movement loops — use `clone()` and `new Vector3()` extensively in per-frame updates.
- `public/script.js` — cubeCamera update (cubemap) — executed frequently and is expensive.
- `public/script.js` — many per-frame random `console.debug()` calls (even if rarely triggered) — they may slow and clutter traces in debug builds.

Concrete recommendations and fixes
--------------------------------
1) Stop rebuilding DOM every frame — reuse and pool HUD elements
   - Change `updateTargetingHUD()` to reuse DOM nodes (create a pool of reticle elements) and update their `style.transform`/position and content instead of resetting `innerHTML` each frame.
   - Only update DOM when an asteroid's screen position or state changes significantly (throttle/skip frames).

2) Reduce per-frame allocations in JS
   - Reuse temporary `THREE.Vector3`, `Quaternion`, `Matrix3` instances instead of calling `.clone()` and `new` repeatedly inside loops.
   - Where possible, compute into pre-allocated vectors (e.g., `tempVec.set(...)`) to avoid GC churn.

3) Pool particle/explosion objects and cap counts
   - Create a pool of explosion/spark groups (or simple particle sprites) and recycle them instead of creating/destroying `Mesh`+`Geometry` objects each event.
   - Limit max active particles/explosions; reduce geometry detail (lower segment counts) for small particles.

4) Dispose Three.js GPU resources on removal
   - When removing asteroid/explosion/laser meshes, explicitly call `geometry.dispose()`, `material.dispose()`, and `texture.dispose()` (if any) to free GPU memory and reduce GC pressure.
   - Example on removal: 
     - `mesh.geometry.dispose();` 
     - `mesh.material.dispose();` 
     - `scene.remove(mesh);`

5) Throttle or avoid expensive renders
   - Reduce `directionalLight.shadow.mapSize` (4096 -> 1024 or 2048) and relax shadow camera frustum where possible.
   - Lower `WebGLCubeRenderTarget` size (256 → 128) or update the cube camera less frequently and on-demand (e.g., when canopy is visible and camera moved significantly).
   - Limit number of dynamic `PointLight`s (use emissive materials or baked light sprites for explosions/engines).

6) Reduce draw/paint churn
   - Avoid changing style/layout-triggering properties repeatedly; batch style updates and use `transform` and `opacity` where possible (GPU composite) rather than width/left/top which trigger layout.

7) Replace heavy geometry with simpler impostors for many small objects
   - Use `THREE.Points` or sprites for distant asteroids, small debris, and particles instead of individual `Mesh` objects with geometry.

8) Pool and reuse lasers and asteroids where possible
   - Create bullet / asteroid object pools to avoid allocations on fire/respawn.

9) Remove/guard debug logging and disable extensions when profiling
   - Wrap `console.debug()` calls behind a `DEBUG` flag to avoid I/O overhead during normal runs.
   - Disable browser extensions when capturing traces to avoid `ScriptCatchup` noise.

10) Audit timers and event listeners for leaks
   - Ensure `setTimeout` handlers that reference removed objects don't keep them alive. Clear timers where necessary and remove DOM event listeners when elements are removed.

Trace highlights (quick evidence)
--------------------------------
- Very high counts of `RunTask`, `AnimationFrame`, `Layout`, `Paint`, `UpdateLayer` and `GPUTask` events in the trace — indicates heavy JS + rendering each frame.
- Several V8 GC events (scavenge/major marking) and `DroppedFrame` entries — indicates GC and main-thread stalls causing frames to drop.
- `ScriptCatchup` entries from extensions observed in the trace — disable while profiling.

Next steps I can take (if you want)
----------------------------------
- Implement the highest-impact fixes (in order):
  1. Refactor `updateTargetingHUD()` to reuse DOM nodes (low-risk, big win).
  2. Add object pools for lasers/explosions and dispose geometries on removal.
  3. Reduce shadow map size and throttle cubemap updates.
- Run a smaller trace after each change to verify improvements.

If you want, I can implement (1) now and run targeted profiling suggestions.

-- End of audit

## Verification & Recent Actions

- Implemented fix: refactored `updateTargetingHUD()` to use DOM pooling (create-once, reuse per-frame) and throttled occlusion/raycast checks where possible.
- Added stable DOM IDs for UI controls (`gameCanvas`, `orientationCanvas`, `laserBtn`, `modeToggleBtn`, `hamburgerBtn`, `settingsPanel`) to stabilize automated tests.
- Created `tools/debug_mode_toggle.mjs` to reproduce UI flows and capture screenshots/logs during automated runs.

Test results (local):

- Unit tests: `npm run test:unit` — 12/12 passed.
- Playwright e2e (focused + full): `npx playwright test --headed --project=chromium` — 9/9 passed (mode-toggle focused tests also passed after adding stable id and serving on expected port).

Artifacts & notes:

- Debug screenshot: `modeToggle_debug.png` captured by `tools/debug_mode_toggle.mjs` demonstrating `#modeToggleBtn` presence and computed styles.
- Playwright report: saved under `test-results/` (use `npx playwright show-report` to open the HTML report locally).

Recommended next steps before shipping:

- Merge `fix/hud-pooling` branch after review.
- Run a short devtools trace (5–10s) in a clean browser profile (no extensions) before and after the change to quantify CPU/Layout/Paint improvements.
- Optionally add automated performance regression test (collect a short trace or FPS metric during a fixed scenario and fail on regressions).

If you want, I can open a PR from `fix/hud-pooling` with these notes and the test artifacts attached.

```
