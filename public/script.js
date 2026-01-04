// Space Scene - Three.js Frontend

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.id = 'gameCanvas';
// Enable shadow mapping for solar eclipse (moon shadow on Earth)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Increase pixel ratio for higher fidelity renders while capping to avoid extreme GPU load.
const MAX_PIXEL_RATIO = 3; // safety cap
function updatePixelRatio() {
    const base = window.devicePixelRatio || 1;
    // Multiply by 2 for a crisper look on HiDPI displays, but cap at MAX_PIXEL_RATIO.
    const desired = Math.min(base * 2, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(desired);
}
updatePixelRatio();
document.body.appendChild(renderer.domElement);
// Prevent the browser from handling touch gestures (pan/zoom) so pointer events work
renderer.domElement.style.touchAction = 'none';

// Clock for frame-rate independent animation
const clock = new THREE.Clock();

// Add these globals right after const clock = new THREE.Clock();

const raycaster = new THREE.Raycaster();
const aimNDC = new THREE.Vector2();
const shipTargetDir = new THREE.Vector3();
const shipForwardLocal = new THREE.Vector3(0, 0, 1); // Nose points +Z
const shipUpLocal = new THREE.Vector3(0, 1, 0);

// Persistent aiming state for relative drag rotation
let shipYaw = 0;   // Accumulated yaw in radians
let shipPitch = 0; // Accumulated pitch in radians (clamped to avoid flip)
const ROT_SENSITIVITY = 0.005; // Tune feel
const PITCH_LIMIT = Math.PI / 2 - 0.1; // Prevent gimbal flip

// Drag delta sensitivity (tune for feel)
const rotationSensitivity = 0.005;

// Previous NDC for relative drag
const prevDragNDC = new THREE.Vector2();

// Temp quats for relative rotation
const yawQuat = new THREE.Quaternion();
const pitchQuat = new THREE.Quaternion();
const cameraRight = new THREE.Vector3();
const cameraUp = new THREE.Vector3();

// === PERFORMANCE: Reusable vectors to avoid per-frame allocations ===
const _tempVec1 = new THREE.Vector3();
const _tempVec2 = new THREE.Vector3();
const _tempVec3 = new THREE.Vector3();
const _tempVec4 = new THREE.Vector3();
const _asteroidDir = new THREE.Vector3();
const _asteroidMovement = new THREE.Vector3();
const _boltMovement = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _moonDir = new THREE.Vector3();

// === PERFORMANCE: Cached DOM element references ===
const _domCache = {
    asteroidCount: null,
    gameTimer: null,
    get(id) {
        if (!this[id]) {
            this[id] = document.getElementById(id);
        }
        return this[id];
    }
};


// === SPATIAL_PARTITIONING: 3D Spatial Hash for efficient collision detection ===
// Replaces O(n*m) collision checks with O(n+m) average case by partitioning 3D space into cells
// Objects are inserted into grid cells based on position; queries only check nearby cells

class SpatialHash {
    constructor(cellSize = 10) {
        this.cellSize = cellSize;
        this.inverseCellSize = 1 / cellSize;
        this.buckets = new Map();
        // Reusable array for query results to avoid allocations
        this._queryResults = [];
        // Reusable set to track already-checked objects in radius queries
        this._checkedSet = new Set();
    }

    // Get the cell key for a 3D position
    // Returns a string key "x,y,z" for the cell containing this position
    _getKey(x, y, z) {
        const cx = Math.floor(x * this.inverseCellSize);
        const cy = Math.floor(y * this.inverseCellSize);
        const cz = Math.floor(z * this.inverseCellSize);
        return `${cx},${cy},${cz}`;
    }

    // Get cell coordinates (integers) for a position
    _getCellCoords(x, y, z) {
        return {
            cx: Math.floor(x * this.inverseCellSize),
            cy: Math.floor(y * this.inverseCellSize),
            cz: Math.floor(z * this.inverseCellSize)
        };
    }

    // Insert an object into the spatial hash
    // Object must have a position property (THREE.Vector3)
    insert(object) {
        if (!object || !object.position) return;
        const key = this._getKey(object.position.x, object.position.y, object.position.z);
        if (!this.buckets.has(key)) {
            this.buckets.set(key, []);
        }
        this.buckets.get(key).push(object);
        // Store the key on the object for fast removal
        object._spatialHashKey = key;
    }

    // Insert an object that may span multiple cells (for larger objects)
    // radius is the object's bounding sphere radius
    insertWithRadius(object, radius) {
        if (!object || !object.position) return;
        const pos = object.position;
        const cellSpan = Math.ceil(radius * this.inverseCellSize);
        const baseCx = Math.floor(pos.x * this.inverseCellSize);
        const baseCy = Math.floor(pos.y * this.inverseCellSize);
        const baseCz = Math.floor(pos.z * this.inverseCellSize);

        // Track which cells this object is in
        object._spatialHashKeys = [];

        for (let dx = -cellSpan; dx <= cellSpan; dx++) {
            for (let dy = -cellSpan; dy <= cellSpan; dy++) {
                for (let dz = -cellSpan; dz <= cellSpan; dz++) {
                    const key = `${baseCx + dx},${baseCy + dy},${baseCz + dz}`;
                    if (!this.buckets.has(key)) {
                        this.buckets.set(key, []);
                    }
                    this.buckets.get(key).push(object);
                    object._spatialHashKeys.push(key);
                }
            }
        }
    }

    // Remove an object from the spatial hash
    remove(object) {
        if (!object) return;

        // Handle objects inserted with radius (multiple cells)
        if (object._spatialHashKeys) {
            for (const key of object._spatialHashKeys) {
                const bucket = this.buckets.get(key);
                if (bucket) {
                    const idx = bucket.indexOf(object);
                    if (idx !== -1) {
                        bucket.splice(idx, 1);
                    }
                    if (bucket.length === 0) {
                        this.buckets.delete(key);
                    }
                }
            }
            delete object._spatialHashKeys;
            return;
        }

        // Handle single-cell objects
        if (object._spatialHashKey) {
            const bucket = this.buckets.get(object._spatialHashKey);
            if (bucket) {
                const idx = bucket.indexOf(object);
                if (idx !== -1) {
                    bucket.splice(idx, 1);
                }
                if (bucket.length === 0) {
                    this.buckets.delete(object._spatialHashKey);
                }
            }
            delete object._spatialHashKey;
        }
    }

    // Query for all objects near a position within a given radius
    // Returns array of candidate objects (caller must do precise distance check)
    queryRadius(x, y, z, radius) {
        this._queryResults.length = 0;
        this._checkedSet.clear();

        const cellSpan = Math.ceil(radius * this.inverseCellSize);
        const baseCx = Math.floor(x * this.inverseCellSize);
        const baseCy = Math.floor(y * this.inverseCellSize);
        const baseCz = Math.floor(z * this.inverseCellSize);

        for (let dx = -cellSpan; dx <= cellSpan; dx++) {
            for (let dy = -cellSpan; dy <= cellSpan; dy++) {
                for (let dz = -cellSpan; dz <= cellSpan; dz++) {
                    const key = `${baseCx + dx},${baseCy + dy},${baseCz + dz}`;
                    const bucket = this.buckets.get(key);
                    if (bucket) {
                        for (let i = 0; i < bucket.length; i++) {
                            const obj = bucket[i];
                            // Avoid duplicates (object may be in multiple cells)
                            if (!this._checkedSet.has(obj)) {
                                this._checkedSet.add(obj);
                                this._queryResults.push(obj);
                            }
                        }
                    }
                }
            }
        }

        return this._queryResults;
    }

    // Query objects in a single cell (fast path for small objects)
    queryCell(x, y, z) {
        const key = this._getKey(x, y, z);
        return this.buckets.get(key) || [];
    }

    // Clear all objects from the spatial hash
    clear() {
        this.buckets.clear();
    }

    // Get statistics for debugging
    getStats() {
        let totalObjects = 0;
        let maxBucketSize = 0;
        for (const bucket of this.buckets.values()) {
            totalObjects += bucket.length;
            maxBucketSize = Math.max(maxBucketSize, bucket.length);
        }
        return {
            bucketCount: this.buckets.size,
            totalObjects,
            maxBucketSize,
            avgBucketSize: this.buckets.size > 0 ? totalObjects / this.buckets.size : 0
        };
    }
}

// Create spatial hash instances for collision detection
// Cell size of 10 units works well for:
// - Asteroids: 0.5-2.0 size, spawn at 120-180 units from Earth
// - Lasers: small, fast-moving projectiles
// - Larger cell size = fewer cells to check, but more objects per cell
const asteroidSpatialHash = new SpatialHash(10);
const laserSpatialHash = new SpatialHash(10);

// Helper function to rebuild spatial hash from arrays
// Call this at the start of each frame for simplicity
// (Could be optimized to incremental updates if needed)
function rebuildSpatialHashes() {
    asteroidSpatialHash.clear();
    laserSpatialHash.clear();

    // Insert all asteroids with their bounding radius
    for (let i = 0; i < asteroids.length; i++) {
        const asteroid = asteroids[i];
        // Use asteroid size as radius for broad phase
        const radius = asteroid.userData.size || 1;
        asteroidSpatialHash.insertWithRadius(asteroid, radius);
    }

    // Insert all laser bolts (small, so single cell is fine)
    for (let i = 0; i < laserBolts.length; i++) {
        laserSpatialHash.insert(laserBolts[i]);
    }
}

// Query asteroids near a position (for laser collision checks)
function queryNearbyAsteroids(position, maxRadius) {
    return asteroidSpatialHash.queryRadius(
        position.x, position.y, position.z,
        maxRadius
    );
}

// Query lasers near a position (for asteroid collision checks, if needed)
function queryNearbyLasers(position, maxRadius) {
    return laserSpatialHash.queryRadius(
        position.x, position.y, position.z,
        maxRadius
    );
}

// === END SPATIAL_PARTITIONING ===

// === SUN AND LIGHTING ===
// Sun position - far enough to feel distant but visible
const SUN_DISTANCE = 80;
const SUN_POSITION = new THREE.Vector3(SUN_DISTANCE, SUN_DISTANCE * 0.3, SUN_DISTANCE * 0.2);

// Ambient light (very dim - space is dark)
const ambientLight = new THREE.AmbientLight(0x111122, 0.15);
scene.add(ambientLight);

// Directional light FROM the sun
const directionalLight = new THREE.DirectionalLight(0xfffaf0, 2.0);
directionalLight.position.copy(SUN_POSITION);
// Enable shadow casting for eclipse effects
directionalLight.castShadow = true;
// Configure shadow camera for intense, sharp eclipse shadows
directionalLight.shadow.mapSize.width = 4096;
directionalLight.shadow.mapSize.height = 4096;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 200;
// Tighter frustum for sharper shadows
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
directionalLight.shadow.bias = -0.0001;
directionalLight.shadow.normalBias = 0.02;
// Maximum shadow darkness
directionalLight.shadow.intensity = 1;
scene.add(directionalLight);
scene.add(directionalLight.target);

// Create glowing sun with smooth gradient halo
function createSun() {
    const sunGroup = new THREE.Group();

    // Blazing white core
    const coreGeom = new THREE.SphereGeometry(3, 48, 48);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeom, coreMat);
    sunGroup.add(core);

    // Many smooth glow layers for seamless gradient (no visible steps)
    // Each layer slightly larger with decreasing opacity
    const glowLayers = 24;
    const minRadius = 3.2;
    const maxRadius = 18;
    const minOpacity = 0.005;
    const maxOpacity = 0.12;

    for (let i = 0; i < glowLayers; i++) {
        const t = i / (glowLayers - 1); // 0 to 1
        // Exponential falloff for radius
        const radius = minRadius + (maxRadius - minRadius) * Math.pow(t, 0.7);
        // Smooth opacity falloff
        const opacity = maxOpacity * Math.pow(1 - t, 1.8) + minOpacity;

        const glowGeom = new THREE.SphereGeometry(radius, 32, 32);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: opacity,
            side: THREE.BackSide,
            depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        sunGroup.add(glow);
    }

    // Bright point light
    const sunLight = new THREE.PointLight(0xffffff, 1.5, 300);
    sunGroup.add(sunLight);

    sunGroup.position.copy(SUN_POSITION);
    return sunGroup;
}

const sun = createSun();
scene.add(sun);

// Subtle fill light from opposite side (reflected light from space)
const fillLight = new THREE.DirectionalLight(0x4466aa, 0.1);
fillLight.position.set(-SUN_POSITION.x, -SUN_POSITION.y, -SUN_POSITION.z);
scene.add(fillLight);

// State
let planetRotationSpeed = 0.1;
let planetRotationDirection = 1;
let shipOrbitSpeed = 0.25;
let shipOrbitDirection = 1; // 1 = clockwise, -1 = counterclockwise

// Texture loader with error handling
const textureLoader = new THREE.TextureLoader();

// Earth textures from reliable CDN sources
const EARTH_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg';
const EARTH_BUMP_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_normal_2048.jpg';
const EARTH_SPECULAR_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_specular_2048.jpg';
const CLOUDS_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_clouds_1024.png';
const EARTH_NIGHT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_lights_2048.png';

// Loading indicator
const loadingDiv = document.createElement('div');
loadingDiv.id = 'loading';
loadingDiv.innerHTML = 'Loading...';
loadingDiv.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 20, 40, 0.9);
    color: #4488ff;
    padding: 10px 20px;
    border-radius: 5px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    z-index: 1000;
    transition: opacity 0.5s;
`;
document.body.appendChild(loadingDiv);

let texturesLoaded = 0;
const totalTextures = 6;

function updateLoadingProgress() {
    texturesLoaded++;
    const pct = Math.round((texturesLoaded / totalTextures) * 100);
    loadingDiv.innerHTML = `Loading satellite imagery... ${pct}%`;
    if (texturesLoaded >= totalTextures) {
        loadingDiv.style.opacity = '0';
        setTimeout(() => loadingDiv.remove(), 500);
    }
}

function onTextureError(err) {
    console.warn('Texture failed to load:', err);
    updateLoadingProgress(); // Still count it to avoid stuck indicator
}

// Load textures with error handling
const earthTexture = textureLoader.load(EARTH_TEXTURE_URL, updateLoadingProgress, undefined, onTextureError);
const earthBumpMap = textureLoader.load(EARTH_BUMP_URL, updateLoadingProgress, undefined, onTextureError);
const earthSpecularMap = textureLoader.load(EARTH_SPECULAR_URL, updateLoadingProgress, undefined, onTextureError);
const cloudTexture = textureLoader.load(CLOUDS_TEXTURE_URL, updateLoadingProgress, undefined, onTextureError);
const earthNightTexture = textureLoader.load(EARTH_NIGHT_URL, updateLoadingProgress, undefined, onTextureError);

// Create Earth with custom day/night shader
const earthGeometry = new THREE.SphereGeometry(2, 128, 128);

// Custom shader for day/night transition with city lights
// Uses sun's world position for accurate lighting as Earth rotates
const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
        dayTexture: { value: earthTexture },
        nightTexture: { value: earthNightTexture },
        sunPosition: { value: SUN_POSITION.clone() }
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
            vUv = uv;
            // Transform normal to world space using mat3 for proper rotation handling
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunPosition;

        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
            // Direction from this point toward the sun
            vec3 toSun = normalize(sunPosition - vWorldPosition);

            // World normal (re-normalize after interpolation)
            vec3 worldNormal = normalize(vWorldNormal);

            // How much this fragment faces the sun
            float sunIntensity = dot(worldNormal, toSun);

            // Smooth transition at terminator (0 = night, 1 = day)
            // Push terminator toward the lit side for a darker night hemisphere
            float dayAmount = smoothstep(-0.45, -0.02, sunIntensity);

            // Sample textures
            vec4 dayColor = texture2D(dayTexture, vUv);
            vec4 nightColor = texture2D(nightTexture, vUv);

            // Day side: maintain good contrast but avoid over-brightening
            vec3 litDay = dayColor.rgb * (0.25 + 0.75 * max(0.0, sunIntensity));

            // Night side: remove faint blue bleed, keep only bright city lights
            float nightLum = dot(nightColor.rgb, vec3(0.333));
            float lightMask = smoothstep(0.03, 0.18, nightLum); // threshold to pick out city lights
            vec3 nightLights = pow(nightColor.rgb, vec3(1.6)) * 6.0 * lightMask;
            vec3 litNight = dayColor.rgb * 0.0002 + nightLights;

            // Boost day illumination for stronger contrast
            vec3 boostedDay = litDay * (1.05 + 0.9 * max(0.0, sunIntensity));

            // Blend: night (0) -> litNight, day (1) -> boostedDay
            vec3 finalColor = mix(litNight, boostedDay, dayAmount);

            gl_FragColor = vec4(finalColor, 1.0);
        }
    `
});

const earth = new THREE.Mesh(earthGeometry, earthMaterial);
// Earth casts shadow on moon (lunar eclipse)
earth.castShadow = true;
scene.add(earth);

// Cloud layer
const cloudGeometry = new THREE.SphereGeometry(2.03, 64, 64);
const cloudMaterial = new THREE.MeshPhongMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.7,
    depthWrite: false
});
const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
// Clouds receive shadow from moon (solar eclipse)
clouds.receiveShadow = true;
scene.add(clouds);

// Shadow-only overlay - transparent but darkens where moon shadow falls
const shadowOverlayGeometry = new THREE.SphereGeometry(2.015, 64, 64);
const shadowOverlayMaterial = new THREE.ShadowMaterial({
    opacity: 0.7  // How dark the eclipse shadow appears
});
const shadowOverlay = new THREE.Mesh(shadowOverlayGeometry, shadowOverlayMaterial);
shadowOverlay.receiveShadow = true;
scene.add(shadowOverlay);

// Atmosphere glow
const atmosphereGeometry = new THREE.SphereGeometry(2.1, 64, 64);
const atmosphereMaterial = new THREE.MeshPhongMaterial({
    color: 0x0088ff,
    transparent: true,
    opacity: 0.06,
    side: THREE.BackSide
});
const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
scene.add(atmosphere);

// === MOON ===
// High quality moon texture (hosted locally)
const moonTexture = textureLoader.load('moon.jpg', updateLoadingProgress, undefined, onTextureError);

// Moon geometry
const moonGeometry = new THREE.SphereGeometry(0.5, 64, 64);

// Use MeshPhongMaterial for brighter response to light
const moonMaterial = new THREE.MeshPhongMaterial({
    map: moonTexture,
    shininess: 5,
    specular: new THREE.Color(0x222222),
    emissive: new THREE.Color(0x000000)
});

const moon = new THREE.Mesh(moonGeometry, moonMaterial);
// Moon casts shadow on Earth (solar eclipse)
moon.castShadow = true;
// Moon receives shadow from Earth (lunar eclipse handled separately via shader)
moon.receiveShadow = true;
scene.add(moon);

// Add a subtle light that follows the moon to ensure it's visible
const moonLight = new THREE.PointLight(0xffffee, 0.3, 10);
scene.add(moonLight);

// Moon orbital parameters
const MOON_ORBIT_RADIUS = 6;
let moonOrbitSpeed = 0.15;
let moonOrbitDirection = 1; // 1 = normal, -1 = reverse
// Realistic orbital inclination: Moon's orbit is inclined ~5.14° to ecliptic
const MOON_ORBIT_INCLINATION = 5.14 * (Math.PI / 180); // Convert to radians
let moonOrbitAngle = 0;
// Longitude of ascending node (rotates slowly - simplified for demo)
let moonAscendingNode = 0;

// Space skybox using equirectangular milky way star map (hosted locally)
const spaceTexture = textureLoader.load('skybox/stars.jpg', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;
});

// Starfield for additional depth
function createStarfield() {
    const starCount = 3000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
        // Random position on a large sphere
        const r = 200 + Math.random() * 200;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i] = r * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = r * Math.cos(phi);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.15,
        sizeAttenuation: true
    });
    const stars = new THREE.Points(geometry, material);
    scene.add(stars);
    return stars;
}

const starfield = createStarfield();

// --- Post-processing composer & bloom (if available) ---
let composer = null;
if (typeof THREE.EffectComposer !== 'undefined') {
    composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.4, 0.85);
    bloomPass.threshold = 0.15;
    bloomPass.strength = 1.1; // intensity
    bloomPass.radius = 0.4;
    composer.addPass(bloomPass);
}
// === SPACESHIP - Synthesis of Ornithopter + Starship + EVE Online ===
// CubeCamera for real-time reflections on canopy
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
});
const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
scene.add(cubeCamera);

function createSpaceShip() {
    const ship = new THREE.Group();

    // === MATERIALS - Industrial military spacecraft ===
    // Main hull - brushed stainless steel (Starship inspired)
    const steelHullMat = new THREE.MeshStandardMaterial({
        color: 0xb8b8b8,
        metalness: 0.85,
        roughness: 0.35
    });
    // Dark gunmetal armor plates (EVE inspired)
    const armorMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        metalness: 0.7,
        roughness: 0.4
    });
    // Gold/bronze accent panels (EVE inspired)
    const accentMat = new THREE.MeshStandardMaterial({
        color: 0xc9a227,
        metalness: 0.8,
        roughness: 0.3
    });
    // Dark interior
    const interiorMat = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        metalness: 0.3,
        roughness: 0.8
    });
    // Engine housing
    const engineMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.9,
        roughness: 0.2
    });

    // === MAIN FUSELAGE - Elongated cylindrical body (Starship style) ===
    // Curved nose cone
    const noseGeo = new THREE.SphereGeometry(0.5, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, steelHullMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = -3.5;
    ship.add(nose);

    // Main cylindrical body
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.55, 5, 24);
    const body = new THREE.Mesh(bodyGeo, steelHullMat);
    body.rotation.x = Math.PI / 2;
    body.position.z = -0.8;
    ship.add(body);

    // Panel lines on body (horizontal rings)
    for (let i = 0; i < 8; i++) {
        const ringGeo = new THREE.TorusGeometry(0.52 + i * 0.003, 0.015, 8, 32);
        const ring = new THREE.Mesh(ringGeo, armorMat);
        ring.position.z = -3.0 + i * 0.7;
        ship.add(ring);
    }

    // Rear engine section - wider
    const rearGeo = new THREE.CylinderGeometry(0.55, 0.7, 1.5, 24);
    const rear = new THREE.Mesh(rearGeo, armorMat);
    rear.rotation.x = Math.PI / 2;
    rear.position.z = 2.2;
    ship.add(rear);

    // === ANGULAR COCKPIT SECTION (Ornithopter inspired) ===
    // Faceted angular cockpit housing
    const cockpitShape = new THREE.Shape();
    cockpitShape.moveTo(0, 0.3);
    cockpitShape.lineTo(0.4, 0.15);
    cockpitShape.lineTo(0.5, -0.1);
    cockpitShape.lineTo(0.3, -0.25);
    cockpitShape.lineTo(-0.3, -0.25);
    cockpitShape.lineTo(-0.5, -0.1);
    cockpitShape.lineTo(-0.4, 0.15);
    cockpitShape.closePath();

    const cockpitGeo = new THREE.ExtrudeGeometry(cockpitShape, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03 });
    const cockpitHousing = new THREE.Mesh(cockpitGeo, armorMat);
    cockpitHousing.rotation.x = Math.PI;
    cockpitHousing.position.set(0, 0.35, -2.8);
    ship.add(cockpitHousing);

    // Angular canopy glass (Ornithopter style faceted)
    const canopyMat = new THREE.MeshPhysicalMaterial({
        color: 0x334455,
        metalness: 0.1,
        roughness: 0.05,
        envMap: cubeRenderTarget.texture,
        envMapIntensity: 2.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });

    // Multi-faceted canopy
    const canopyGeo = new THREE.BoxGeometry(0.7, 0.25, 1.0);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.55, -2.4);
    canopy.name = 'cockpitCanopy';
    ship.add(canopy);

    // Canopy frame strips
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.2 });
    [-0.25, 0, 0.25].forEach(xOff => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), frameMat);
        frame.position.set(xOff, 0.55, -2.4);
        ship.add(frame);
    });

    // Cockpit interior glow
    const interiorGlow = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.15, 0.8),
        new THREE.MeshBasicMaterial({ color: 0x113322, transparent: true, opacity: 0.5 })
    );
    interiorGlow.position.set(0, 0.45, -2.4);
    ship.add(interiorGlow);

    // === LAYERED ARMOR PLATING (EVE Online inspired) ===
    // Top armor layer
    const topArmorGeo = new THREE.BoxGeometry(0.8, 0.08, 2.5);
    const topArmor = new THREE.Mesh(topArmorGeo, armorMat);
    topArmor.position.set(0, 0.55, -0.3);
    ship.add(topArmor);

    // Side armor plates with gold trim
    [-1, 1].forEach(side => {
        // Main side plate
        const sidePlateGeo = new THREE.BoxGeometry(0.1, 0.5, 2.0);
        const sidePlate = new THREE.Mesh(sidePlateGeo, armorMat);
        sidePlate.position.set(side * 0.55, 0.1, -0.5);
        ship.add(sidePlate);

        // Gold accent strip
        const accentStrip = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.08, 1.8),
            accentMat
        );
        accentStrip.position.set(side * 0.56, 0.25, -0.5);
        ship.add(accentStrip);

        // Lower armor skirt
        const skirtGeo = new THREE.BoxGeometry(0.15, 0.3, 1.5);
        const skirt = new THREE.Mesh(skirtGeo, armorMat);
        skirt.position.set(side * 0.6, -0.35, 0);
        ship.add(skirt);
    });

    // === REAR FINS (Starship style) - Symmetric ===
    [-1, 1].forEach(side => {
        // Symmetric fin using box geometry for cleaner look
        const finGeo = new THREE.BoxGeometry(0.06, 1.4, 0.8);
        const fin = new THREE.Mesh(finGeo, steelHullMat);
        fin.position.set(side * 0.75, 0.3, 2.4);
        fin.rotation.z = side * -0.25;
        ship.add(fin);

        // Fin edge trim
        const finTrim = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 1.3, 0.06),
            accentMat
        );
        finTrim.position.set(side * 0.78, 0.3, 2.8);
        finTrim.rotation.z = side * -0.25;
        ship.add(finTrim);
    });

    // === FORWARD CANARD FINS (Starship style) ===
    [-1, 1].forEach(side => {
        const canardGeo = new THREE.BoxGeometry(0.6, 0.04, 0.3);
        const canard = new THREE.Mesh(canardGeo, steelHullMat);
        canard.position.set(side * 0.7, 0.3, -2.8);
        canard.rotation.z = side * 0.15;
        ship.add(canard);
    });

    // === WEAPON PODS (Laser cannons) ===
    [-1, 1].forEach(side => {
        // Weapon pod housing
        const podGeo = new THREE.CylinderGeometry(0.12, 0.15, 1.5, 12);
        const pod = new THREE.Mesh(podGeo, armorMat);
        pod.rotation.x = Math.PI / 2;
        pod.position.set(side * 0.9, -0.15, -1.5);
        ship.add(pod);

        // Laser barrel
        const barrelGeo = new THREE.CylinderGeometry(0.04, 0.05, 2.0, 8);
        const barrel = new THREE.Mesh(barrelGeo, engineMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(side * 0.9, -0.15, -2.5);
        ship.add(barrel);

        // Cannon tip (glowing red)
        const tipGeo = new THREE.SphereGeometry(0.045, 8, 8);
        const tipMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.set(side * 0.9, -0.15, -3.5);
        tip.name = side < 0 ? 'cannonTipLeft' : 'cannonTipRight';
        ship.add(tip);

        // Weapon pod accent
        const podAccent = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.05, 0.8),
            accentMat
        );
        podAccent.position.set(side * 0.9, 0, -1.5);
        ship.add(podAccent);
    });

    // === MAIN ENGINES - Triple blue glow cluster ===
    function makeBlueFlameTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        grad.addColorStop(0, 'rgba(230,245,255,1)');
        grad.addColorStop(0.15, 'rgba(150,200,255,0.95)');
        grad.addColorStop(0.4, 'rgba(50,120,255,0.8)');
        grad.addColorStop(0.7, 'rgba(20,60,200,0.4)');
        grad.addColorStop(1, 'rgba(5,20,100,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }
    const blueFlameTexture = makeBlueFlameTexture();

    // Three main engines in triangular arrangement
    const enginePositions = [
        { x: 0, y: 0.25, name: 'top' },
        { x: -0.3, y: -0.2, name: 'bot_left' },
        { x: 0.3, y: -0.2, name: 'bot_right' }
    ];

    enginePositions.forEach(eng => {
        // Engine bell/nozzle
        const nozzleGeo = new THREE.CylinderGeometry(0.12, 0.2, 0.5, 16);
        const nozzle = new THREE.Mesh(nozzleGeo, engineMat);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(eng.x, eng.y, 2.9);
        ship.add(nozzle);

        // Inner nozzle ring
        const innerRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.11, 0.02, 8, 16),
            new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.9, roughness: 0.1 })
        );
        innerRing.position.set(eng.x, eng.y, 2.65);
        ship.add(innerRing);

        // Hot white core
        const core = new THREE.Mesh(
            new THREE.CircleGeometry(0.1, 16),
            new THREE.MeshBasicMaterial({ color: 0xeeffff })
        );
        core.position.set(eng.x, eng.y, 3.15);
        core.name = `engine_core_${eng.name}`;
        ship.add(core);

        // Main blue flame sprite
        const flameMat = new THREE.SpriteMaterial({
            map: blueFlameTexture,
            color: 0x88ddff,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
        const flame = new THREE.Sprite(flameMat);
        flame.scale.set(0.6, 1.2, 1);
        flame.position.set(eng.x, eng.y, 3.6);
        flame.name = `engine_flame_${eng.name}`;
        ship.add(flame);

        // Outer glow
        const outerMat = new THREE.SpriteMaterial({
            map: blueFlameTexture,
            color: 0x4488ff,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });
        const outer = new THREE.Sprite(outerMat);
        outer.scale.set(0.9, 1.6, 1);
        outer.position.set(eng.x, eng.y, 3.8);
        outer.name = `engine_outer_${eng.name}`;
        ship.add(outer);

        // Point light
        const engLight = new THREE.PointLight(0x4499ff, 0.8, 5, 2);
        engLight.position.set(eng.x, eng.y, 3.2);
        ship.add(engLight);
    });

    // === NAV LIGHTS ===
    const navGeo = new THREE.SphereGeometry(0.03, 8, 8);

    // Red port light
    const navR = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    navR.position.set(-0.9, -0.15, -2.0);
    navR.name = 'navLightRed';
    ship.add(navR);

    // Green starboard light
    const navG = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    navG.position.set(0.9, -0.15, -2.0);
    navG.name = 'navLightGreen';
    ship.add(navG);

    // White tail lights
    const navW1 = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    navW1.position.set(-0.7, 0.5, 2.8);
    ship.add(navW1);
    const navW2 = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    navW2.position.set(0.7, 0.5, 2.8);
    ship.add(navW2);

    // Beacon light on top
    const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff4400 })
    );
    beacon.position.set(0, 0.65, -1.0);
    beacon.name = 'beaconLight';
    ship.add(beacon);

    return ship;
}

const spaceShip = createSpaceShip();
spaceShip.scale.set(0.5, 0.5, 0.5); // Make ship smaller
scene.add(spaceShip);

// === GAME STATE ===
let gameLevel = 1; // 1-10
let earthHealth = 100;
let maxEarthHealth = 100;
let moonHealth = 100;
let maxMoonHealth = 100;
let score = 0;
let highScore = parseInt(localStorage.getItem('earthDefenderHighScore')) || 0;
let gameActive = true;

// NEW: Fixed asteroid count per level (level = number of targets)
let levelAsteroidsRemaining = 0; // Targets left to destroy in current level
let levelAsteroidsTotal = 0; // Total targets for current level
const AMMO_PER_ASTEROID = 40; // Laser ammo given per asteroid in level
let scoreBeforeLevel = 0; // Score saved before level starts (for retry)
let levelFailedShown = false; // Prevent showing fail dialog multiple times

// Track destroyed asteroids for rewards
let asteroidsDestroyed = 0;
const AMMO_REWARD_PER_KILL = 5; // Gain ammo when destroying asteroids
const ANGEL_SPAWN_INTERVAL = 3; // Every 3 kills, spawn an angel asteroid

// === GAME TIMER & LEADERBOARD ===
let gameStartTime = null; // When the current game started
let gameElapsedTime = 0; // Time in seconds
let serverLeaderboard = []; // Top 10 from server
let userLocation = null; // User's location for anonymous submissions
let leaderboardChecked = false; // Prevent multiple submission prompts

// Fetch user's approximate location (city/country) for anonymous submissions
async function fetchUserLocation() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        userLocation = `${data.city || 'Unknown'}, ${data.country_name || 'Unknown'}`;
    } catch (e) {
        userLocation = 'Unknown Location';
    }
}

// Fetch leaderboard from server
async function fetchLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();
        if (data.success) {
            serverLeaderboard = data.leaderboard;
            updateLeaderboardDisplay();
        }
    } catch (e) {
        console.warn('Could not fetch leaderboard:', e);
    }
}

// Submit score to server
async function submitScore(name) {
    const entry = {
        name: name || 'Anonymous',
        score: score,
        time: gameElapsedTime,
        location: name ? undefined : userLocation
    };

    try {
        const response = await fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });
        const data = await response.json();
        if (data.success && data.qualified) {
            serverLeaderboard = data.leaderboard;
            updateLeaderboardDisplay();
            showNotification(`#${data.rank} on leaderboard!`, '#ff44ff');
        }
        return data;
    } catch (e) {
        console.error('Could not submit score:', e);
        return { success: false };
    }
}

// Check if score qualifies for leaderboard
function checkLeaderboardQualification() {
    if (leaderboardChecked) return;

    const minScore = serverLeaderboard.length >= 10 ? serverLeaderboard[9].score : 0;
    if (score > minScore || serverLeaderboard.length < 10) {
        leaderboardChecked = true;
        showLeaderboardSubmitDialog();
    }
}

// Show dialog to submit score to leaderboard
function showLeaderboardSubmitDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'leaderboardSubmitOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10001;
        font-family: 'Courier New', monospace;
    `;

    const rank = serverLeaderboard.length < 10 ? serverLeaderboard.length + 1 :
        serverLeaderboard.findIndex(e => score > e.score) + 1 || 10;

    overlay.innerHTML = `
        <div style="text-align: center; max-width: 450px; padding: 40px; background: rgba(0, 40, 80, 0.95); border: 2px solid #ff44ff; border-radius: 15px; box-shadow: 0 0 40px rgba(255, 68, 255, 0.4);">
            <div style="color: #ff44ff; font-size: 28px; font-weight: bold; margin-bottom: 10px;">
                NEW HIGH SCORE!
            </div>
            <div style="color: #44ff88; font-size: 48px; font-weight: bold; text-shadow: 0 0 20px #44ff88; margin-bottom: 5px;">
                ${score}
            </div>
            <div style="color: #aaaaaa; font-size: 14px; margin-bottom: 20px;">
                Time: ${formatTime(gameElapsedTime)} | Rank: #${rank}
            </div>

            <div style="color: #ffffff; font-size: 16px; margin-bottom: 15px;">
                Enter your name for the leaderboard:
            </div>

            <input type="text" id="playerNameInput" maxlength="20" placeholder="Your name" style="
                width: 80%;
                padding: 12px 15px;
                font-size: 18px;
                font-family: 'Courier New', monospace;
                background: rgba(0, 0, 0, 0.5);
                border: 2px solid #44aaff;
                border-radius: 8px;
                color: #ffffff;
                text-align: center;
                outline: none;
                margin-bottom: 20px;
            " />

            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="submitScoreBtn" style="
                    padding: 12px 30px;
                    font-size: 16px;
                    background: linear-gradient(135deg, #ff44ff, #aa22aa);
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                ">SUBMIT</button>

                <button id="skipScoreBtn" style="
                    padding: 12px 30px;
                    font-size: 16px;
                    background: rgba(100, 100, 100, 0.5);
                    color: #aaa;
                    border: 1px solid #666;
                    border-radius: 8px;
                    cursor: pointer;
                    font-family: 'Courier New', monospace;
                ">SKIP</button>
            </div>

            <div style="color: #666; font-size: 11px; margin-top: 15px;">
                Leave blank to submit as "${userLocation || 'Anonymous'}"
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById('playerNameInput');
    input.focus();

    document.getElementById('submitScoreBtn').addEventListener('click', async () => {
        const name = input.value.trim();
        await submitScore(name || null);
        overlay.remove();
    });

    document.getElementById('skipScoreBtn').addEventListener('click', () => {
        overlay.remove();
    });

    // Enter key submits
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const name = input.value.trim();
            await submitScore(name || null);
            overlay.remove();
        }
    });
}

// === PAUSE FUNCTIONALITY ===
let gamePaused = false;

function togglePause() {
    gamePaused = !gamePaused;
    gameActive = !gamePaused;

    const pauseBtn = document.getElementById('pauseBtn');
    const pauseOverlay = document.getElementById('pauseOverlay');

    if (gamePaused) {
        // Show pause overlay
        if (!pauseOverlay) {
            const overlay = document.createElement('div');
            overlay.id = 'pauseOverlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                font-family: 'Courier New', monospace;
            `;
            overlay.innerHTML = `
                <div style="color: #44aaff; font-size: 48px; font-weight: bold; text-shadow: 0 0 20px #44aaff; letter-spacing: 8px;">PAUSED</div>
                <button id="resumeBtn" style="
                    margin-top: 30px;
                    padding: 15px 40px;
                    font-size: 18px;
                    font-weight: bold;
                    font-family: 'Courier New', monospace;
                    background: rgba(68, 255, 136, 0.2);
                    border: 2px solid #44ff88;
                    border-radius: 8px;
                    color: #44ff88;
                    cursor: pointer;
                    letter-spacing: 3px;
                    transition: all 0.2s;
                ">RESUME</button>
            `;
            document.body.appendChild(overlay);
            document.getElementById('resumeBtn').addEventListener('click', () => {
                togglePause();
            });
        }
        if (pauseBtn) {
            pauseBtn.textContent = 'RESUME';
            pauseBtn.style.borderColor = '#44ff88';
            pauseBtn.style.color = '#44ff88';
        }
        // Save game state when pausing
        saveGameState();
    } else {
        // Remove pause overlay
        if (pauseOverlay) pauseOverlay.remove();
        if (pauseBtn) {
            pauseBtn.textContent = 'PAUSE';
            pauseBtn.style.borderColor = '#44aaff';
            pauseBtn.style.color = '#44aaff';
        }
    }
}

// === GAME STATE PERSISTENCE ===
const SAVE_KEY = 'earthDefenderSavedGame';

function saveGameState() {
    const state = {
        gameLevel,
        earthHealth,
        moonHealth,
        score,
        asteroidsDestroyed,
        gameElapsedTime,
        levelAsteroidsRemaining,
        levelAsteroidsTotal,
        laserAmmo,
        scoreBeforeLevel,
        savedAt: Date.now()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function loadGameState() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return null;
    try {
        return JSON.parse(saved);
    } catch (e) {
        return null;
    }
}

function clearSavedGame() {
    localStorage.removeItem(SAVE_KEY);
}

function hasSavedGame() {
    return localStorage.getItem(SAVE_KEY) !== null;
}

function restoreGameState(state) {
    gameLevel = state.gameLevel;
    earthHealth = state.earthHealth;
    moonHealth = state.moonHealth !== undefined ? state.moonHealth : maxMoonHealth;
    score = state.score;
    asteroidsDestroyed = state.asteroidsDestroyed;
    gameElapsedTime = state.gameElapsedTime;
    levelAsteroidsRemaining = state.levelAsteroidsRemaining;
    levelAsteroidsTotal = state.levelAsteroidsTotal;
    laserAmmo = state.laserAmmo;
    scoreBeforeLevel = state.scoreBeforeLevel;

    // Set game start time to account for elapsed time
    gameStartTime = Date.now() - (gameElapsedTime * 1000);

    // Update displays
    updateHealthDisplay();
    updateMoonHealthDisplay();
    updateScoreDisplay();
    updateAmmoDisplay();
    updateKillCountDisplay();
    updateLevelDisplay();
}

function showContinueDialog() {
    const savedState = loadGameState();
    if (!savedState) return;

    gameActive = false; // Pause game during dialog

    const overlay = document.createElement('div');
    overlay.id = 'continueDialogOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10002;
        font-family: 'Courier New', monospace;
    `;

    const savedTime = new Date(savedState.savedAt);
    const timeAgo = formatTimeAgo(savedState.savedAt);

    overlay.innerHTML = `
        <div style="text-align: center; max-width: 450px; padding: 40px; background: rgba(0, 40, 80, 0.95); border: 2px solid #44aaff; border-radius: 15px; box-shadow: 0 0 40px rgba(68, 170, 255, 0.4);">
            <div style="color: #44aaff; font-size: 28px; font-weight: bold; margin-bottom: 20px; letter-spacing: 2px;">
                SAVED GAME FOUND
            </div>
            <div style="color: #ffffff; font-size: 16px; margin-bottom: 15px;">
                Level ${savedState.gameLevel} • Score: ${savedState.score}
            </div>
            <div style="color: #888; font-size: 12px; margin-bottom: 25px;">
                Saved ${timeAgo}
            </div>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="continueGameBtn" style="
                    padding: 15px 30px;
                    font-size: 16px;
                    background: rgba(68, 255, 136, 0.3);
                    color: #44ff88;
                    border: 2px solid #44ff88;
                    border-radius: 8px;
                    cursor: pointer;
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                    letter-spacing: 1px;
                    transition: all 0.2s;
                ">CONTINUE</button>
                <button id="newGameBtn" style="
                    padding: 15px 30px;
                    font-size: 16px;
                    background: rgba(255, 100, 100, 0.2);
                    color: #ff6666;
                    border: 2px solid #ff6666;
                    border-radius: 8px;
                    cursor: pointer;
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                    letter-spacing: 1px;
                    transition: all 0.2s;
                ">NEW GAME</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('continueGameBtn').addEventListener('click', () => {
        restoreGameState(savedState);
        startLevel(savedState.gameLevel); // Resume at saved level
        overlay.remove();
        gameActive = true;
    });

    document.getElementById('newGameBtn').addEventListener('click', () => {
        clearSavedGame();
        overlay.remove();
        restartGame();
    });
}

function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

// Show quit confirmation dialog
function showQuitDialog() {
    gameActive = false; // Pause game

    const overlay = document.createElement('div');
    overlay.id = 'quitDialogOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10001;
        font-family: 'Courier New', monospace;
    `;

    // Check if score qualifies for leaderboard
    const minScore = serverLeaderboard.length >= 10 ? serverLeaderboard[9].score : 0;
    const qualifies = score > 0 && (score > minScore || serverLeaderboard.length < 10);
    const rank = serverLeaderboard.length < 10 ? serverLeaderboard.length + 1 :
        serverLeaderboard.findIndex(e => score > e.score) + 1 || 10;

    if (qualifies) {
        // Score qualifies - show submit option
        overlay.innerHTML = `
            <div style="text-align: center; max-width: 450px; padding: 40px; background: rgba(0, 40, 80, 0.95); border: 2px solid #ffaa00; border-radius: 15px; box-shadow: 0 0 40px rgba(255, 170, 0, 0.4);">
                <div style="color: #ffaa00; font-size: 24px; font-weight: bold; margin-bottom: 15px;">
                    QUIT GAME?
                </div>
                <div style="color: #44ff88; font-size: 36px; font-weight: bold; text-shadow: 0 0 20px #44ff88; margin-bottom: 5px;">
                    Score: ${score}
                </div>
                <div style="color: #ff44ff; font-size: 16px; margin-bottom: 20px;">
                    Your score qualifies for the leaderboard! (Rank #${rank})
                </div>

                <div style="color: #ffffff; font-size: 14px; margin-bottom: 10px;">
                    Enter your name to save your score:
                </div>

                <input type="text" id="quitPlayerNameInput" maxlength="20" placeholder="Your name" style="
                    width: 80%;
                    padding: 12px 15px;
                    font-size: 18px;
                    font-family: 'Courier New', monospace;
                    background: rgba(0, 0, 0, 0.5);
                    border: 2px solid #44aaff;
                    border-radius: 8px;
                    color: #ffffff;
                    text-align: center;
                    outline: none;
                    margin-bottom: 20px;
                " />

                <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                    <button id="submitAndQuitBtn" style="
                        padding: 12px 25px;
                        font-size: 14px;
                        background: linear-gradient(135deg, #ff44ff, #aa22aa);
                        color: #fff;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-family: 'Courier New', monospace;
                        font-weight: bold;
                    ">SUBMIT & QUIT</button>

                    <button id="justQuitBtn" style="
                        padding: 12px 25px;
                        font-size: 14px;
                        background: rgba(255, 100, 100, 0.3);
                        color: #ff6666;
                        border: 1px solid #ff6666;
                        border-radius: 8px;
                        cursor: pointer;
                        font-family: 'Courier New', monospace;
                    ">JUST QUIT</button>

                    <button id="cancelQuitBtn" style="
                        padding: 12px 25px;
                        font-size: 14px;
                        background: rgba(100, 100, 100, 0.5);
                        color: #aaa;
                        border: 1px solid #666;
                        border-radius: 8px;
                        cursor: pointer;
                        font-family: 'Courier New', monospace;
                    ">CANCEL</button>
                </div>

                <div style="color: #666; font-size: 11px; margin-top: 15px;">
                    Leave blank to submit as "${userLocation || 'Anonymous'}"
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = document.getElementById('quitPlayerNameInput');
        input.focus();

        document.getElementById('submitAndQuitBtn').addEventListener('click', async () => {
            const name = input.value.trim();
            await submitScore(name || null);
            overlay.remove();
            showInstructions(false);
        });

        document.getElementById('justQuitBtn').addEventListener('click', () => {
            overlay.remove();
            showInstructions(false);
        });

        document.getElementById('cancelQuitBtn').addEventListener('click', () => {
            overlay.remove();
            gameActive = true; // Resume game
        });

        // Enter key submits
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const name = input.value.trim();
                await submitScore(name || null);
                overlay.remove();
                showInstructions(false);
            }
        });
    } else {
        // Score doesn't qualify - simple quit confirmation
        overlay.innerHTML = `
            <div style="text-align: center; max-width: 400px; padding: 40px; background: rgba(0, 40, 80, 0.95); border: 2px solid #ffaa00; border-radius: 15px; box-shadow: 0 0 40px rgba(255, 170, 0, 0.4);">
                <div style="color: #ffaa00; font-size: 24px; font-weight: bold; margin-bottom: 15px;">
                    QUIT GAME?
                </div>
                <div style="color: #44ff88; font-size: 28px; font-weight: bold; margin-bottom: 20px;">
                    Score: ${score}
                </div>
                <div style="color: #aaaaaa; font-size: 14px; margin-bottom: 25px;">
                    Your progress will be lost.
                </div>

                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button id="confirmQuitBtn" style="
                        padding: 12px 30px;
                        font-size: 16px;
                        background: rgba(255, 100, 100, 0.3);
                        color: #ff6666;
                        border: 1px solid #ff6666;
                        border-radius: 8px;
                        cursor: pointer;
                        font-family: 'Courier New', monospace;
                        font-weight: bold;
                    ">QUIT</button>

                    <button id="cancelQuitBtn2" style="
                        padding: 12px 30px;
                        font-size: 16px;
                        background: rgba(68, 255, 136, 0.2);
                        color: #44ff88;
                        border: 1px solid #44ff88;
                        border-radius: 8px;
                        cursor: pointer;
                        font-family: 'Courier New', monospace;
                        font-weight: bold;
                    ">CANCEL</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('confirmQuitBtn').addEventListener('click', () => {
            overlay.remove();
            showInstructions(false);
        });

        document.getElementById('cancelQuitBtn2').addEventListener('click', () => {
            overlay.remove();
            gameActive = true; // Resume game
        });
    }
}

// Format time as MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update leaderboard display in dashboard
function updateLeaderboardDisplay() {
    const container = document.getElementById('leaderboardList');
    if (!container) return;

    if (serverLeaderboard.length === 0) {
        container.innerHTML = '<div style="color: #666; font-size: 9px; text-align: center;">No scores yet</div>';
        return;
    }

    container.innerHTML = serverLeaderboard.slice(0, 5).map((entry, i) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0; ${i === 0 ? 'color: #ffd700;' : i === 1 ? 'color: #c0c0c0;' : i === 2 ? 'color: #cd7f32;' : 'color: #888;'}">
            <span style="font-size: 8px;">${i + 1}. ${entry.name.substring(0, 10)}</span>
            <span style="font-size: 9px; font-weight: bold;">${entry.score}</span>
        </div>
    `).join('');
}

// Initialize leaderboard on load
fetchUserLocation();
fetchLeaderboard();

// === SOUND SYSTEM ===
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false'; // Default true, persist across sessions
let showDpadControls = false; // D-pad movement controls hidden by default
let showTouchHints = localStorage.getItem('showTouchHints') !== 'false'; // Default true for new users
let touchHintsShownThisSession = false; // Track if hints were already shown this game session

// Global functions for touch hints (will be assigned when overlay is created)
let updateTouchHintsOverlay = () => {};
let hideTouchHints = () => {};
let audioContext = null;
let audioContextReady = false;

// Lazy-initialize AudioContext on first user gesture
function getAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContextReady = audioContext.state === 'running';
        } catch (e) {
            return null;
        }
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            audioContextReady = true;
        }).catch(() => {});
    } else if (audioContext.state === 'running') {
        audioContextReady = true;
    }
    return audioContextReady ? audioContext : null;
}

// Sound manager with synthesized sounds
const SoundManager = {
    playLaser() {
        if (!soundEnabled) return;
        const ctx = getAudioContext();
        if (!ctx) return; // Audio not ready yet

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Laser sound: quick descending frequency
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(800, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
    },

    playExplosion(size = 1) {
        if (!soundEnabled) return;
        const ctx = getAudioContext();
        if (!ctx) return; // Audio not ready yet

        // White noise for explosion
        const bufferSize = ctx.sampleRate * 0.5; // 0.5 second
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);

        const gainNode = ctx.createGain();
        const volume = Math.min(0.2, 0.1 * size);
        gainNode.gain.setValueAtTime(volume, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        noise.start(ctx.currentTime);
        noise.stop(ctx.currentTime + 0.5);
    },

    playVictory() {
        if (!soundEnabled) return;

        // Victory fanfare: ascending arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, C (one octave up)

        notes.forEach((freq, index) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);

            const startTime = audioContext.currentTime + index * 0.15;
            gainNode.gain.setValueAtTime(0.2, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);

            oscillator.start(startTime);
            oscillator.stop(startTime + 0.4);
        });
    }
};

// === LASER SYSTEM ===
const laserBolts = [];
const LASER_SPEED = 80;
const LASER_MAX_DISTANCE = 200;
let laserAmmo = 1000;

// Active asteroids and explosions
const asteroids = [];
const explosions = [];

// Occlusion detection for targeting reticles (reused every frame for performance)
const occlusionRaycaster = new THREE.Raycaster();
let occludingObjects = []; // Will be populated after earth, moon, spaceShip are created

// Asteroid spawn settings
const ASTEROID_SPAWN_MIN_DISTANCE = 120;
const ASTEROID_SPAWN_MAX_DISTANCE = 180;
const ASTEROID_MIN_SIZE = 0.5;
const ASTEROID_MAX_SIZE = 2.0;
const EARTH_RADIUS = 2; // For collision detection
const MOON_RADIUS = 0.5; // For collision detection

// Dynamic score weighting settings
const BASE_ORBIT_SPEED = 0.25; // Default orbit speed
const MAX_ORBIT_SPEED_MULTIPLIER = 2.5; // Max multiplier from orbit speed
const MAX_PROXIMITY_MULTIPLIER = 4.0; // Max multiplier from close kills
const DANGER_ZONE_DISTANCE = 15; // Distance where proximity bonus starts ramping up
let lastScoreMultiplier = 1.0; // Track last multiplier for display

// Calculate dynamic score multiplier based on orbit speed and asteroid proximity
function calculateScoreMultiplier(asteroidDistance) {
    // Orbit speed multiplier: faster orbit = more points
    // Normalized from BASE_ORBIT_SPEED (1.0x) up to MAX_ORBIT_SPEED_MULTIPLIER
    const speedRatio = Math.abs(shipOrbitSpeed) / BASE_ORBIT_SPEED;
    const orbitMultiplier = Math.min(1.0 + (speedRatio - 1.0) * 0.5, MAX_ORBIT_SPEED_MULTIPLIER);

    // Proximity multiplier: closer to Earth = more points
    // Distance ranges from ~EARTH_RADIUS (very close) to ASTEROID_SPAWN_MIN_DISTANCE (far)
    const impactDistance = Math.max(0, asteroidDistance - EARTH_RADIUS);
    const dangerProgress = Math.max(0, 1 - (impactDistance / DANGER_ZONE_DISTANCE));
    const proximityMultiplier = 1.0 + (dangerProgress * (MAX_PROXIMITY_MULTIPLIER - 1.0));

    // Combine multipliers (multiplicative for exciting high scores)
    const totalMultiplier = orbitMultiplier * proximityMultiplier;
    lastScoreMultiplier = totalMultiplier;

    return totalMultiplier;
}

// Constant asteroid speed (difficulty comes from quantity, not speed)
function getAsteroidSpeed() {
    const min = 0.8;
    const max = 1.5;
    return min + Math.random() * (max - min);
}

// Create laser bolt geometry and material (reusable)
const laserGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8);
const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
const laserGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.6
});

// Glow geometry for laser bolts (reusable)
const laserGlowGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8);

// === OBJECT POOLING SYSTEM ===
// Pool sizes generous enough for intense combat
const laserPool = [];
const LASER_POOL_INITIAL_SIZE = 100;  // Supports rapid fire with 2 bolts per shot
const explosionParticlePool = [];
const EXPLOSION_POOL_INITIAL_SIZE = 500;  // Supports multiple simultaneous explosions (30+ particles each)
const debrisPool = [];
const DEBRIS_POOL_INITIAL_SIZE = 200;  // Supports multiple hit sparks (5 debris each)
const explosionLightPool = [];
const LIGHT_POOL_INITIAL_SIZE = 50;  // Lights for explosions and laser bolts

const pooledSphereGeos = {
    small: new THREE.SphereGeometry(1, 6, 6),
    medium: new THREE.SphereGeometry(1, 8, 8)
};
const pooledTetraGeo = new THREE.TetrahedronGeometry(1);

const explosionColors = [0xff4400, 0xff8800, 0xffcc00, 0xffffff];
const sparkColors = [0xffff00, 0xff8800, 0xffffff, 0xff4400, 0xffcc00];
const angelColors = [0x88ffaa, 0xffffff, 0xaaffcc, 0xffdd88];
const debrisColor = 0x6b5b4d;

const explosionMaterials = explosionColors.map(color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
const sparkMaterials = sparkColors.map(color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
const angelMaterials = angelColors.map(color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
const debrisMaterial = new THREE.MeshBasicMaterial({ color: debrisColor, transparent: true, opacity: 1 });

function createPooledLaserBolt() {
    const bolt = new THREE.Group();
    const core = new THREE.Mesh(laserGeo, laserMat);
    core.rotation.x = Math.PI / 2;
    bolt.add(core);
    const glow = new THREE.Mesh(laserGlowGeo, laserGlowMat);
    glow.rotation.x = Math.PI / 2;
    bolt.add(glow);
    const light = new THREE.PointLight(0xff3300, 0.8, 2);
    bolt.add(light);
    bolt.userData.pooled = true;
    bolt.userData.inUse = false;
    bolt.visible = false;
    return bolt;
}

function createPooledParticle() {
    const mesh = new THREE.Mesh(pooledSphereGeos.medium, explosionMaterials[0]);
    mesh.userData.pooled = true;
    mesh.userData.inUse = false;
    mesh.visible = false;
    return mesh;
}

function createPooledDebris() {
    const mesh = new THREE.Mesh(pooledTetraGeo, debrisMaterial.clone());
    mesh.userData.pooled = true;
    mesh.userData.inUse = false;
    mesh.visible = false;
    return mesh;
}

function createPooledExplosionLight() {
    const light = new THREE.PointLight(0xff8800, 3, 20);
    light.userData.pooled = true;
    light.userData.inUse = false;
    light.visible = false;
    return light;
}

function initObjectPools() {
    for (let i = 0; i < LASER_POOL_INITIAL_SIZE; i++) laserPool.push(createPooledLaserBolt());
    for (let i = 0; i < EXPLOSION_POOL_INITIAL_SIZE; i++) explosionParticlePool.push(createPooledParticle());
    for (let i = 0; i < DEBRIS_POOL_INITIAL_SIZE; i++) debrisPool.push(createPooledDebris());
    for (let i = 0; i < LIGHT_POOL_INITIAL_SIZE; i++) explosionLightPool.push(createPooledExplosionLight());
}

function getLaserFromPool() {
    for (let i = 0; i < laserPool.length; i++) {
        if (!laserPool[i].userData.inUse) {
            const bolt = laserPool[i];
            bolt.userData.inUse = true;
            bolt.visible = true;
            return bolt;
        }
    }
    const newBolt = createPooledLaserBolt();
    newBolt.userData.inUse = true;
    newBolt.visible = true;
    laserPool.push(newBolt);
    return newBolt;
}

function returnLaserToPool(bolt) {
    bolt.userData.inUse = false;
    bolt.visible = false;
    bolt.position.set(0, 0, 0);
    bolt.quaternion.identity();
    bolt.userData.velocity = null;
    bolt.userData.distanceTraveled = 0;
    if (bolt.parent) bolt.parent.remove(bolt);
}

function getParticleFromPool() {
    for (let i = 0; i < explosionParticlePool.length; i++) {
        if (!explosionParticlePool[i].userData.inUse) {
            const particle = explosionParticlePool[i];
            particle.userData.inUse = true;
            particle.visible = true;
            return particle;
        }
    }
    const newParticle = createPooledParticle();
    newParticle.userData.inUse = true;
    newParticle.visible = true;
    explosionParticlePool.push(newParticle);
    return newParticle;
}

function returnParticleToPool(particle) {
    particle.userData.inUse = false;
    particle.visible = false;
    particle.position.set(0, 0, 0);
    particle.scale.set(1, 1, 1);
    particle.rotation.set(0, 0, 0);
    if (particle.material) particle.material.opacity = 1;
    if (particle.parent) particle.parent.remove(particle);
}

function getDebrisFromPool() {
    for (let i = 0; i < debrisPool.length; i++) {
        if (!debrisPool[i].userData.inUse) {
            const debris = debrisPool[i];
            debris.userData.inUse = true;
            debris.visible = true;
            return debris;
        }
    }
    const newDebris = createPooledDebris();
    newDebris.userData.inUse = true;
    newDebris.visible = true;
    debrisPool.push(newDebris);
    return newDebris;
}

function returnDebrisToPool(debris) {
    debris.userData.inUse = false;
    debris.visible = false;
    debris.position.set(0, 0, 0);
    debris.scale.set(1, 1, 1);
    debris.rotation.set(0, 0, 0);
    if (debris.material) debris.material.opacity = 1;
    if (debris.parent) debris.parent.remove(debris);
}

function getExplosionLightFromPool() {
    for (let i = 0; i < explosionLightPool.length; i++) {
        if (!explosionLightPool[i].userData.inUse) {
            const light = explosionLightPool[i];
            light.userData.inUse = true;
            light.visible = true;
            return light;
        }
    }
    const newLight = createPooledExplosionLight();
    newLight.userData.inUse = true;
    newLight.visible = true;
    explosionLightPool.push(newLight);
    return newLight;
}

function returnExplosionLightToPool(light) {
    light.userData.inUse = false;
    light.visible = false;
    light.intensity = 3;
    light.distance = 20;
    light.color.setHex(0xff8800);
    if (light.parent) light.parent.remove(light);
}

function disposeObject(obj) {
    if (!obj) return;
    if (obj.userData && obj.userData.pooled) return;
    if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
    if (obj.material) {
        if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => { if (!mat.userData?.shared) mat.dispose(); });
        } else if (!obj.material.userData?.shared) obj.material.dispose();
    }
    if (obj.children) obj.children.forEach(child => disposeObject(child));
}

function cleanupExplosionGroup(explosionGroup) {
    if (!explosionGroup) return;
    const children = [...explosionGroup.children];
    for (const child of children) {
        if (child.userData && child.userData.pooled) {
            if (child.isLight) returnExplosionLightToPool(child);
            else if (child.geometry === pooledTetraGeo) returnDebrisToPool(child);
            else returnParticleToPool(child);
        } else disposeObject(child);
    }
    explosionGroup.children.length = 0;
}

// Release all active pooled objects back to pools (for level transitions/game reset)
function releaseAllPooledObjects() {
    // Return all active laser bolts to pool
    for (let i = laserBolts.length - 1; i >= 0; i--) {
        const bolt = laserBolts[i];
        returnLaserToPool(bolt);
    }
    laserBolts.length = 0;

    // Return all active explosion particles/debris/lights to pools
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];
        cleanupExplosionGroup(explosion);
        scene.remove(explosion);
    }
    explosions.length = 0;

    console.log('[POOLS] All pooled objects released');
}

// === INSTANCED MESH PARTICLE SYSTEM ===
// Pre-allocated InstancedMesh for optimal GPU batch rendering of explosion particles and debris.
// This eliminates per-explosion object creation overhead and reduces draw calls significantly.

const INSTANCED_PARTICLE_MAX = 1500; // Max sphere particles (explosions + sparks)
const INSTANCED_DEBRIS_MAX = 500;    // Max tetrahedron debris chunks

// Particle data arrays - store state for each active instance
// Using typed arrays for better performance and memory layout
const instancedParticleData = {
    positions: new Float32Array(INSTANCED_PARTICLE_MAX * 3),     // x, y, z world position
    velocities: new Float32Array(INSTANCED_PARTICLE_MAX * 3),    // velocity vector
    scales: new Float32Array(INSTANCED_PARTICLE_MAX),            // current scale
    initialScales: new Float32Array(INSTANCED_PARTICLE_MAX),     // scale at spawn (for growth animation)
    createdAt: new Float32Array(INSTANCED_PARTICLE_MAX),         // timestamp when spawned
    durations: new Float32Array(INSTANCED_PARTICLE_MAX),         // lifespan in ms
    colorIndices: new Uint8Array(INSTANCED_PARTICLE_MAX),        // index into color palette
    active: new Uint8Array(INSTANCED_PARTICLE_MAX),              // 1 = active, 0 = available
    count: 0                                                      // current active count
};

const instancedDebrisData = {
    positions: new Float32Array(INSTANCED_DEBRIS_MAX * 3),
    velocities: new Float32Array(INSTANCED_DEBRIS_MAX * 3),
    rotations: new Float32Array(INSTANCED_DEBRIS_MAX * 3),       // current rotation euler
    rotationSpeeds: new Float32Array(INSTANCED_DEBRIS_MAX * 3),  // rotation speed per axis
    scales: new Float32Array(INSTANCED_DEBRIS_MAX),
    initialScales: new Float32Array(INSTANCED_DEBRIS_MAX),
    createdAt: new Float32Array(INSTANCED_DEBRIS_MAX),
    durations: new Float32Array(INSTANCED_DEBRIS_MAX),
    active: new Uint8Array(INSTANCED_DEBRIS_MAX),
    count: 0
};

// Track explosion lights separately (can't be instanced, but can be pooled)
const instancedExplosionLights = [];
const INSTANCED_LIGHT_MAX = 30;

// Pre-allocated color palette as THREE.Color objects for fast lookup
const particleColorPalette = [
    new THREE.Color(0xff4400), // explosion orange-red
    new THREE.Color(0xff8800), // explosion orange
    new THREE.Color(0xffcc00), // explosion yellow
    new THREE.Color(0xffffff), // white
    new THREE.Color(0xffff00), // spark yellow
    new THREE.Color(0x88ffaa), // angel green
    new THREE.Color(0xaaffcc), // angel light green
    new THREE.Color(0xffdd88)  // angel gold
];
const debrisColorInstance = new THREE.Color(0x6b5b4d);

// Reusable Object3D for matrix calculations (shared across all instances)
const _instanceDummy = new THREE.Object3D();
const _instanceMatrix = new THREE.Matrix4();
const _instanceColor = new THREE.Color();

// The InstancedMesh objects - created once, reused forever
let instancedParticleMesh = null;
let instancedDebrisMesh = null;

/**
 * Initialize the instanced mesh particle system.
 * Call this once during game startup, before any explosions can occur.
 */
function initInstancedParticleSystem() {
    // Create sphere geometry for particles (shared by all instances)
    const particleGeometry = new THREE.SphereGeometry(1, 8, 8);

    // Material with vertex colors for per-instance coloring
    const particleMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 1,
        vertexColors: false // We'll update color via setColorAt
    });

    // Create the InstancedMesh with maximum capacity
    instancedParticleMesh = new THREE.InstancedMesh(
        particleGeometry,
        particleMaterial,
        INSTANCED_PARTICLE_MAX
    );
    instancedParticleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedParticleMesh.frustumCulled = false; // Particles can be anywhere
    instancedParticleMesh.count = 0; // Start with no visible instances
    instancedParticleMesh.name = 'InstancedParticles';

    // Initialize instance colors buffer
    instancedParticleMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(INSTANCED_PARTICLE_MAX * 3),
        3
    );
    instancedParticleMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    scene.add(instancedParticleMesh);

    // Create tetrahedron geometry for debris
    const debrisGeometry = new THREE.TetrahedronGeometry(1);
    const debrisMaterial = new THREE.MeshBasicMaterial({
        color: 0x6b5b4d,
        transparent: true,
        opacity: 1
    });

    instancedDebrisMesh = new THREE.InstancedMesh(
        debrisGeometry,
        debrisMaterial,
        INSTANCED_DEBRIS_MAX
    );
    instancedDebrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedDebrisMesh.frustumCulled = false;
    instancedDebrisMesh.count = 0;
    instancedDebrisMesh.name = 'InstancedDebris';

    scene.add(instancedDebrisMesh);

    // Pre-create pooled lights for explosions
    for (let i = 0; i < INSTANCED_LIGHT_MAX; i++) {
        const light = new THREE.PointLight(0xff8800, 0, 20);
        light.visible = false;
        light.userData = { inUse: false, createdAt: 0, duration: 0 };
        scene.add(light);
        instancedExplosionLights.push(light);
    }

    console.log('[InstancedParticles] Initialized with', INSTANCED_PARTICLE_MAX, 'particles,', INSTANCED_DEBRIS_MAX, 'debris');
}

/**
 * Allocate a particle instance from the pool.
 * Returns the index of the allocated instance, or -1 if pool is exhausted.
 */
function allocateParticleInstance() {
    const data = instancedParticleData;
    // Find first inactive slot
    for (let i = 0; i < INSTANCED_PARTICLE_MAX; i++) {
        if (data.active[i] === 0) {
            data.active[i] = 1;
            return i;
        }
    }
    // Pool exhausted - find oldest particle and reuse it
    let oldestIdx = 0;
    let oldestTime = data.createdAt[0];
    for (let i = 1; i < INSTANCED_PARTICLE_MAX; i++) {
        if (data.createdAt[i] < oldestTime) {
            oldestTime = data.createdAt[i];
            oldestIdx = i;
        }
    }
    return oldestIdx;
}

/**
 * Allocate a debris instance from the pool.
 */
function allocateDebrisInstance() {
    const data = instancedDebrisData;
    for (let i = 0; i < INSTANCED_DEBRIS_MAX; i++) {
        if (data.active[i] === 0) {
            data.active[i] = 1;
            return i;
        }
    }
    // Reuse oldest
    let oldestIdx = 0;
    let oldestTime = data.createdAt[0];
    for (let i = 1; i < INSTANCED_DEBRIS_MAX; i++) {
        if (data.createdAt[i] < oldestTime) {
            oldestTime = data.createdAt[i];
            oldestIdx = i;
        }
    }
    return oldestIdx;
}

/**
 * Get an explosion light from the pool.
 */
function getInstancedExplosionLight() {
    for (let i = 0; i < instancedExplosionLights.length; i++) {
        const light = instancedExplosionLights[i];
        if (!light.userData.inUse) {
            light.userData.inUse = true;
            light.visible = true;
            light.intensity = 3;
            return light;
        }
    }
    return null; // All lights in use
}

/**
 * Spawn particles for an explosion using the instanced system.
 * @param {THREE.Vector3} position - World position of the explosion
 * @param {number} asteroidSize - Size multiplier for the explosion
 * @param {string} type - 'explosion', 'spark', or 'angel'
 */
function spawnInstancedExplosion(position, asteroidSize = 1, type = 'explosion') {
    const now = Date.now();
    const scaleFactor = Math.max(0.5, asteroidSize);
    const particleCount = type === 'spark' ? 20 : Math.floor(6 + asteroidSize * 4);
    const duration = type === 'spark' ? 400 : (600 + asteroidSize * 200);

    // Select color palette based on type
    let colorStart, colorCount;
    if (type === 'angel') {
        colorStart = 5; // angel colors start at index 5
        colorCount = 3;
    } else if (type === 'spark') {
        colorStart = 0; // sparks use explosion + spark colors
        colorCount = 5;
    } else {
        colorStart = 0; // explosion colors
        colorCount = 4;
    }

    // Spawn particles
    for (let i = 0; i < particleCount; i++) {
        const idx = allocateParticleInstance();
        if (idx < 0) continue;

        const size = (0.2 + Math.random() * 0.4) * scaleFactor;
        const i3 = idx * 3;

        // Position with random offset
        instancedParticleData.positions[i3] = position.x + (Math.random() - 0.5) * scaleFactor;
        instancedParticleData.positions[i3 + 1] = position.y + (Math.random() - 0.5) * scaleFactor;
        instancedParticleData.positions[i3 + 2] = position.z + (Math.random() - 0.5) * scaleFactor;

        // Velocity
        const velocityMult = type === 'spark' ? 25 : 8;
        instancedParticleData.velocities[i3] = (Math.random() - 0.5) * velocityMult * scaleFactor;
        instancedParticleData.velocities[i3 + 1] = (Math.random() - 0.5) * velocityMult * scaleFactor;
        instancedParticleData.velocities[i3 + 2] = (Math.random() - 0.5) * velocityMult * scaleFactor;

        // Scale and timing
        instancedParticleData.scales[idx] = size;
        instancedParticleData.initialScales[idx] = size;
        instancedParticleData.createdAt[idx] = now;
        instancedParticleData.durations[idx] = duration;
        instancedParticleData.colorIndices[idx] = colorStart + Math.floor(Math.random() * colorCount);
        instancedParticleData.active[idx] = 1;
    }

    // Spawn debris for sparks (hit effects)
    if (type === 'spark') {
        for (let i = 0; i < 5; i++) {
            const idx = allocateDebrisInstance();
            if (idx < 0) continue;

            const chunkSize = 0.15 + Math.random() * 0.2;
            const i3 = idx * 3;

            instancedDebrisData.positions[i3] = position.x;
            instancedDebrisData.positions[i3 + 1] = position.y;
            instancedDebrisData.positions[i3 + 2] = position.z;

            instancedDebrisData.velocities[i3] = (Math.random() - 0.5) * 15;
            instancedDebrisData.velocities[i3 + 1] = (Math.random() - 0.5) * 15;
            instancedDebrisData.velocities[i3 + 2] = (Math.random() - 0.5) * 15;

            instancedDebrisData.rotations[i3] = Math.random() * Math.PI * 2;
            instancedDebrisData.rotations[i3 + 1] = Math.random() * Math.PI * 2;
            instancedDebrisData.rotations[i3 + 2] = Math.random() * Math.PI * 2;

            instancedDebrisData.rotationSpeeds[i3] = Math.random() * 5;
            instancedDebrisData.rotationSpeeds[i3 + 1] = Math.random() * 5;
            instancedDebrisData.rotationSpeeds[i3 + 2] = Math.random() * 5;

            instancedDebrisData.scales[idx] = chunkSize;
            instancedDebrisData.initialScales[idx] = chunkSize;
            instancedDebrisData.createdAt[idx] = now;
            instancedDebrisData.durations[idx] = duration;
            instancedDebrisData.active[idx] = 1;
        }
    }

    // Add explosion light
    const light = getInstancedExplosionLight();
    if (light) {
        light.position.copy(position);
        light.intensity = 3 * scaleFactor;
        light.distance = 20 * scaleFactor;
        light.color.setHex(type === 'angel' ? 0x88ffaa : 0xff8800);
        light.userData.createdAt = now;
        light.userData.duration = duration;
    }
}

/**
 * Update all instanced particles and debris each frame.
 * Call this from the animation loop.
 * @param {number} delta - Time since last frame in seconds
 */
function updateInstancedParticles(delta) {
    const now = Date.now();
    let activeParticleCount = 0;
    let activeDebrisCount = 0;

    // Update particles
    const pData = instancedParticleData;
    for (let i = 0; i < INSTANCED_PARTICLE_MAX; i++) {
        if (pData.active[i] === 0) continue;

        const age = now - pData.createdAt[i];
        const progress = age / pData.durations[i];

        if (progress >= 1) {
            // Particle expired
            pData.active[i] = 0;
            continue;
        }

        const i3 = i * 3;

        // Update position based on velocity
        pData.positions[i3] += pData.velocities[i3] * delta;
        pData.positions[i3 + 1] += pData.velocities[i3 + 1] * delta;
        pData.positions[i3 + 2] += pData.velocities[i3 + 2] * delta;

        // Update scale (grow over time)
        pData.scales[i] = pData.initialScales[i] * (1 + progress * 3);

        // Build transformation matrix
        _instanceDummy.position.set(
            pData.positions[i3],
            pData.positions[i3 + 1],
            pData.positions[i3 + 2]
        );
        _instanceDummy.scale.setScalar(pData.scales[i]);
        _instanceDummy.updateMatrix();

        // Set matrix at the ACTIVE index (compact rendering)
        instancedParticleMesh.setMatrixAt(activeParticleCount, _instanceDummy.matrix);

        // Set color with opacity baked in (fade out over time)
        const colorIdx = pData.colorIndices[i];
        const opacity = 1 - progress;
        _instanceColor.copy(particleColorPalette[colorIdx]).multiplyScalar(opacity);
        instancedParticleMesh.setColorAt(activeParticleCount, _instanceColor);

        activeParticleCount++;
    }

    // Update debris
    const dData = instancedDebrisData;
    for (let i = 0; i < INSTANCED_DEBRIS_MAX; i++) {
        if (dData.active[i] === 0) continue;

        const age = now - dData.createdAt[i];
        const progress = age / dData.durations[i];

        if (progress >= 1) {
            dData.active[i] = 0;
            continue;
        }

        const i3 = i * 3;

        // Update position
        dData.positions[i3] += dData.velocities[i3] * delta;
        dData.positions[i3 + 1] += dData.velocities[i3 + 1] * delta;
        dData.positions[i3 + 2] += dData.velocities[i3 + 2] * delta;

        // Update rotation
        dData.rotations[i3] += dData.rotationSpeeds[i3] * delta;
        dData.rotations[i3 + 1] += dData.rotationSpeeds[i3 + 1] * delta;
        dData.rotations[i3 + 2] += dData.rotationSpeeds[i3 + 2] * delta;

        // Build transformation matrix
        _instanceDummy.position.set(
            dData.positions[i3],
            dData.positions[i3 + 1],
            dData.positions[i3 + 2]
        );
        _instanceDummy.rotation.set(
            dData.rotations[i3],
            dData.rotations[i3 + 1],
            dData.rotations[i3 + 2]
        );
        _instanceDummy.scale.setScalar(dData.scales[i]);
        _instanceDummy.updateMatrix();

        instancedDebrisMesh.setMatrixAt(activeDebrisCount, _instanceDummy.matrix);
        activeDebrisCount++;
    }

    // Update explosion lights
    for (let i = 0; i < instancedExplosionLights.length; i++) {
        const light = instancedExplosionLights[i];
        if (!light.userData.inUse) continue;

        const age = now - light.userData.createdAt;
        const progress = age / light.userData.duration;

        if (progress >= 1) {
            light.userData.inUse = false;
            light.visible = false;
            light.intensity = 0;
        } else {
            light.intensity = 3 * (1 - progress);
        }
    }

    // Update instance counts and mark matrices for GPU upload
    instancedParticleMesh.count = activeParticleCount;
    if (activeParticleCount > 0) {
        instancedParticleMesh.instanceMatrix.needsUpdate = true;
        if (instancedParticleMesh.instanceColor) {
            instancedParticleMesh.instanceColor.needsUpdate = true;
        }
    }

    instancedDebrisMesh.count = activeDebrisCount;
    if (activeDebrisCount > 0) {
        instancedDebrisMesh.instanceMatrix.needsUpdate = true;
    }

    // Update debris material opacity based on average progress
    // (simpler than per-instance opacity for debris)
    if (activeDebrisCount > 0) {
        let avgProgress = 0;
        let count = 0;
        for (let i = 0; i < INSTANCED_DEBRIS_MAX; i++) {
            if (dData.active[i]) {
                avgProgress += (now - dData.createdAt[i]) / dData.durations[i];
                count++;
            }
        }
        if (count > 0) {
            instancedDebrisMesh.material.opacity = 1 - (avgProgress / count);
        }
    }
}

/**
 * Clear all active particles (e.g., on game reset).
 */
function clearInstancedParticles() {
    // Reset particle data
    instancedParticleData.active.fill(0);
    instancedParticleData.count = 0;
    if (instancedParticleMesh) {
        instancedParticleMesh.count = 0;
    }

    // Reset debris data
    instancedDebrisData.active.fill(0);
    instancedDebrisData.count = 0;
    if (instancedDebrisMesh) {
        instancedDebrisMesh.count = 0;
    }

    // Reset lights
    for (const light of instancedExplosionLights) {
        light.userData.inUse = false;
        light.visible = false;
        light.intensity = 0;
    }
}

// Initialize the instanced particle system immediately
initInstancedParticleSystem();

// === END INSTANCED MESH PARTICLE SYSTEM ===

// Create asteroid with rocky appearance
function createAsteroid() {
    const asteroidGroup = new THREE.Group();

    // Random size (affects health and damage)
    const size = ASTEROID_MIN_SIZE + Math.random() * (ASTEROID_MAX_SIZE - ASTEROID_MIN_SIZE);

    // Health based on size: bigger = more hits required
    // Ensure all asteroids take multiple hits for better feedback (3-6 hits)
    const health = Math.floor(3 + size * 1.5); // 3-6 hits based on size

    // Create rocky asteroid geometry using icosahedron with noise
    const baseGeo = new THREE.IcosahedronGeometry(size, 1);
    const positions = baseGeo.attributes.position;

    // Displace vertices for rocky appearance
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        const noise = 0.7 + Math.random() * 0.6; // 0.7-1.3 multiplier
        positions.setXYZ(i, x * noise, y * noise, z * noise);
    }
    baseGeo.computeVertexNormals();

    // Rocky asteroid material
    const asteroidMat = new THREE.MeshStandardMaterial({
        color: 0x6b5b4d,
        metalness: 0.2,
        roughness: 0.9,
        flatShading: true
    });
    const asteroidMesh = new THREE.Mesh(baseGeo, asteroidMat);

    // Random rotation for variety
    asteroidMesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
    );
    asteroidGroup.add(asteroidMesh);

    // Add some crater marks (darker spots)
    for (let i = 0; i < 3; i++) {
        const craterGeo = new THREE.CircleGeometry(size * 0.15, 8);
        const craterMat = new THREE.MeshBasicMaterial({
            color: 0x3d3429,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        const crater = new THREE.Mesh(craterGeo, craterMat);

        // Position on surface
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        crater.position.set(
            size * Math.sin(phi) * Math.cos(theta),
            size * Math.sin(phi) * Math.sin(theta),
            size * Math.cos(phi)
        );
        crater.lookAt(0, 0, 0);
        asteroidGroup.add(crater);
    }

    // Spawn position: random point on sphere around Earth at spawn distance
    const spawnDistance = ASTEROID_SPAWN_MIN_DISTANCE + Math.random() * (ASTEROID_SPAWN_MAX_DISTANCE - ASTEROID_SPAWN_MIN_DISTANCE);
    const spawnTheta = Math.random() * Math.PI * 2;
    const spawnPhi = Math.acos(2 * Math.random() - 1);

    asteroidGroup.position.set(
        spawnDistance * Math.sin(spawnPhi) * Math.cos(spawnTheta),
        spawnDistance * Math.sin(spawnPhi) * Math.sin(spawnTheta),
        spawnDistance * Math.cos(spawnPhi)
    );

    // Velocity: moves directly toward Earth (origin at 0,0,0)
    const speed = getAsteroidSpeed();
    // Calculate direction FROM asteroid TO Earth (explicit subtraction)
    const direction = new THREE.Vector3(0, 0, 0).sub(asteroidGroup.position).normalize();

    // Store asteroid data
    asteroidGroup.userData = {
        health: health,
        maxHealth: health,
        size: size,
        velocity: direction.multiplyScalar(speed),
        rotationSpeed: new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        ),
        createdAt: Date.now()
    };

    scene.add(asteroidGroup);
    asteroids.push(asteroidGroup);
    // Debug: log asteroid spawn
    try { console.debug('[DEBUG] Asteroid spawned', { position: asteroidGroup.position.toArray(), size, health }); } catch(e) {}
    return asteroidGroup;
}

// Spawn asteroids - DEPRECATED: Now handled by startLevel()
// Asteroids are spawned once per level, not continuously
function spawnAsteroids() {
    // No longer auto-spawns - levels have fixed asteroid counts
    return;
}

// Create explosion effect (size-based) - USES OBJECT POOLING
function createExplosion(position, asteroidSize = 1) {
    // Play explosion sound
    SoundManager.playExplosion(asteroidSize);

    const explosionGroup = new THREE.Group();
    explosionGroup.position.copy(position);

    // Scale explosion based on asteroid size
    const scaleFactor = Math.max(0.5, asteroidSize);
    const particleCount = Math.floor(6 + asteroidSize * 4);

    // Multiple expanding spheres for explosion - USE POOLED PARTICLES
    for (let i = 0; i < particleCount; i++) {
        const size = (0.2 + Math.random() * 0.4) * scaleFactor;

        // Acquire particle from pool instead of creating new
        const sphere = getParticleFromPool();

        // Set material from pre-created explosion materials
        sphere.material = explosionMaterials[Math.floor(Math.random() * explosionMaterials.length)];
        sphere.material.opacity = 1;

        // Set scale (pooled geometry has radius 1, so scale = desired size)
        sphere.scale.set(size, size, size);

        // Random offset
        sphere.position.set(
            (Math.random() - 0.5) * scaleFactor,
            (Math.random() - 0.5) * scaleFactor,
            (Math.random() - 0.5) * scaleFactor
        );

        // Reuse or create velocity vector
        if (!sphere.userData.velocity) {
            sphere.userData.velocity = new THREE.Vector3();
        }
        sphere.userData.velocity.set(
            (Math.random() - 0.5) * 8 * scaleFactor,
            (Math.random() - 0.5) * 8 * scaleFactor,
            (Math.random() - 0.5) * 8 * scaleFactor
        );
        sphere.userData.initialScale = size;
        explosionGroup.add(sphere);
    }

    // Get pooled light for flash
    const flash = getExplosionLightFromPool();
    flash.color.setHex(0xff8800);
    flash.intensity = 3 * scaleFactor;
    flash.distance = 20 * scaleFactor;
    explosionGroup.add(flash);
    explosionGroup.userData.flash = flash;

    explosionGroup.userData.createdAt = Date.now();
    explosionGroup.userData.duration = 600 + asteroidSize * 200; // Bigger = longer explosion

    scene.add(explosionGroup);
    explosions.push(explosionGroup);
    return explosionGroup;
}

// Create dramatic hit spark when laser damages asteroid - USES OBJECT POOLING
function createHitSpark(position, asteroid) {
    const sparkGroup = new THREE.Group();
    sparkGroup.position.copy(position);

    // Lots of bright sparks flying outward - USE POOLED PARTICLES
    for (let i = 0; i < 20; i++) {
        const size = 0.1 + Math.random() * 0.25;

        // Acquire particle from pool instead of creating new
        const spark = getParticleFromPool();

        // Set material from pre-created spark materials
        spark.material = sparkMaterials[Math.floor(Math.random() * sparkMaterials.length)];
        spark.material.opacity = 1;

        // Set scale
        spark.scale.set(size, size, size);

        // Reuse or create velocity vector
        if (!spark.userData.velocity) {
            spark.userData.velocity = new THREE.Vector3();
        }
        spark.userData.velocity.set(
            (Math.random() - 0.5) * 25,
            (Math.random() - 0.5) * 25,
            (Math.random() - 0.5) * 25
        );
        spark.userData.initialScale = size;
        sparkGroup.add(spark);
    }

    // Add debris chunks - USE POOLED DEBRIS
    for (let i = 0; i < 5; i++) {
        const chunkSize = 0.15 + Math.random() * 0.2;

        // Acquire debris from pool instead of creating new
        const chunk = getDebrisFromPool();

        // Reset debris material opacity
        chunk.material.opacity = 1;

        // Set scale
        chunk.scale.set(chunkSize, chunkSize, chunkSize);

        // Reuse or create velocity vector
        if (!chunk.userData.velocity) {
            chunk.userData.velocity = new THREE.Vector3();
        }
        chunk.userData.velocity.set(
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 15
        );
        chunk.userData.initialScale = chunkSize;

        // Reuse or create rotation speed vector
        if (!chunk.userData.rotationSpeed) {
            chunk.userData.rotationSpeed = new THREE.Vector3();
        }
        chunk.userData.rotationSpeed.set(
            Math.random() * 5,
            Math.random() * 5,
            Math.random() * 5
        );
        sparkGroup.add(chunk);
    }

    // Get pooled light for flash
    const flash = getExplosionLightFromPool();
    flash.color.setHex(0xffaa00);
    flash.intensity = 5;
    flash.distance = 15;
    sparkGroup.add(flash);
    sparkGroup.userData.flash = flash;

    sparkGroup.userData.createdAt = Date.now();
    sparkGroup.userData.duration = 400;

    scene.add(sparkGroup);
    explosions.push(sparkGroup);

    // Visual damage to asteroid - make it glow/flash red briefly
    if (asteroid && asteroid.children[0]) {
        const mesh = asteroid.children[0];
        const originalColor = mesh.material.color.getHex();
        mesh.material.emissive = new THREE.Color(0xff4400);
        mesh.material.emissiveIntensity = 0.8;

        // Shake the asteroid
        const originalPos = asteroid.position.clone();
        const shakeAmount = 0.3;
        asteroid.position.x += (Math.random() - 0.5) * shakeAmount;
        asteroid.position.y += (Math.random() - 0.5) * shakeAmount;
        asteroid.position.z += (Math.random() - 0.5) * shakeAmount;

        // Reset after brief moment
        setTimeout(() => {
            if (mesh.material) {
                mesh.material.emissiveIntensity = 0;
            }
        }, 150);
    }

    // Screen flash effect
    flashScreen();

    return sparkGroup;
}

// Brief screen flash for impact feedback
function flashScreen() {
    let flashOverlay = document.getElementById('hitFlash');
    if (!flashOverlay) {
        flashOverlay = document.createElement('div');
        flashOverlay.id = 'hitFlash';
        flashOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 200, 100, 0.15);
            pointer-events: none;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.05s;
        `;
        document.body.appendChild(flashOverlay);
    }

    flashOverlay.style.opacity = '1';
    setTimeout(() => {
        flashOverlay.style.opacity = '0';
    }, 50);
}

// Spawn an angel asteroid (glowing, heals Earth when destroyed)
function spawnAngelAsteroid() {
    const angelGroup = new THREE.Group();

    // Angel asteroids are medium-sized, glowing white/gold
    const size = 1.2;

    // Create crystalline geometry
    const crystalGeo = new THREE.OctahedronGeometry(size, 0);

    // Glowing ethereal material
    const angelMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.3,
        roughness: 0.2,
        emissive: 0x88ffaa,
        emissiveIntensity: 0.8
    });
    const crystal = new THREE.Mesh(crystalGeo, angelMat);
    angelGroup.add(crystal);

    // Add golden inner glow
    const innerGlow = new THREE.Mesh(
        new THREE.OctahedronGeometry(size * 0.7, 0),
        new THREE.MeshBasicMaterial({
            color: 0xffdd88,
            transparent: true,
            opacity: 0.6
        })
    );
    angelGroup.add(innerGlow);

    // Outer halo
    const haloGeo = new THREE.RingGeometry(size * 1.2, size * 1.8, 32);
    const haloMat = new THREE.MeshBasicMaterial({
        color: 0x88ffaa,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 2;
    angelGroup.add(halo);

    // Point light for glow effect
    const angelLight = new THREE.PointLight(0x88ffaa, 2, 20);
    angelGroup.add(angelLight);

    // Spawn position: random point in the sky
    const spawnDistance = ASTEROID_SPAWN_MIN_DISTANCE + Math.random() * 30;
    const spawnTheta = Math.random() * Math.PI * 2;
    const spawnPhi = Math.acos(2 * Math.random() - 1);

    angelGroup.position.set(
        spawnDistance * Math.sin(spawnPhi) * Math.cos(spawnTheta),
        spawnDistance * Math.sin(spawnPhi) * Math.sin(spawnTheta),
        spawnDistance * Math.cos(spawnPhi)
    );

    // Slower movement than regular asteroids
    const speed = getAsteroidSpeed() * 0.5;
    const direction = angelGroup.position.clone().negate().normalize();

    angelGroup.userData = {
        health: 1, // One hit to collect
        maxHealth: 1,
        size: size,
        velocity: direction.multiplyScalar(speed),
        rotationSpeed: new THREE.Vector3(0.5, 1, 0.3),
        isAngel: true,
        createdAt: Date.now()
    };

    scene.add(angelGroup);
    asteroids.push(angelGroup);

    // Show notification
    showNotification('+HEALTH INCOMING!', '#88ffaa');
}

// Special explosion for angel asteroid - USES OBJECT POOLING
function createAngelExplosion(position) {
    // Play explosion sound (medium size)
    SoundManager.playExplosion(1.5);

    const explosionGroup = new THREE.Group();
    explosionGroup.position.copy(position);

    // Bright healing particles - USE POOLED PARTICLES
    for (let i = 0; i < 30; i++) {
        const size = 0.2 + Math.random() * 0.4;

        // Acquire particle from pool instead of creating new
        const sphere = getParticleFromPool();

        // Set material from pre-created angel materials
        sphere.material = angelMaterials[Math.floor(Math.random() * angelMaterials.length)];
        sphere.material.opacity = 1;

        // Set scale
        sphere.scale.set(size, size, size);

        // Reuse or create velocity vector
        if (!sphere.userData.velocity) {
            sphere.userData.velocity = new THREE.Vector3();
        }
        sphere.userData.velocity.set(
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 12
        );
        sphere.userData.initialScale = size;
        explosionGroup.add(sphere);
    }

    // Get pooled light for flash
    const flash = getExplosionLightFromPool();
    flash.color.setHex(0x88ffaa);
    flash.intensity = 8;
    flash.distance = 30;
    explosionGroup.add(flash);
    explosionGroup.userData.flash = flash;

    explosionGroup.userData.createdAt = Date.now();
    explosionGroup.userData.duration = 1000;

    scene.add(explosionGroup);
    explosions.push(explosionGroup);

    // Green screen flash for healing
    flashScreenGreen();

    // Show heal notification
    showNotification('+25 HEALTH!', '#88ffaa');
}

// Green flash for healing
function flashScreenGreen() {
    let flashOverlay = document.getElementById('healFlash');
    if (!flashOverlay) {
        flashOverlay = document.createElement('div');
        flashOverlay.id = 'healFlash';
        flashOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(100, 255, 150, 0.25);
            pointer-events: none;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.1s;
        `;
        document.body.appendChild(flashOverlay);
    }

    flashOverlay.style.opacity = '1';
    setTimeout(() => {
        flashOverlay.style.opacity = '0';
    }, 200);
}

// Show floating notification
function showNotification(text, color) {
    const notification = document.createElement('div');
    notification.textContent = text;
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'Courier New', monospace;
        font-size: 28px;
        font-weight: bold;
        color: ${color};
        text-shadow: 0 0 20px ${color}, 0 0 40px ${color};
        z-index: 10000;
        pointer-events: none;
        animation: notifyPop 1.5s ease-out forwards;
    `;
    document.body.appendChild(notification);

    // Add animation style if not exists
    if (!document.getElementById('notifyStyle')) {
        const style = document.createElement('style');
        style.id = 'notifyStyle';
        style.textContent = `
            @keyframes notifyPop {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                20% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                40% { transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -100%) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => notification.remove(), 1500);
}

// Update kill count display
function updateKillCountDisplay() {
    const killEl = document.getElementById('killCount');
    if (killEl) {
        killEl.textContent = asteroidsDestroyed;
    }

    // Update angel indicator
    const angelEl = document.getElementById('angelIndicator');
    if (angelEl) {
        const killsUntilAngel = ANGEL_SPAWN_INTERVAL - (asteroidsDestroyed % ANGEL_SPAWN_INTERVAL);
        if (killsUntilAngel === ANGEL_SPAWN_INTERVAL) {
            angelEl.textContent = 'Next heal in 3 kills';
        } else {
            angelEl.textContent = `Next heal in ${killsUntilAngel} kill${killsUntilAngel > 1 ? 's' : ''}`;
        }
    }
}

// Update ammo display
function updateAmmoDisplay() {
    const ammoEl = document.getElementById('ammoCount');
    if (ammoEl) {
        ammoEl.textContent = laserAmmo;
        ammoEl.style.color = laserAmmo < 100 ? '#ff4444' : laserAmmo < 300 ? '#ffaa00' : '#44ff88';
    }
}

// Update Earth health display
function updateHealthDisplay() {
    const healthBar = document.getElementById('healthBar');
    const healthText = document.getElementById('healthText');
    if (healthBar) {
        const pct = (earthHealth / maxEarthHealth) * 100;
        healthBar.style.width = pct + '%';
        healthBar.style.background = pct > 50 ? '#44ff88' : pct > 25 ? '#ffaa00' : '#ff4444';
    }
    if (healthText) {
        healthText.textContent = Math.max(0, earthHealth);
    }
}

function updateMoonHealthDisplay() {
    const moonHealthBar = document.getElementById('moonHealthBar');
    const moonHealthText = document.getElementById('moonHealthText');
    if (moonHealthBar) {
        const pct = (moonHealth / maxMoonHealth) * 100;
        moonHealthBar.style.width = pct + '%';
        moonHealthBar.style.background = pct > 50 ? '#88aaff' : pct > 25 ? '#ffaa00' : '#ff4444';
    }
    if (moonHealthText) {
        moonHealthText.textContent = Math.max(0, moonHealth);
    }
}

// Update score display
function updateScoreDisplay() {
    const scoreEl = document.getElementById('scoreValue');
    if (scoreEl) {
        scoreEl.textContent = score;
    }
    // Update high score if needed
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('earthDefenderHighScore', highScore);
        updateHighScoreDisplay();
    }
}

// Update high score display
function updateHighScoreDisplay() {
    const highScoreEl = document.getElementById('highScoreValue');
    if (highScoreEl) {
        highScoreEl.textContent = highScore;
    }
}

// Update multiplier display
function updateMultiplierDisplay(multiplier) {
    const multiplierEl = document.getElementById('multiplierValue');
    if (multiplierEl) {
        multiplierEl.textContent = multiplier.toFixed(1) + 'x';
        // Color based on multiplier intensity
        if (multiplier >= 5.0) {
            multiplierEl.style.color = '#ff44ff';
            multiplierEl.style.textShadow = '0 0 12px #ff44ff';
        } else if (multiplier >= 3.0) {
            multiplierEl.style.color = '#ff8844';
            multiplierEl.style.textShadow = '0 0 10px #ff8844';
        } else if (multiplier >= 1.5) {
            multiplierEl.style.color = '#ffff44';
            multiplierEl.style.textShadow = '0 0 8px #ffff44';
        } else {
            multiplierEl.style.color = '#88ff88';
            multiplierEl.style.textShadow = '0 0 6px #88ff88';
        }
    }
}

// Show floating score popup for high multiplier kills
function showScorePopup(points, multiplier, worldPosition) {
    // Project 3D position to screen
    const screenPos = worldPosition.project(camera);
    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.innerHTML = `+${points} <span style="font-size: 0.7em; opacity: 0.8;">(${multiplier.toFixed(1)}x)</span>`;
    popup.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        transform: translate(-50%, -50%);
        font-family: 'Orbitron', sans-serif;
        font-size: 18px;
        font-weight: bold;
        color: ${multiplier >= 5.0 ? '#ff44ff' : multiplier >= 3.0 ? '#ff8844' : '#ffff44'};
        text-shadow: 0 0 10px currentColor, 0 0 20px currentColor;
        pointer-events: none;
        z-index: 1000;
        animation: scorePopupAnim 1.5s ease-out forwards;
    `;

    document.body.appendChild(popup);

    // Remove after animation
    setTimeout(() => popup.remove(), 1500);
}

// Add score popup animation styles (only once)
if (!document.getElementById('score-popup-styles')) {
    const style = document.createElement('style');
    style.id = 'score-popup-styles';
    style.textContent = `
        @keyframes scorePopupAnim {
            0% {
                opacity: 1;
                transform: translate(-50%, -50%) scale(0.5);
            }
            20% {
                transform: translate(-50%, -50%) scale(1.2);
            }
            100% {
                opacity: 0;
                transform: translate(-50%, -150%) scale(1);
            }
        }
    `;
    document.head.appendChild(style);
}

// Update level display
function updateLevelDisplay() {
    const levelEl = document.getElementById('levelValue');
    if (levelEl) {
        levelEl.textContent = gameLevel;
    }
}

// Show game over screen
function showGameOver() {
    clearSavedGame(); // Clear save on game over
    // Check leaderboard qualification before showing game over
    setTimeout(() => checkLeaderboardQualification(), 500);

    const overlay = document.createElement('div');
    overlay.id = 'gameOverOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: 'Courier New', monospace;
    `;
    overlay.innerHTML = `
        <div style="color: #ff4444; font-size: 48px; font-weight: bold; text-shadow: 0 0 20px #ff0000;">GAME OVER</div>
        <div style="color: #ffffff; font-size: 24px; margin-top: 20px;">Earth has been destroyed</div>
        <div style="color: #44ff88; font-size: 20px; margin-top: 10px;">Final Score: ${score}</div>
        <div style="color: #aaaaaa; font-size: 14px; margin-top: 5px;">Time: ${formatTime(gameElapsedTime)}</div>
        <button id="restartBtn" style="
            margin-top: 30px;
            padding: 15px 40px;
            font-size: 18px;
            background: #44ff88;
            color: #000;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-family: 'Courier New', monospace;
            font-weight: bold;
        ">RESTART</button>
    `;
    document.body.appendChild(overlay);

    document.getElementById('restartBtn').addEventListener('click', () => {
        restartGame();
        overlay.remove();
    });
}

// Show victory screen (won the game!)
function showVictoryScreen() {
    gameActive = false;
    SoundManager.playVictory();

    // Check leaderboard qualification
    setTimeout(() => checkLeaderboardQualification(), 500);

    const overlay = document.createElement('div');
    overlay.id = 'victoryOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 20, 40, 0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: 'Courier New', monospace;
    `;
    overlay.innerHTML = `
        <div style="color: #44ff88; font-size: 64px; font-weight: bold; text-shadow: 0 0 30px #00ff00; margin-bottom: 20px;">VICTORY!</div>
        <div style="color: #ffffff; font-size: 32px; margin-top: 10px;">You've saved Earth!</div>
        <div style="color: #ffff44; font-size: 24px; margin-top: 30px;">All 10 levels completed</div>
        <div style="color: #44ff88; font-size: 28px; margin-top: 15px;">Final Score: ${score}</div>
        <div style="color: #aaaaaa; font-size: 18px; margin-top: 10px;">Time: ${formatTime(gameElapsedTime)} | Kills: ${asteroidsDestroyed}</div>
        <button id="playAgainBtn" style="
            margin-top: 40px;
            padding: 20px 50px;
            font-size: 22px;
            background: linear-gradient(135deg, #44ff88, #00cc66);
            color: #000;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-family: 'Courier New', monospace;
            font-weight: bold;
            box-shadow: 0 0 20px rgba(68, 255, 136, 0.5);
        ">PLAY AGAIN</button>
    `;
    document.body.appendChild(overlay);

    document.getElementById('playAgainBtn').addEventListener('click', () => {
        restartGame();
        overlay.remove();
    });
}

// Restart game
function restartGame() {
    clearSavedGame(); // Clear any saved game state
    gamePaused = false; // Reset pause state
    // Reset state
    earthHealth = maxEarthHealth;
    moonHealth = maxMoonHealth;
    score = 0;
    gameLevel = 1;
    asteroidsDestroyed = 0;
    gameActive = true;

    // Reset timer and leaderboard
    gameStartTime = Date.now();
    gameElapsedTime = 0;
    leaderboardChecked = false;

    // Reset touch hints for new game
    touchHintsShownThisSession = false;
    updateTouchHintsOverlay();

    // Clear all asteroids
    asteroids.forEach(a => scene.remove(a));
    asteroids.length = 0;
    // Clear occlusion state to prevent memory leak
    window._asteroidOcclusionState?.clear();

    // Start level 1
    startLevel(1);

    // Update displays
    updateHealthDisplay();
    updateMoonHealthDisplay();
    updateScoreDisplay();
    updateAmmoDisplay();
    updateKillCountDisplay();
    updateLevelDisplay();
}

// Show level-up notification
function showLevelUpNotification(level) {
    const prevLevel = level - 1;
    const notification = document.createElement('div');
    notification.id = 'levelUpNotification';
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.5);
        background: rgba(0, 20, 40, 0.95);
        border: 3px solid #44ff88;
        border-radius: 20px;
        padding: 40px 60px;
        z-index: 9999;
        font-family: 'Courier New', monospace;
        text-align: center;
        box-shadow: 0 0 50px rgba(68, 255, 136, 0.5), inset 0 0 30px rgba(68, 255, 136, 0.1);
        opacity: 0;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;
    notification.innerHTML = `
        <div style="font-size: 14px; color: #88ff88; letter-spacing: 2px; margin-bottom: 5px;">LEVEL ${prevLevel} COMPLETE</div>
        <div style="font-size: 24px; color: #44aaff; letter-spacing: 3px; margin-bottom: 10px;">STARTING LEVEL</div>
        <div style="font-size: 72px; font-weight: bold; color: #44ff88; text-shadow: 0 0 30px #44ff88, 0 0 60px #44ff88;">
            ${level}
        </div>
        <div style="font-size: 16px; color: #ffffff; margin-top: 10px; opacity: 0.9;">
            Destroy ${level} asteroid${level > 1 ? 's' : ''}!
        </div>
        <div style="font-size: 12px; color: #44aaff; margin-top: 15px; opacity: 0.7;">
            +${AMMO_PER_ASTEROID * level} ammo
        </div>
    `;
    document.body.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    // Animate out and remove
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, -50%) scale(1.2)';
        setTimeout(() => notification.remove(), 400);
    }, 2000);
}

// Start a new level
function startLevel(level, isRetry = false) {
    gameLevel = level;

    // Save score before level (only if not a retry)
    if (!isRetry) {
        scoreBeforeLevel = score;
    }
    levelFailedShown = false;

    // Level number = number of asteroids to destroy
    levelAsteroidsTotal = level;
    levelAsteroidsRemaining = level;

    // Reload ammo for new level (40 per asteroid)
    laserAmmo = AMMO_PER_ASTEROID * level;

    // Clear any existing asteroids
    asteroids.forEach(a => scene.remove(a));
    asteroids.length = 0;
    // Clear occlusion state to prevent memory leak
    window._asteroidOcclusionState?.clear();

    // Release all active pooled objects (lasers, explosions) back to pools
    releaseAllPooledObjects();

    // Spawn all asteroids for this level at once
    for (let i = 0; i < level; i++) {
        createAsteroid();
    }

    updateLevelDisplay();
    updateAmmoDisplay();

    // Show level-up notification (skip for level 1 on game start)
    if (level > 1) {
        showLevelUpNotification(level);
    }

    console.log(`Level ${level} started - Destroy ${level} asteroids!`);
}

// Check if level is complete
function checkLevelComplete() {
    if (levelAsteroidsRemaining <= 0 && gameActive) {
        if (gameLevel >= 10) {
            // Won the game!
            clearSavedGame(); // Clear save on victory
            showVictoryScreen();
        } else {
            // Advance to next level
            saveGameState(); // Save progress on level completion
            setTimeout(() => {
                startLevel(gameLevel + 1);
            }, 1500); // Brief pause before next level
        }
    }
}

// Check if level failed (no asteroids left but level not complete)
function checkLevelFailed() {
    if (asteroids.length === 0 && levelAsteroidsRemaining > 0 && gameActive && !levelFailedShown) {
        levelFailedShown = true;
        gameActive = false;
        showLevelFailedDialog();
    }
}

// Show level failed dialog with retry/continue options
function showLevelFailedDialog() {
    const destroyed = levelAsteroidsTotal - levelAsteroidsRemaining;
    const overlay = document.createElement('div');
    overlay.id = 'levelFailedOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: 'Courier New', monospace;
    `;
    overlay.innerHTML = `
        <div style="text-align: center; max-width: 500px; padding: 40px;">
            <div style="color: #ffaa00; font-size: 42px; font-weight: bold; text-shadow: 0 0 20px #ff8800; margin-bottom: 20px;">
                LEVEL ${gameLevel} INCOMPLETE
            </div>
            <div style="color: #ffffff; font-size: 18px; margin-bottom: 10px;">
                Destroyed ${destroyed} of ${levelAsteroidsTotal} asteroids
            </div>
            <div style="color: #888888; font-size: 14px; margin-bottom: 30px;">
                ${levelAsteroidsRemaining} asteroid${levelAsteroidsRemaining > 1 ? 's' : ''} hit Earth
            </div>

            <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">
                <button id="retryLevelBtn" style="
                    padding: 15px 35px;
                    font-size: 18px;
                    background: linear-gradient(135deg, #44aaff, #0066cc);
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                    box-shadow: 0 0 15px rgba(68, 170, 255, 0.5);
                ">
                    RETRY LEVEL
                    <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">Score: ${scoreBeforeLevel}</div>
                </button>

                <button id="continueLevelBtn" style="
                    padding: 15px 35px;
                    font-size: 18px;
                    background: linear-gradient(135deg, #44ff88, #00cc66);
                    color: #000;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                    box-shadow: 0 0 15px rgba(68, 255, 136, 0.5);
                ">
                    CONTINUE
                    <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">Score: ${score}</div>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('retryLevelBtn').addEventListener('click', () => {
        overlay.remove();
        score = scoreBeforeLevel;
        updateScoreDisplay();
        gameActive = true;
        startLevel(gameLevel, true);
    });

    document.getElementById('continueLevelBtn').addEventListener('click', () => {
        overlay.remove();
        gameActive = true;
        if (gameLevel >= 10) {
            showVictoryScreen();
        } else {
            startLevel(gameLevel + 1);
        }
    });
}

// Targeting HUD: shows crosshairs over asteroids
// Pooling HUD reticles for performance. We avoid rebuilding DOM every frame.
if (!window._hudReticles) window._hudReticles = [];
function createHudReticle() {
    const reticle = document.createElement('div');
    reticle.className = 'hudReticle';
    reticle.style.cssText = 'position:absolute; pointer-events:none; background:transparent; border-radius:50%; overflow:visible;';

    const crosshair = document.createElement('div');
    crosshair.className = 'hudCrosshair';
    crosshair.style.cssText = 'position:absolute;width:100%;height:100%;';
    crosshair.innerHTML = `
        <div class="hud-ch-v" style="position:absolute;left:50%;top:0;width:2px;height:30%;transform:translateX(-50%);"></div>
        <div class="hud-ch-v2" style="position:absolute;left:50%;bottom:0;width:2px;height:30%;transform:translateX(-50%);"></div>
        <div class="hud-ch-h" style="position:absolute;top:50%;left:0;width:30%;height:2px;transform:translateY(-50%);"></div>
        <div class="hud-ch-h2" style="position:absolute;top:50%;right:0;width:30%;height:2px;transform:translateY(-50%);"></div>
    `;
    reticle.appendChild(crosshair);

    // Two separate labels above the reticle: ETA (time to impact) and distance
    const etaLabel = document.createElement('div');
    etaLabel.className = 'hudETA';
    etaLabel.style.cssText = 'position:absolute;top:-32px;left:50%;transform:translateX(-50%);font-family:Courier New, monospace;font-size:11px;color:#ffffff;background:rgba(0,0,0,0.75);padding:2px 6px;border-radius:4px;pointer-events:none;z-index:101;';
    etaLabel.textContent = '';
    reticle.appendChild(etaLabel);

    const distLabel = document.createElement('div');
    distLabel.className = 'hudDist';
    distLabel.style.cssText = 'position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-family:Courier New, monospace;font-size:11px;color:#ffffff;background:rgba(0,0,0,0.75);padding:2px 6px;border-radius:4px;pointer-events:none;z-index:101;';
    distLabel.textContent = '';
    reticle.appendChild(distLabel);

    const healthBarContainer = document.createElement('div');
    healthBarContainer.className = 'hudHealth';
    healthBarContainer.style.cssText = 'position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);height:8px;background:rgba(0,0,0,0.8);border-radius:3px;overflow:hidden;width:60px;';
    const healthFill = document.createElement('div');
    healthFill.className = 'hudHealthFill';
    healthFill.style.cssText = 'height:100%;width:100%;background:#00ff00;';
    healthBarContainer.appendChild(healthFill);
    reticle.appendChild(healthBarContainer);

    // Numeric health text (readable for tests and players)
    const healthText = document.createElement('div');
    healthText.className = 'hudHealthText';
    healthText.style.cssText = 'position:absolute;bottom:-38px;left:50%;transform:translateX(-50%);font-family:Courier New, monospace;font-size:11px;color:#ffffff;background:rgba(0,0,0,0.75);padding:2px 6px;border-radius:4px;pointer-events:none;z-index:101;';
    healthText.textContent = '';
    reticle.appendChild(healthText);

    return reticle;
}

// Update threat count indicator on dashboard
function updateThreatIndicator() {
    const threatCountEl = document.getElementById('dashboardThreatCount');
    if (!threatCountEl) return;

    const count = asteroids ? asteroids.length : 0;
    threatCountEl.textContent = count;

    // Add/remove pulse animation based on threat count
    if (count > 0) {
        threatCountEl.classList.add('threat-active');
        // Color intensity based on threat level
        if (count >= 5) {
            threatCountEl.style.color = '#ff2222';
            threatCountEl.style.textShadow = '0 0 12px #ff2222, 0 0 20px #ff0000';
        } else if (count >= 3) {
            threatCountEl.style.color = '#ff4444';
            threatCountEl.style.textShadow = '0 0 10px #ff4444';
        } else {
            threatCountEl.style.color = '#ff6644';
            threatCountEl.style.textShadow = '0 0 8px #ff6644';
        }
    } else {
        threatCountEl.classList.remove('threat-active');
        threatCountEl.style.color = '#44ff88';
        threatCountEl.style.textShadow = '0 0 8px #44ff88';
    }
}

function updateTargetingHUD() {
    let hudContainer = document.getElementById('targetingHUD');
    if (!hudContainer) {
        hudContainer = document.createElement('div');
        hudContainer.id = 'targetingHUD';
        hudContainer.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 100;`;
        document.body.appendChild(hudContainer);
    }

    // Ensure pool attached to window and appended to container
    const pool = window._hudReticles;
    for (let i = 0; i < pool.length; i++) {
        if (!pool[i].parentElement) hudContainer.appendChild(pool[i]);
    }

    // Add alignment line and update it
    const alignmentLine = document.getElementById('alignmentLine') || createAlignmentLine();
    const shipDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(spaceShip.quaternion);
    updateAlignmentLine(shipDirection);

    // Occlusion / raycast setup (reuse existing raycaster and occlusion state)
    if (!window._hudRaycaster) window._hudRaycaster = new THREE.Raycaster();
    const raycaster = window._hudRaycaster;
    raycaster.camera = camera;
    const occludingObjects = [earth, moon, spaceShip].filter(obj => obj && obj.matrixWorld);
    if (typeof window._hudFrameCount === 'undefined') window._hudFrameCount = 0;
    window._hudFrameCount++;
    const HUD_OCCLUSION_EVERY_N_FRAMES = 15; // Reduced frequency for performance
    if (!window._asteroidOcclusionState) window._asteroidOcclusionState = new Map();

    // Reuse existing reticles from pool; only grow pool when needed
    let used = 0;

    asteroids.forEach((asteroid) => {
        const screenPos = projectToScreen(asteroid.position);
        if (!(screenPos.z < 1 && screenPos.x > -50 && screenPos.x < window.innerWidth + 50 && screenPos.y > -50 && screenPos.y < window.innerHeight + 50)) return;

        const distance = camera.position.distanceTo(asteroid.position);
        const baseSize = 40 + asteroid.userData.size * 20;
        const size = Math.max(20, Math.min(100, baseSize * (50 / distance)));

        // occlusion
        let isOccluded = window._asteroidOcclusionState.get(asteroid.uuid) || false;
        // Test hook: when running tests, allow forcing HUD visibility and skip occlusion checks
        const forceShowHud = !!window.__TEST_forceShowHud;
        if (!forceShowHud && window._hudFrameCount % HUD_OCCLUSION_EVERY_N_FRAMES === 0) {
            try {
                const dir = asteroid.position.clone().sub(camera.position).normalize();
                raycaster.set(camera.position, dir);
                raycaster.near = 0.01;
                raycaster.far = Math.max(0.1, distance - 0.01);
                const intersections = raycaster.intersectObjects(occludingObjects, true);
                isOccluded = intersections.length > 0;
                window._asteroidOcclusionState.set(asteroid.uuid, isOccluded);
            } catch (e) {
                isOccluded = false;
                window._asteroidOcclusionState.set(asteroid.uuid, false);
            }
        }
        if (isOccluded && !forceShowHud) return;

        // alignment
        const toAsteroid = asteroid.position.clone().sub(spaceShip.position).normalize();
        const alignment = shipDirection.dot(toAsteroid);
        const isAligned = alignment > 0.98;

        // Get or create reticle
        let reticle;
        if (used < pool.length) {
            reticle = pool[used];
        } else {
            reticle = createHudReticle();
            pool.push(reticle);
            hudContainer.appendChild(reticle);
        }

        // Update position and styles
        reticle.style.left = (screenPos.x - size / 2) + 'px';
        reticle.style.top = (screenPos.y - size / 2) + 'px';
        reticle.style.width = size + 'px';
        reticle.style.height = size + 'px';
        // Ensure visible; in test mode we force visibility and full opacity
        reticle.style.display = 'block';
        if (forceShowHud) {
            reticle.style.visibility = 'visible';
            reticle.style.opacity = '1';
            reticle.style.pointerEvents = 'none';
        }
        reticle.style.borderRadius = '50%';
        // Ensure transparent background and circular ring
        reticle.style.background = 'transparent';
        reticle.style.border = `2px solid ${isAligned ? '#ff4444' : '#44aaff'}`;
        reticle.style.boxShadow = `0 0 10px ${isAligned ? '#ff4444' : '#44aaff'}`;

        // Position labels above the reticle so they don't cover the crosshair.
        const etaEl = reticle.querySelector('.hudETA');
        const distEl = reticle.querySelector('.hudDist');
        // Distance-to-impact (distance from asteroid to Earth's surface)
        const impactDistance = Math.max(0, asteroid.position.length() - EARTH_RADIUS);
        // Estimate time to impact in seconds using asteroid velocity magnitude
        const speed = (asteroid.userData && asteroid.userData.velocity) ? asteroid.userData.velocity.length() : 0;
        const eta = speed > 0 ? (impactDistance / speed) : NaN;
        if (distEl) {
            distEl.textContent = `${Math.round(impactDistance)}m`;
        }
        if (etaEl) {
            etaEl.textContent = isFinite(eta) ? `${eta.toFixed(1)}s` : '';
        }
        // Dynamically offset labels above the reticle based on its size
        try {
            const labelBase = Math.round(size / 2 + 6);
            if (distEl) distEl.style.top = `-${labelBase}px`;
            if (etaEl) etaEl.style.top = `-${labelBase + 18}px`;
        } catch (e) {}

        const healthPct = (asteroid.userData.health / asteroid.userData.maxHealth) * 100;
        const healthFill = reticle.querySelector('.hudHealthFill');
        const healthContainer = reticle.querySelector('.hudHealth');
        if (healthContainer) healthContainer.style.width = (size * 0.9) + 'px';
        if (healthFill) {
            healthFill.style.width = healthPct + '%';
            healthFill.style.background = healthPct > 50 ? '#00ff00' : healthPct > 25 ? '#ffaa00' : '#ff0000';
        }
        const healthTextEl = reticle.querySelector('.hudHealthText');
        if (healthTextEl) {
            const cur = typeof asteroid.userData.health !== 'undefined' ? asteroid.userData.health : '';
            const max = typeof asteroid.userData.maxHealth !== 'undefined' ? asteroid.userData.maxHealth : '';
            healthTextEl.textContent = (cur !== '' && max !== '') ? `${cur}/${max}` : `${Math.round(healthPct)}%`;
            // Position numeric health below the reticle, outside the circle
            try {
                const bottomOffset = Math.round(size / 2 + 12);
                healthTextEl.style.bottom = `-${bottomOffset}px`;
            } catch (e) {}
        }

        // Color crosshair parts
        const chEls = reticle.querySelectorAll('.hud-ch-v, .hud-ch-v2, .hud-ch-h, .hud-ch-h2');
        chEls.forEach(el => el.style.background = isAligned ? '#ff4444' : '#44aaff');

        used++;
    });

    // Hide unused pooled reticles
    for (let i = used; i < pool.length; i++) {
        pool[i].style.display = 'none';
    }
}

// Project 3D position to screen coordinates
function projectToScreen(position) {
    const vector = position.clone();
    vector.project(camera);

    return {
        x: (vector.x * 0.5 + 0.5) * window.innerWidth,
        y: (-vector.y * 0.5 + 0.5) * window.innerHeight,
        z: vector.z
    };
}

// Determine if a world position is occluded from the camera by Earth, Moon or the ship
function isOccluded(targetPos) {
    // Ray from camera to target
    const origin = camera.position.clone();
    const direction = targetPos.clone().sub(origin);
    const distance = direction.length();
    direction.normalize();

    const raycaster = new THREE.Raycaster(origin, direction, 0.01, distance - 0.01);

    // Objects that can occlude the target
    const occluders = [earth, moon, spaceShip];

    // Intersect (recursive for ship children)
    const intersects = raycaster.intersectObjects(occluders, true);
    return intersects.length > 0;
}

// Create alignment line element
function createAlignmentLine() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'alignmentLine';
    svg.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 99;
    `;
    svg.innerHTML = `
        <defs>
            <pattern id="dottedPattern" patternUnits="userSpaceOnUse" width="10" height="10">
                <circle cx="2" cy="2" r="1.5" fill="#44ff88" />
            </pattern>
        </defs>
        <line id="aimLine" x1="0" y1="0" x2="0" y2="0" stroke="url(#dottedPattern)" stroke-width="3" stroke-dasharray="5,5" />
    `;
    document.body.appendChild(svg);
    return svg;
}

// Update alignment line position
function updateAlignmentLine(shipDirection) {
    const aimLine = document.getElementById('aimLine');
    if (!aimLine) return;

    // Start from ship position on screen
    const shipScreen = projectToScreen(spaceShip.position);

    // End at a point far in the direction ship is facing
    const farPoint = spaceShip.position.clone().add(shipDirection.clone().multiplyScalar(200));
    const farScreen = projectToScreen(farPoint);

    // Check if aiming at Earth or Moon (friendly fire warning)
    const aimingAtEarth = checkAimingAtEarth(shipDirection);
    const aimingAtMoon = checkAimingAtMoon(shipDirection);
    updateFriendlyFireWarning(aimingAtEarth, aimingAtMoon);

    // Only show if ship is on screen - use fallback for far point if behind camera
    if (shipScreen.z < 1 && shipScreen.z > -1) {
        let endX = farScreen.x;
        let endY = farScreen.y;

        // If far point is behind camera (z >= 1), compute screen-space fallback
        if (farScreen.z >= 1 || farScreen.z < 0) {
            const nearPoint = spaceShip.position.clone().add(shipDirection.clone().multiplyScalar(5));
            const nearScreen = projectToScreen(nearPoint);
            if (nearScreen.z < 1 && nearScreen.z > 0) {
                const dx = nearScreen.x - shipScreen.x;
                const dy = nearScreen.y - shipScreen.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0.001) {
                    const scale = 2000 / len;
                    endX = shipScreen.x + dx * scale;
                    endY = shipScreen.y + dy * scale;
                }
            }
        }

        aimLine.setAttribute('x1', shipScreen.x);
        aimLine.setAttribute('y1', shipScreen.y);
        aimLine.setAttribute('x2', endX);
        aimLine.setAttribute('y2', endY);
        aimLine.style.opacity = '0.6';
        // Change line color if aiming at Earth
        if (aimingAtEarth) {
            aimLine.setAttribute('stroke', '#ff4444');
        } else {
            aimLine.setAttribute('stroke', 'url(#dottedPattern)');
        }
    } else {
        aimLine.style.opacity = '0';
    }
}

// Check if ship is aiming at Earth
function checkAimingAtEarth(shipDirection) {
    // Vector from ship to Earth center (Earth is at origin)
    const toEarth = new THREE.Vector3().sub(spaceShip.position).normalize();
    const distanceToEarth = spaceShip.position.length();

    // Check alignment with Earth
    const alignment = shipDirection.dot(toEarth);

    // Calculate if the aim line would hit Earth's sphere
    // Using ray-sphere intersection concept
    if (alignment > 0) {
        // Ship is facing toward Earth direction
        const closestApproach = spaceShip.position.clone().add(
            shipDirection.clone().multiplyScalar(alignment * distanceToEarth)
        );
        const missDistance = closestApproach.length();

        // If closest approach is within Earth radius, we're aiming at Earth
        return missDistance < EARTH_RADIUS + 0.5;
    }
    return false;
}

// Check if ship is aiming at Moon
function checkAimingAtMoon(shipDirection) {
    // Vector from ship to Moon center
    const toMoon = moon.position.clone().sub(spaceShip.position).normalize();
    const distanceToMoon = spaceShip.position.distanceTo(moon.position);

    // Check alignment with Moon
    const alignment = shipDirection.dot(toMoon);

    // Calculate if the aim line would hit Moon's sphere
    // Using ray-sphere intersection concept
    if (alignment > 0) {
        // Ship is facing toward Moon direction
        const shipToMoon = moon.position.clone().sub(spaceShip.position);
        const projectionLength = shipToMoon.dot(shipDirection);
        const closestPoint = spaceShip.position.clone().add(
            shipDirection.clone().multiplyScalar(projectionLength)
        );
        const missDistance = closestPoint.distanceTo(moon.position);

        // If closest approach is within Moon radius, we're aiming at Moon
        return missDistance < MOON_RADIUS + 0.3;
    }
    return false;
}

// Update friendly fire warning UI
function updateFriendlyFireWarning(isAimingAtEarth, isAimingAtMoon) {
    let warning = document.getElementById('friendlyFireWarning');
    let earthHighlight = document.getElementById('earthHighlight');
    let moonHighlight = document.getElementById('moonHighlight');

    if (isAimingAtEarth || isAimingAtMoon) {
        // Create warning if it doesn't exist
        if (!warning) {
            warning = document.createElement('div');
            warning.id = 'friendlyFireWarning';
            warning.style.cssText = `
                position: fixed;
                top: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(255, 0, 0, 0.8);
                color: #ffffff;
                padding: 8px 20px;
                border-radius: 5px;
                font-family: 'Courier New', monospace;
                font-size: 14px;
                font-weight: bold;
                z-index: 9000;
                text-shadow: 0 0 10px #ff0000;
                box-shadow: 0 0 20px rgba(255, 0, 0, 0.5);
                animation: warningPulse 0.5s ease-in-out infinite alternate;
            `;
            document.body.appendChild(warning);

            // Add pulse animation style if not exists
            if (!document.getElementById('warningPulseStyle')) {
                const style = document.createElement('style');
                style.id = 'warningPulseStyle';
                style.textContent = `
                    @keyframes warningPulse {
                        from { opacity: 0.7; transform: translateX(-50%) scale(1); }
                        to { opacity: 1; transform: translateX(-50%) scale(1.05); }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        // Update warning message based on what we're aiming at
        if (isAimingAtEarth && isAimingAtMoon) {
            warning.innerHTML = '⚠ FRIENDLY FIRE WARNING - AIMING AT EARTH & MOON ⚠';
        } else if (isAimingAtEarth) {
            warning.innerHTML = '⚠ FRIENDLY FIRE WARNING - AIMING AT EARTH ⚠';
        } else {
            warning.innerHTML = '⚠ FRIENDLY FIRE WARNING - AIMING AT MOON ⚠';
        }
        warning.style.display = 'block';

        // Handle Earth highlight
        if (isAimingAtEarth) {
            // Create Earth highlight ring if it doesn't exist
            if (!earthHighlight) {
                earthHighlight = document.createElement('div');
                earthHighlight.id = 'earthHighlight';
                earthHighlight.style.cssText = `
                    position: fixed;
                    pointer-events: none;
                    border: 3px solid #ff4444;
                    border-radius: 50%;
                    box-shadow: 0 0 30px #ff0000, inset 0 0 30px rgba(255, 0, 0, 0.3);
                    z-index: 8999;
                    animation: earthWarningPulse 0.3s ease-in-out infinite alternate;
                `;
                document.body.appendChild(earthHighlight);

                // Add Earth pulse animation
                if (!document.getElementById('earthWarningPulseStyle')) {
                    const style = document.createElement('style');
                    style.id = 'earthWarningPulseStyle';
                    style.textContent = `
                        @keyframes earthWarningPulse {
                            from { box-shadow: 0 0 30px #ff0000, inset 0 0 30px rgba(255, 0, 0, 0.3); }
                            to { box-shadow: 0 0 50px #ff0000, inset 0 0 50px rgba(255, 0, 0, 0.5); }
                        }
                    `;
                    document.head.appendChild(style);
                }
            }

            // Position highlight over Earth
            const earthScreen = projectToScreen(earth.position);
            const distanceToEarth = camera.position.distanceTo(earth.position);
            const apparentSize = (EARTH_RADIUS * 2 * window.innerHeight) / (distanceToEarth * 2);

            earthHighlight.style.width = apparentSize + 'px';
            earthHighlight.style.height = apparentSize + 'px';
            earthHighlight.style.left = (earthScreen.x - apparentSize / 2) + 'px';
            earthHighlight.style.top = (earthScreen.y - apparentSize / 2) + 'px';
            earthHighlight.style.display = 'block';
        } else {
            if (earthHighlight) earthHighlight.style.display = 'none';
        }

        // Handle Moon highlight
        if (isAimingAtMoon) {
            // Create Moon highlight ring if it doesn't exist
            if (!moonHighlight) {
                moonHighlight = document.createElement('div');
                moonHighlight.id = 'moonHighlight';
                moonHighlight.style.cssText = `
                    position: fixed;
                    pointer-events: none;
                    border: 3px solid #ff4444;
                    border-radius: 50%;
                    box-shadow: 0 0 30px #ff0000, inset 0 0 30px rgba(255, 0, 0, 0.3);
                    z-index: 8999;
                    animation: moonWarningPulse 0.3s ease-in-out infinite alternate;
                `;
                document.body.appendChild(moonHighlight);

                // Add Moon pulse animation
                if (!document.getElementById('moonWarningPulseStyle')) {
                    const style = document.createElement('style');
                    style.id = 'moonWarningPulseStyle';
                    style.textContent = `
                        @keyframes moonWarningPulse {
                            from { box-shadow: 0 0 30px #ff0000, inset 0 0 30px rgba(255, 0, 0, 0.3); }
                            to { box-shadow: 0 0 50px #ff0000, inset 0 0 50px rgba(255, 0, 0, 0.5); }
                        }
                    `;
                    document.head.appendChild(style);
                }
            }

            // Position highlight over Moon
            const moonScreen = projectToScreen(moon.position);
            const distanceToMoon = camera.position.distanceTo(moon.position);
            const apparentSize = (MOON_RADIUS * 2 * window.innerHeight) / (distanceToMoon * 2);

            moonHighlight.style.width = apparentSize + 'px';
            moonHighlight.style.height = apparentSize + 'px';
            moonHighlight.style.left = (moonScreen.x - apparentSize / 2) + 'px';
            moonHighlight.style.top = (moonScreen.y - apparentSize / 2) + 'px';
            moonHighlight.style.display = 'block';
        } else {
            if (moonHighlight) moonHighlight.style.display = 'none';
        }

    } else {
        if (warning) warning.style.display = 'none';
        if (earthHighlight) earthHighlight.style.display = 'none';
        if (moonHighlight) moonHighlight.style.display = 'none';
    }
}

function fireLasers() {
    // Check ammo and game state FIRST - fast exit
    if (laserAmmo <= 0 || !gameActive) return;

    // Get ship's forward direction IMMEDIATELY (negative Z in local space)
    const shipDirection = new THREE.Vector3(0, 0, -1);
    shipDirection.applyQuaternion(spaceShip.quaternion);

    // Calculate aim direction (start with ship direction, will be modified by aim assist)
    let aimDirection = shipDirection;

    // DEFERRED: Aim assist runs async to not block laser creation
    let bestTarget = null;
    const asteroidCount = asteroids.length;
    if (asteroidCount > 0 && asteroidCount <= 20) {
        // Only do aim assist for reasonable asteroid counts
        let bestAlignment = 0.95;
        for (let i = 0; i < asteroidCount; i++) {
            const asteroid = asteroids[i];
            const toAsteroid = asteroid.position.clone().sub(spaceShip.position).normalize();
            const alignment = shipDirection.dot(toAsteroid);
            if (alignment > bestAlignment) {
                bestAlignment = alignment;
                bestTarget = asteroid;
            }
        }

        // If we have a good target, lead the shot
        if (bestTarget) {
            const distance = bestTarget.position.distanceTo(spaceShip.position);
            const timeToHit = distance / LASER_SPEED;

            // Predict where the asteroid will be
            const predictedPos = bestTarget.position.clone().add(
                bestTarget.userData.velocity.clone().multiplyScalar(timeToHit)
            );

            // Aim at the predicted position
            aimDirection = predictedPos.sub(spaceShip.position).normalize();

            // Blend with original direction for subtle assist (80% assist, 20% player aim)
            aimDirection.lerp(shipDirection, 0.2).normalize();
        }
    }

    // CREATE LASERS IMMEDIATELY - no delay (2 cannons: left and right) - USE POOLED BOLTS
    for (let i = 0; i < 2; i++) {
        const offset = i === 0 ? { x: -0.9, y: -0.15 } : { x: 0.9, y: -0.15 };

        // Acquire laser bolt from pool instead of creating new
        const bolt = getLaserFromPool();

        // Position at cannon tip in world space (reuse temp vector pattern)
        _tempVec1.set(offset.x, offset.y, -3.5);
        _tempVec1.applyQuaternion(spaceShip.quaternion);
        bolt.position.copy(spaceShip.position).add(_tempVec1);

        // Store velocity and distance traveled (use aim-assisted direction)
        // Reuse existing velocity vector if present
        if (!bolt.userData.velocity) {
            bolt.userData.velocity = new THREE.Vector3();
        }
        bolt.userData.velocity.copy(aimDirection).multiplyScalar(LASER_SPEED);
        bolt.userData.distanceTraveled = 0;

        // Orient bolt in direction of travel
        _tempVec2.copy(bolt.position).add(aimDirection);
        bolt.lookAt(_tempVec2);

        scene.add(bolt);
        laserBolts.push(bolt);
    }

    // Decrement ammo AFTER laser creation
    laserAmmo--;

    // Play sound and update display AFTER laser is visible (non-blocking)
    SoundManager.playLaser();
    updateAmmoDisplay();
}

// Spacebar listener for firing
let canFire = true;
const FIRE_COOLDOWN = 150; // ms between shots

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        if (canFire) {
            fireLasers();
            canFire = false;
            setTimeout(() => { canFire = true; }, FIRE_COOLDOWN);
        }
    }
});

// === ORBIT PARAMETERS ===
let shipOrbitRadius = 7;
let orbitPerigee = 7;  // Closest point (can be adjusted)
let orbitApogee = 7;   // Farthest point (same as perigee = circular)
let orbitInclination = 0; // Degrees of orbital tilt

// Control mode: 'camera' or 'ship'
let controlMode = 'ship'; // Start in ship mode for gameplay
const orbitY = 1.5;

// Ship starts already partway through entry for immediate action
let shipPhase = 'orbit'; // Start directly in orbit for smooth experience
let orbitAngle = Math.PI * 1.5; // Starting angle

// Ship orientation (quaternion-based for gimbal-lock-free rotation)
let shipOrientationQuat = new THREE.Quaternion();  // Cumulative rotation offset from base orientation

// === RAYCAST SLEW CONFIGURATION ===
const SHIP_SLERP_SPEED = 8.0;        // How fast ship rotates toward target (higher = snappier)
const SHIP_ROLL_CORRECTION = 3.0;    // How fast roll aligns to camera up when not aiming
const AIM_DEADZONE = 0.02;           // NDC distance from center before rotation starts

// Raycast slew state
let shipTargetQuat = new THREE.Quaternion();       // Target orientation from raycast
let isAiming = false;                              // True when pointer is actively dragging in ship mode
const aimRaycaster = new THREE.Raycaster();        // For screen-to-world ray casting

// Ship control input state
const shipInput = {
    pitchUp: false,
    pitchDown: false,
    yawLeft: false,
    yawRight: false
};
const SHIP_ROTATION_SPEED = 1.5; // Radians per second

// Apply incremental rotation to ship orientation quaternion
function applyShipRotation(deltaYaw, deltaPitch) {
    // Get the ship's current local axes from the quaternion
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(shipOrientationQuat);
    const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(shipOrientationQuat);

    // Create rotation quaternions for yaw (around local up) and pitch (around local right)
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(localUp, -deltaYaw);
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(localRight, -deltaPitch);

    // Apply rotations: first yaw, then pitch
    shipOrientationQuat.premultiply(yawQuat);
    shipOrientationQuat.premultiply(pitchQuat);
    shipOrientationQuat.normalize();
}

/**
 * Compute target quaternion from screen position using raycast
 * @param {number} ndcX - Normalized device coord X (-1 to 1)
 * @param {number} ndcY - Normalized device coord Y (-1 to 1)
 * @returns {THREE.Quaternion} Target orientation for ship
 */
function computeAimQuaternion(ndcX, ndcY) {
    // Cast ray from camera through pointer position
    aimRaycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);

    // Get the ray direction in world space
    const aimDirection = aimRaycaster.ray.direction.clone().normalize();

    // Build orthonormal basis for target orientation
    // Forward = aim direction (ship nose points this way)
    const forward = aimDirection.clone();

    // Use camera's up as reference for roll alignment
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    // Right = forward × up (handle parallel case)
    let right = new THREE.Vector3().crossVectors(forward, cameraUp);
    if (right.lengthSq() < 0.001) {
        // Forward is nearly parallel to up, use camera right instead
        right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    }
    right.normalize();

    // Recalculate up to ensure orthonormal
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    // Build rotation matrix from basis vectors
    // Ship model faces -Z, so forward should be negated for proper orientation
    const rotMatrix = new THREE.Matrix4().makeBasis(right, up, forward.clone().negate());

    // Convert to quaternion
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

    // Apply 180° Y rotation to account for ship model orientation
    const yFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    targetQuat.multiply(yFlip);

    return targetQuat;
}

/**
 * Start aiming - called on pointerdown/touchstart in ship mode
 */
function startAiming() {
    aimActive = true;
    // Start delta from current position - no jump
    prevDragNDC.set(aimNDC.x, aimNDC.y);
}

/**
 * Update aim target from pointer position - called on pointermove/touchmove
 * @param {number} ndcX - Normalized device coord X
 * @param {number} ndcY - Normalized device coord Y
 */
// In updateAimTarget function - keep using existing shipTargetQuat
function updateAimTarget(ndcX, ndcY) {
    // Cast ray from camera through NDC point
    aimNDC.set(ndcX, ndcY);
    raycaster.setFromCamera(aimNDC, camera);
    
    // Intersect with a large far sphere to get direction even when nothing hit
    const farSphere = new THREE.Mesh(
        new THREE.SphereGeometry(1000, 8, 8),
        new THREE.MeshBasicMaterial() // invisible
    );
    farSphere.position.copy(camera.position);
    const intersects = raycaster.intersectObject(farSphere);
    
    if (intersects.length > 0) {
        const targetPoint = intersects[0].point;
        
        // Direction from ship to target point
        shipTargetDir.subVectors(targetPoint, spaceShip.position).normalize();
        
        // Compute target rotation: look at target, keep up aligned
        spaceShip.matrix.lookAt(spaceShip.position, targetPoint, shipUpLocal);
        spaceShip.quaternion.setFromRotationMatrix(spaceShip.matrix);
    }
}

/**
 * Stop aiming - called on pointerup/touchend
 */
function stopAiming() {
    isAiming = false;
}

/**
 * Per-frame ship orientation update with slerp
 * @param {number} delta - Time since last frame in seconds
 * @param {THREE.Quaternion} baseQuat - The base orientation from lookAt
 */
function updateShipOrientation(delta, baseQuat) {
    if (controlMode !== 'ship') return;

    if (isAiming) {
        // Convert target world quaternion to local offset quaternion
        // targetWorld = baseQuat * targetLocal
        // targetLocal = inverse(baseQuat) * targetWorld
        const baseInverse = baseQuat.clone().invert();
        const targetLocal = baseInverse.clone().multiply(shipTargetQuat);

        // Exponential interpolation for smooth, framerate-independent rotation
        const t = 1 - Math.exp(-SHIP_SLERP_SPEED * delta);

        // Slerp current orientation toward target
        shipOrientationQuat.slerp(targetLocal, t);
        shipOrientationQuat.normalize();
    } else {
        // When not aiming, gradually correct roll toward neutral
        // This prevents accumulated roll from making controls feel weird
        const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(shipOrientationQuat);
        const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(shipOrientationQuat);

        // Target up should align with world up projected perpendicular to forward
        const worldUp = new THREE.Vector3(0, 1, 0);
        const targetUp = worldUp.clone().sub(currentForward.clone().multiplyScalar(currentForward.dot(worldUp))).normalize();

        if (targetUp.lengthSq() > 0.001) {
            // Calculate roll angle between current up and target up
            const rollAngle = Math.atan2(
                currentUp.clone().cross(targetUp).dot(currentForward),
                currentUp.dot(targetUp)
            );

            if (Math.abs(rollAngle) > 0.01) {
                // Apply gradual roll correction
                const rollCorrection = rollAngle * Math.min(1, SHIP_ROLL_CORRECTION * delta);
                const rollQuat = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 0, 1),
                    rollCorrection
                );
                shipOrientationQuat.multiply(rollQuat);
                shipOrientationQuat.normalize();
            }
        }
    }
}

spaceShip.position.set(
    Math.cos(orbitAngle) * shipOrbitRadius,
    orbitY,
    Math.sin(orbitAngle) * shipOrbitRadius
);

// Camera control variables
const cameraTarget = new THREE.Vector3(0, 0, 0); // The point the camera looks at
const zoomSpeed = 0.01; // Increased 5x for more dramatic zoom
const rotationSpeed = 0.005;
const panSpeed = 0.003;
const keyRotationSpeed = 0.03; // For arrow keys

// Position camera
camera.position.set(4, 4, 12);
camera.lookAt(cameraTarget);

// Mouse input state
const mouseState = {
    isLeftDown: false,
    isRightDown: false,
    isMiddleDown: false,
    prevX: 0,
    prevY: 0,
};

// Touch input state
const touchState = {
    pointers: [],
    prevPosition: null,
    prevMidpoint: null,
    prevDistance: null,
};

// Keyboard state
const keys = {};

// === UI CONTROLS ===
// === UI COMPONENT CREATION FUNCTIONS ===

function createLaserButton() {
    const laserDiv = document.createElement('div');
    laserDiv.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        z-index: 1000;
    `;

    const laserBtn = document.createElement('button');
    laserBtn.id = 'laserBtn';
    laserBtn.textContent = 'LASER';
    laserBtn.style.cssText = `
        background: linear-gradient(180deg, #ff3300 0%, #aa0000 100%);
        border: 2px solid #ff4400;
        border-radius: 8px;
        color: white;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 2px;
        padding: 12px 24px;
        cursor: pointer;
        box-shadow: 0 0 15px rgba(255, 50, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.2);
        text-shadow: 0 0 10px #ff0000;
        transition: all 0.1s ease;
    `;

    // Hold-to-fire state for laser button
    let laserHoldInterval = null;
    let isLaserButtonHeld = false;
    const LASER_HOLD_FIRE_RATE = 150; // ms between shots when holding

    function startLaserHoldFire() {
        if (isLaserButtonHeld) return;
        isLaserButtonHeld = true;
        laserBtn.style.transform = 'scale(0.95)';
        laserBtn.style.boxShadow = '0 0 25px rgba(255, 50, 0, 0.8), inset 0 1px 0 rgba(255,255,255,0.2)';

        // Fire immediately on press
        if (canFire) {
            fireLasers();
            canFire = false;
            setTimeout(() => { canFire = true; }, FIRE_COOLDOWN);
        }

        // Start continuous firing while held
        laserHoldInterval = setInterval(() => {
            if (canFire && isLaserButtonHeld) {
                fireLasers();
                canFire = false;
                setTimeout(() => { canFire = true; }, FIRE_COOLDOWN);
            }
        }, LASER_HOLD_FIRE_RATE);
    }

    function stopLaserHoldFire() {
        isLaserButtonHeld = false;
        laserBtn.style.transform = 'scale(1)';
        laserBtn.style.boxShadow = '0 0 15px rgba(255, 50, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)';
        if (laserHoldInterval) {
            clearInterval(laserHoldInterval);
            laserHoldInterval = null;
        }
    }

    // Mouse events for hold-to-fire
    laserBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startLaserHoldFire();
    });
    laserBtn.addEventListener('mouseup', stopLaserHoldFire);
    laserBtn.addEventListener('mouseleave', stopLaserHoldFire);

    // Touch events for hold-to-fire
    laserBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startLaserHoldFire();
    });
    laserBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopLaserHoldFire();
    });
    laserBtn.addEventListener('touchcancel', stopLaserHoldFire);

    laserDiv.appendChild(laserBtn);
    document.body.appendChild(laserDiv);
}

function createModeToggleButton(updateModeToggle, shipControlPad) {
    const modeToggleBtn = document.createElement('button');
    modeToggleBtn.id = 'modeToggleBtn';
    modeToggleBtn.id = 'modeToggleBtn';
    modeToggleBtn.id = 'modeToggleBtn';
    modeToggleBtn.textContent = 'CAM'; // Start in ship mode, so button shows "CAM" (what you'll switch to)
    modeToggleBtn.style.cssText = `
        position: fixed;
        bottom: 10px;
        left: 10px;
        background: #44ff88;
        border: 2px solid #44ff88;
        border-radius: 8px;
        padding: 12px 20px;
        font-family: 'Courier New', monospace;
        color: #000;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        letter-spacing: 2px;
        box-shadow: 0 0 15px rgba(68, 255, 136, 0.3);
        z-index: 1000;
        transition: all 0.2s;
        min-width: 80px;
        text-align: center;
    `;

    modeToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        controlMode = controlMode === 'camera' ? 'ship' : 'camera';
        updateModeToggle();
    });

    modeToggleBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        modeToggleBtn.style.transform = 'scale(0.95)';
    });
    modeToggleBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        modeToggleBtn.style.transform = 'scale(1)';
    });

    document.body.appendChild(modeToggleBtn);
}

function createPauseButton() {
    const pauseBtn = document.createElement('button');
    pauseBtn.id = 'pauseBtn';
    pauseBtn.textContent = 'PAUSE';
    pauseBtn.style.cssText = `
        position: fixed;
        bottom: 10px;
        left: 10px;
        background: rgba(68, 170, 255, 0.2);
        border: 2px solid #44aaff;
        border-radius: 8px;
        padding: 12px 20px;
        font-family: 'Courier New', monospace;
        color: #44aaff;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        letter-spacing: 2px;
        box-shadow: 0 0 15px rgba(68, 170, 255, 0.2);
        z-index: 1000;
        transition: all 0.2s;
        min-width: 80px;
        text-align: center;
    `;

    pauseBtn.addEventListener('mouseenter', () => {
        pauseBtn.style.background = gamePaused ? 'rgba(68, 255, 136, 0.4)' : 'rgba(68, 170, 255, 0.4)';
        pauseBtn.style.boxShadow = gamePaused ? '0 0 20px rgba(68, 255, 136, 0.4)' : '0 0 20px rgba(68, 170, 255, 0.4)';
    });
    pauseBtn.addEventListener('mouseleave', () => {
        pauseBtn.style.background = gamePaused ? 'rgba(68, 255, 136, 0.2)' : 'rgba(68, 170, 255, 0.2)';
        pauseBtn.style.boxShadow = gamePaused ? '0 0 15px rgba(68, 255, 136, 0.2)' : '0 0 15px rgba(68, 170, 255, 0.2)';
    });
    pauseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePause();
    });
    pauseBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        pauseBtn.style.transform = 'scale(0.95)';
    });
    pauseBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        pauseBtn.style.transform = 'scale(1)';
    });

    document.body.appendChild(pauseBtn);
}

function createQuitButtonBottomLeft() {
    const quitBtn = document.createElement('button');
    quitBtn.textContent = 'QUIT';
    quitBtn.style.cssText = `
        position: fixed;
        bottom: 10px;
        left: 120px;
        background: rgba(255, 100, 100, 0.2);
        border: 2px solid #ff6666;
        border-radius: 8px;
        padding: 12px 20px;
        font-family: 'Courier New', monospace;
        color: #ff6666;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        letter-spacing: 2px;
        box-shadow: 0 0 15px rgba(255, 100, 100, 0.2);
        z-index: 1000;
        transition: all 0.2s;
        min-width: 80px;
        text-align: center;
    `;

    quitBtn.addEventListener('mouseenter', () => {
        quitBtn.style.background = 'rgba(255, 100, 100, 0.4)';
        quitBtn.style.boxShadow = '0 0 20px rgba(255, 100, 100, 0.4)';
    });
    quitBtn.addEventListener('mouseleave', () => {
        quitBtn.style.background = 'rgba(255, 100, 100, 0.2)';
        quitBtn.style.boxShadow = '0 0 15px rgba(255, 100, 100, 0.2)';
    });
    quitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showQuitDialog();
    });
    quitBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        quitBtn.style.transform = 'scale(0.95)';
    });
    quitBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        quitBtn.style.transform = 'scale(1)';
    });

    document.body.appendChild(quitBtn);
}

function createShipControlPad() {
    const shipControlPad = document.createElement('div');
    shipControlPad.id = 'shipControlPad';
    shipControlPad.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        z-index: 1000;
    `;

    const createDpadButton = (direction, symbol) => {
        const btn = document.createElement('button');
        btn.innerHTML = symbol;
        btn.style.cssText = `
            width: 50px;
            height: 50px;
            border: 2px solid #44ff88;
            border-radius: 8px;
            background: rgba(0, 30, 15, 0.8);
            color: #44ff88;
            font-size: 24px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            touch-action: none;
            user-select: none;
            transition: all 0.1s;
        `;

        const activate = () => {
            btn.style.background = '#44ff88';
            btn.style.color = '#000';
            shipInput[direction] = true;
        };

        const deactivate = () => {
            btn.style.background = 'rgba(0, 30, 15, 0.8)';
            btn.style.color = '#44ff88';
            shipInput[direction] = false;
        };

        btn.addEventListener('mousedown', activate);
        btn.addEventListener('mouseup', deactivate);
        btn.addEventListener('mouseleave', deactivate);
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            activate();
        });
        btn.addEventListener('touchend', deactivate);
        btn.addEventListener('touchcancel', deactivate);

        return btn;
    };

    const upBtn = createDpadButton('pitchUp', '&#9650;');
    const downBtn = createDpadButton('pitchDown', '&#9660;');
    const leftBtn = createDpadButton('yawLeft', '&#9664;');
    const rightBtn = createDpadButton('yawRight', '&#9654;');

    const topRow = document.createElement('div');
    topRow.appendChild(upBtn);

    const middleRow = document.createElement('div');
    middleRow.style.cssText = 'display: flex; gap: 50px;';
    middleRow.appendChild(leftBtn);
    middleRow.appendChild(rightBtn);

    const bottomRow = document.createElement('div');
    bottomRow.appendChild(downBtn);

    shipControlPad.appendChild(topRow);
    shipControlPad.appendChild(middleRow);
    shipControlPad.appendChild(bottomRow);

    document.body.appendChild(shipControlPad);

    // Add keyboard controls
    window.addEventListener('keydown', (e) => {
        if (controlMode !== 'ship') return;
        switch (e.code) {
            case 'ArrowUp':
            case 'KeyW':
                shipInput.pitchUp = true;
                e.preventDefault();
                break;
            case 'ArrowDown':
            case 'KeyS':
                shipInput.pitchDown = true;
                e.preventDefault();
                break;
            case 'ArrowLeft':
            case 'KeyA':
                shipInput.yawLeft = true;
                e.preventDefault();
                break;
            case 'ArrowRight':
            case 'KeyD':
                shipInput.yawRight = true;
                e.preventDefault();
                break;
        }
    });

    window.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'ArrowUp':
            case 'KeyW':
                shipInput.pitchUp = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                shipInput.pitchDown = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                shipInput.yawLeft = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                shipInput.yawRight = false;
                break;
        }
    });

    return shipControlPad;
}

function createHamburgerMenuAndSettings(updateModeToggle) {
    const hamburgerBtn = document.createElement('button');
    hamburgerBtn.id = 'hamburgerBtn';
    hamburgerBtn.innerHTML = '☰';
    hamburgerBtn.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(20, 20, 30, 0.95);
        border: 1px solid #888;
        border-radius: 8px;
        color: #fff;
        cursor: pointer;
        font-size: 24px;
        padding: 8px 12px;
        z-index: 1001;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
        transition: all 0.2s;
    `;
    hamburgerBtn.addEventListener('mouseenter', () => {
        hamburgerBtn.style.background = 'rgba(40, 40, 50, 0.95)';
    });
    hamburgerBtn.addEventListener('mouseleave', () => {
        hamburgerBtn.style.background = 'rgba(20, 20, 30, 0.95)';
    });

    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'settingsPanel';
    settingsPanel.style.cssText = `
        position: fixed;
        top: 60px;
        right: 10px;
        background: rgba(20, 20, 30, 0.98);
        border: 1px solid #888;
        border-radius: 8px;
        padding: 12px;
        z-index: 1000;
        display: none;
        flex-direction: column;
        gap: 10px;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.7);
        max-height: 70vh;
        overflow-y: auto;
    `;

    // Sound toggle
    const soundSetting = document.createElement('div');
    soundSetting.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 0;';
    soundSetting.innerHTML = `
        <div style="font-size: 16px; width: 24px; text-align: center;">🔊</div>
        <div style="color: #fff; font-family: monospace; font-size: 12px; flex: 1;">Sound</div>
    `;

    const soundToggleBtn = document.createElement('button');
    soundToggleBtn.style.cssText = `
        padding: 8px 16px;
        border: 2px solid #44ff88;
        border-radius: 6px;
        background: rgba(68, 255, 136, 0.2);
        color: #44ff88;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        font-weight: bold;
        transition: all 0.2s;
        min-width: 60px;
    `;

    function updateSoundToggle() {
        if (soundEnabled) {
            soundToggleBtn.textContent = 'ON';
            soundToggleBtn.style.background = '#44ff88';
            soundToggleBtn.style.color = '#000';
            soundToggleBtn.style.borderColor = '#44ff88';
        } else {
            soundToggleBtn.textContent = 'OFF';
            soundToggleBtn.style.background = 'rgba(136, 136, 136, 0.2)';
            soundToggleBtn.style.color = '#888';
            soundToggleBtn.style.borderColor = '#888';
        }
    }

    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        localStorage.setItem('soundEnabled', soundEnabled);
        updateSoundToggle();
    });

    soundSetting.appendChild(soundToggleBtn);
    settingsPanel.appendChild(soundSetting);
    updateSoundToggle();

    // D-pad toggle
    const dpadSetting = document.createElement('div');
    dpadSetting.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid #444;';
    dpadSetting.innerHTML = `
        <div style="font-size: 16px; width: 24px; text-align: center;">🎮</div>
        <div style="color: #fff; font-family: monospace; font-size: 12px; flex: 1;">D-Pad</div>
    `;

    const dpadToggleBtn = document.createElement('button');
    dpadToggleBtn.style.cssText = `
        padding: 8px 16px;
        border: 2px solid #44ff88;
        border-radius: 6px;
        background: rgba(68, 255, 136, 0.2);
        color: #44ff88;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        font-weight: bold;
        transition: all 0.2s;
        min-width: 60px;
    `;

    function updateDpadToggle() {
        if (showDpadControls) {
            dpadToggleBtn.textContent = 'ON';
            dpadToggleBtn.style.background = '#44ff88';
            dpadToggleBtn.style.color = '#000';
            dpadToggleBtn.style.borderColor = '#44ff88';
        } else {
            dpadToggleBtn.textContent = 'OFF';
            dpadToggleBtn.style.background = 'rgba(136, 136, 136, 0.2)';
            dpadToggleBtn.style.color = '#888';
            dpadToggleBtn.style.borderColor = '#888';
        }
    }

    dpadToggleBtn.addEventListener('click', () => {
        showDpadControls = !showDpadControls;
        updateDpadToggle();
        updateModeToggle();
    });

    dpadSetting.appendChild(dpadToggleBtn);
    settingsPanel.appendChild(dpadSetting);
    updateDpadToggle();

    // Touch hints toggle
    const hintsSetting = document.createElement('div');
    hintsSetting.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid #444;';
    hintsSetting.innerHTML = `
        <div style="font-size: 16px; width: 24px; text-align: center;">💡</div>
        <div style="color: #fff; font-family: monospace; font-size: 12px; flex: 1;">Hints</div>
    `;

    const hintsToggleBtn = document.createElement('button');
    hintsToggleBtn.style.cssText = `
        padding: 8px 16px;
        border: 2px solid #44ff88;
        border-radius: 6px;
        background: rgba(68, 255, 136, 0.2);
        color: #44ff88;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        font-weight: bold;
        transition: all 0.2s;
        min-width: 60px;
    `;

    function updateHintsToggle() {
        if (showTouchHints) {
            hintsToggleBtn.textContent = 'ON';
            hintsToggleBtn.style.background = '#44ff88';
            hintsToggleBtn.style.color = '#000';
            hintsToggleBtn.style.borderColor = '#44ff88';
        } else {
            hintsToggleBtn.textContent = 'OFF';
            hintsToggleBtn.style.background = 'rgba(136, 136, 136, 0.2)';
            hintsToggleBtn.style.color = '#888';
            hintsToggleBtn.style.borderColor = '#888';
        }
    }

    hintsToggleBtn.addEventListener('click', () => {
        showTouchHints = !showTouchHints;
        localStorage.setItem('showTouchHints', showTouchHints);
        updateHintsToggle();
        updateTouchHintsOverlay();
    });

    hintsSetting.appendChild(hintsToggleBtn);
    settingsPanel.appendChild(hintsSetting);
    updateHintsToggle();

    // Pause button in menu
    const pauseSetting = document.createElement('div');
    pauseSetting.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid #444;';
    pauseSetting.innerHTML = `
        <div style="font-size: 16px; width: 24px; text-align: center;">⏸️</div>
        <div style="color: #fff; font-family: monospace; font-size: 12px; flex: 1;">Pause</div>
    `;

    const pauseBtn = document.createElement('button');
    pauseBtn.id = 'pauseBtn';
    pauseBtn.textContent = 'PAUSE';
    pauseBtn.style.cssText = `
        padding: 8px 16px;
        border: 2px solid #44aaff;
        border-radius: 6px;
        background: rgba(68, 170, 255, 0.2);
        color: #44aaff;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        font-weight: bold;
        transition: all 0.2s;
        min-width: 60px;
    `;

    pauseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePause();
    });

    pauseSetting.appendChild(pauseBtn);
    settingsPanel.appendChild(pauseSetting);

    // Quit button in menu
    const quitSetting = document.createElement('div');
    quitSetting.style.cssText = 'display: flex; align-items: center; justify-content: center; padding-top: 8px; border-top: 1px solid #444;';

    const quitBtn = document.createElement('button');
    quitBtn.textContent = 'QUIT GAME';
    quitBtn.style.cssText = `
        padding: 12px 20px;
        border: 2px solid #ff6666;
        border-radius: 6px;
        background: rgba(255, 100, 100, 0.2);
        color: #ff6666;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        font-weight: bold;
        letter-spacing: 2px;
        transition: all 0.2s;
        width: 100%;
        box-shadow: 0 0 10px rgba(255, 100, 100, 0.2);
    `;

    quitBtn.addEventListener('mouseenter', () => {
        quitBtn.style.background = 'rgba(255, 100, 100, 0.4)';
        quitBtn.style.boxShadow = '0 0 15px rgba(255, 100, 100, 0.4)';
    });
    quitBtn.addEventListener('mouseleave', () => {
        quitBtn.style.background = 'rgba(255, 100, 100, 0.2)';
        quitBtn.style.boxShadow = '0 0 10px rgba(255, 100, 100, 0.2)';
    });
    quitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showQuitDialog();
    });
    quitBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        quitBtn.style.transform = 'scale(0.95)';
    });
    quitBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        quitBtn.style.transform = 'scale(1)';
    });

    quitSetting.appendChild(quitBtn);
    settingsPanel.appendChild(quitSetting);

    // Orbit controls
    addOrbitControlsToSettings(settingsPanel);

    // Toggle panel
    let settingsPanelOpen = false;
    hamburgerBtn.addEventListener('click', () => {
        settingsPanelOpen = !settingsPanelOpen;
        settingsPanel.style.display = settingsPanelOpen ? 'flex' : 'none';
    });

    document.addEventListener('click', (e) => {
        if (settingsPanelOpen && !settingsPanel.contains(e.target) && !hamburgerBtn.contains(e.target)) {
            settingsPanelOpen = false;
            settingsPanel.style.display = 'none';
        }
    });

    document.body.appendChild(settingsPanel);
    document.body.appendChild(hamburgerBtn);
}

function addOrbitControlsToSettings(settingsPanel) {
    // Planet rotation
    const planetSetting = document.createElement('div');
    planetSetting.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-top: 1px solid #444;';
    const planetHeader = document.createElement('div');
    planetHeader.style.cssText = 'color: #fff; font-family: monospace; font-size: 11px; opacity: 0.8;';
    planetHeader.textContent = '🌍 PLANET ROTATION';
    const planetSlider = document.createElement('input');
    planetSlider.type = 'range';
    planetSlider.min = '-100';
    planetSlider.max = '100';
    planetSlider.value = '25';
    planetSlider.style.cssText = 'width: 100%; cursor: pointer;';
    const planetValue = document.createElement('div');
    planetValue.style.cssText = 'font-size: 9px; color: #888; text-align: center;';
    planetValue.textContent = 'CW 0.12';
    planetSetting.appendChild(planetHeader);
    planetSetting.appendChild(planetSlider);
    planetSetting.appendChild(planetValue);
    settingsPanel.appendChild(planetSetting);

    planetSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        planetRotationSpeed = Math.abs(val) / 400;
        planetRotationDirection = val >= 0 ? 1 : -1;
        const dir = val === 0 ? 'STOP' : (val > 0 ? 'CW' : 'CCW');
        planetValue.textContent = `${dir} ${planetRotationSpeed.toFixed(2)}`;
    });

    // Moon orbit
    const moonSetting = document.createElement('div');
    moonSetting.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-top: 1px solid #444;';
    const moonHeader = document.createElement('div');
    moonHeader.style.cssText = 'color: #fff; font-family: monospace; font-size: 11px; opacity: 0.8;';
    moonHeader.textContent = '🌙 MOON ORBIT';
    const moonSlider = document.createElement('input');
    moonSlider.type = 'range';
    moonSlider.min = '-100';
    moonSlider.max = '100';
    moonSlider.value = '30';
    moonSlider.style.cssText = 'width: 100%; cursor: pointer;';
    const moonValue = document.createElement('div');
    moonValue.style.cssText = 'font-size: 9px; color: #888; text-align: center;';
    moonValue.textContent = 'CW 0.15';
    moonSetting.appendChild(moonHeader);
    moonSetting.appendChild(moonSlider);
    moonSetting.appendChild(moonValue);
    settingsPanel.appendChild(moonSetting);

    moonSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        moonOrbitSpeed = Math.abs(val) / 200;
        moonOrbitDirection = val >= 0 ? 1 : -1;
        const dir = val === 0 ? 'STOP' : (val > 0 ? 'CW' : 'CCW');
        moonValue.textContent = `${dir} ${moonOrbitSpeed.toFixed(2)}`;
    });

    // Ship orbit
    const shipOrbitSetting = document.createElement('div');
    shipOrbitSetting.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-top: 1px solid #444;';
    const shipHeader = document.createElement('div');
    shipHeader.style.cssText = 'color: #fff; font-family: monospace; font-size: 11px; opacity: 0.8;';
    shipHeader.textContent = '🚀 SHIP ORBIT';
    const shipOrbitSlider = document.createElement('input');
    shipOrbitSlider.type = 'range';
    shipOrbitSlider.min = '-100';
    shipOrbitSlider.max = '100';
    shipOrbitSlider.value = '50';
    shipOrbitSlider.style.cssText = 'width: 100%; cursor: pointer;';
    const shipOrbitValue = document.createElement('div');
    shipOrbitValue.style.cssText = 'font-size: 9px; color: #888; text-align: center;';
    shipOrbitValue.textContent = 'CW 0.25';
    shipOrbitSetting.appendChild(shipHeader);
    shipOrbitSetting.appendChild(shipOrbitSlider);
    shipOrbitSetting.appendChild(shipOrbitValue);
    settingsPanel.appendChild(shipOrbitSetting);

    shipOrbitSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        shipOrbitSpeed = Math.abs(val) / 200;
        shipOrbitDirection = val >= 0 ? 1 : -1;
        const dir = val === 0 ? 'STOP' : (val > 0 ? 'CW' : 'CCW');
        shipOrbitValue.textContent = `${dir} ${shipOrbitSpeed.toFixed(2)}`;
    });
}

function createTouchHintsOverlay() {
    const touchHintsOverlay = document.createElement('div');
    touchHintsOverlay.id = 'touchHintsOverlay';
    touchHintsOverlay.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        z-index: 999;
        pointer-events: none;
        font-family: 'Courier New', monospace;
    `;

    if (!document.getElementById('touchHintsStyle')) {
        const style = document.createElement('style');
        style.id = 'touchHintsStyle';
        style.textContent = `
            @keyframes touchHintPulse {
                0%, 100% { opacity: 0.9; transform: translateX(-50%) scale(1); }
                50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
            }
            @keyframes fingerDrag {
                0%, 100% { transform: translate(0, 0); }
                50% { transform: translate(30px, -20px); }
            }
            @keyframes arrowBounce {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    touchHintsOverlay.innerHTML = `
        <div style="
            background: rgba(0, 40, 80, 0.9);
            border: 2px solid #44aaff;
            border-radius: 12px;
            padding: 15px 25px;
            box-shadow: 0 0 20px rgba(68, 170, 255, 0.4);
            animation: touchHintPulse 2s ease-in-out infinite;
        ">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="font-size: 32px; animation: fingerDrag 1.5s ease-in-out infinite;">👆</div>
                <div style="display: flex; flex-direction: column; align-items: flex-start;">
                    <div style="color: #44aaff; font-size: 14px; font-weight: bold;">TOUCH & DRAG</div>
                    <div style="color: #ffffff; font-size: 12px;">to aim at asteroids</div>
                </div>
                <div style="font-size: 20px; color: #44ff88; animation: arrowBounce 1s ease-in-out infinite;">↗</div>
            </div>
        </div>
    `;

    document.body.appendChild(touchHintsOverlay);

    // Assign global functions
    updateTouchHintsOverlay = () => {
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (showTouchHints && isTouchDevice && !touchHintsShownThisSession && gameActive) {
            touchHintsOverlay.style.display = 'flex';
        } else {
            touchHintsOverlay.style.display = 'none';
        }
    };

    hideTouchHints = () => {
        if (!touchHintsShownThisSession) {
            touchHintsShownThisSession = true;
            touchHintsOverlay.style.display = 'none';
        }
    };
}

function createGameStatusPanel() {
    const gamePanel = document.createElement('div');
    gamePanel.id = 'gamePanel';
    gamePanel.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0, 20, 40, 0.95);
        border: 1px solid #44aaff;
        border-radius: 8px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-family: 'Courier New', monospace;
        color: #44aaff;
        box-shadow: 0 0 15px rgba(68, 170, 255, 0.3);
        min-width: 140px;
        z-index: 1000;
        cursor: pointer;
        transition: all 0.3s;
    `;

    const dashboardIcon = document.createElement('div');
    dashboardIcon.id = 'dashboardIcon';
    dashboardIcon.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
            <div id="miniOrientationIndicator" title="Click to reset orientation" style="
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(68, 170, 255, 0.5);
                overflow: hidden;
                cursor: pointer;
                transition: border-color 0.2s, box-shadow 0.2s;
            "></div>
            <div style="display: flex; flex-direction: column; align-items: center;">
                <div id="dashboardThreatCount" style="
                    font-size: 18px;
                    font-weight: bold;
                    color: #ff4444;
                    text-shadow: 0 0 8px #ff4444;
                    line-height: 1;
                ">0</div>
                <div style="
                    font-size: 6px;
                    letter-spacing: 1px;
                    opacity: 0.7;
                    color: #44aaff;
                    margin-top: 1px;
                ">THREATS</div>
            </div>
        </div>
    `;
    dashboardIcon.style.cssText = `
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        padding: 4px 6px;
        border-radius: 6px;
        transition: all 0.15s;
    `;

    const dashboardContent = document.createElement('div');
    dashboardContent.id = 'dashboardContent';
    dashboardContent.style.cssText = `
        display: none;
        flex-direction: column;
        gap: 6px;
    `;

    // Create all dashboard content
    createDashboardContent(dashboardContent);

    gamePanel.appendChild(dashboardIcon);
    gamePanel.appendChild(dashboardContent);

    // Add pulse animation CSS for threat indicator
    const threatPulseStyle = document.createElement('style');
    threatPulseStyle.textContent = `
        @keyframes threatPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.1); }
        }
        .threat-active {
            animation: threatPulse 0.8s ease-in-out infinite;
        }
    `;
    document.head.appendChild(threatPulseStyle);

    // Toggle functionality
    let dashboardExpanded = false;
    gamePanel.addEventListener('click', (e) => {
        if (e.target.closest('#infoBtn') || e.target.closest('input') || e.target.closest('button')) {
            return;
        }
        dashboardExpanded = !dashboardExpanded;
        if (dashboardExpanded) {
            dashboardIcon.style.display = 'none';
            dashboardContent.style.display = 'flex';
            gamePanel.style.minWidth = '140px';
        } else {
            dashboardIcon.style.display = 'flex';
            dashboardContent.style.display = 'none';
            gamePanel.style.minWidth = 'auto';
        }
    });

    document.body.appendChild(gamePanel);

    // Create orientation indicators (main and mini for collapsed state)
    const orientationContainer = document.getElementById('orientationIndicator');
    if (orientationContainer) {
        createOrientationIndicator(orientationContainer, 60, false);
    }

    // Create mini orientation indicator for collapsed dashboard
    const miniOrientationContainer = document.getElementById('miniOrientationIndicator');
    if (miniOrientationContainer) {
        createOrientationIndicator(miniOrientationContainer, 36, true);
        // Add click handler to reset orientation
        miniOrientationContainer.addEventListener('click', (e) => {
            e.stopPropagation(); // Don't toggle dashboard
            resetCameraOrientation();
        });
        miniOrientationContainer.addEventListener('mouseenter', () => {
            miniOrientationContainer.style.borderColor = 'rgba(68, 170, 255, 0.9)';
            miniOrientationContainer.style.boxShadow = '0 0 8px rgba(68, 170, 255, 0.5)';
        });
        miniOrientationContainer.addEventListener('mouseleave', () => {
            miniOrientationContainer.style.borderColor = 'rgba(68, 170, 255, 0.5)';
            miniOrientationContainer.style.boxShadow = 'none';
        });
    }
}

function createDashboardContent(dashboardContent) {
    // Header with info button
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; border-bottom: 1px solid rgba(68, 170, 255, 0.3); margin-bottom: 2px;';
    headerRow.innerHTML = '<div style="font-size: 10px; letter-spacing: 2px; font-weight: bold; color: #44ff88;">EARTH DEFENDER</div>';

    const infoBtn = document.createElement('button');
    infoBtn.textContent = '?';
    infoBtn.style.cssText = `
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 1px solid #44aaff;
        background: rgba(68, 170, 255, 0.2);
        color: #44aaff;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
    `;
    infoBtn.addEventListener('mouseenter', () => {
        infoBtn.style.background = 'rgba(68, 170, 255, 0.4)';
        infoBtn.style.boxShadow = '0 0 10px rgba(68, 170, 255, 0.5)';
    });
    infoBtn.addEventListener('mouseleave', () => {
        infoBtn.style.background = 'rgba(68, 170, 255, 0.2)';
        infoBtn.style.boxShadow = 'none';
    });
    infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showInstructions(true);
    });
    headerRow.appendChild(infoBtn);
    dashboardContent.appendChild(headerRow);

    // Level indicator
    const levelDiv = document.createElement('div');
    levelDiv.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px; padding: 4px 0;';
    levelDiv.innerHTML = `
        <div style="font-size: 10px; letter-spacing: 2px; opacity: 0.8;">LEVEL</div>
        <div id="levelValue" style="font-size: 22px; font-weight: bold; color: #44aaff; text-shadow: 0 0 10px #44aaff;">1</div>
    `;
    dashboardContent.appendChild(levelDiv);

    // Earth health bar
    const healthDiv = document.createElement('div');
    healthDiv.innerHTML = `
        <div style="font-size: 8px; letter-spacing: 1px; opacity: 0.6; margin-bottom: 3px;">EARTH HEALTH</div>
        <div style="width: 100%; height: 14px; background: rgba(0, 0, 0, 0.5); border-radius: 7px; overflow: hidden; border: 1px solid #44ff88;">
            <div id="healthBar" style="width: 100%; height: 100%; background: #44ff88; transition: width 0.3s, background 0.3s;"></div>
        </div>
        <div id="healthText" style="font-size: 11px; text-align: center; margin-top: 2px; color: #44ff88;">100</div>
    `;
    dashboardContent.appendChild(healthDiv);

    // Moon health bar
    const moonHealthDiv = document.createElement('div');
    moonHealthDiv.style.marginTop = '6px';
    moonHealthDiv.innerHTML = `
        <div style="font-size: 8px; letter-spacing: 1px; opacity: 0.6; margin-bottom: 3px;">MOON HEALTH</div>
        <div style="width: 100%; height: 14px; background: rgba(0, 0, 0, 0.5); border-radius: 7px; overflow: hidden; border: 1px solid #88aaff;">
            <div id="moonHealthBar" style="width: 100%; height: 100%; background: #88aaff; transition: width 0.3s, background 0.3s;"></div>
        </div>
        <div id="moonHealthText" style="font-size: 11px; text-align: center; margin-top: 2px; color: #88aaff;">100</div>
    `;
    dashboardContent.appendChild(moonHealthDiv);

    // Stats
    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr; gap: 3px; padding-top: 6px; border-top: 1px solid rgba(68, 170, 255, 0.3); font-size: 9px;';
    statsRow.innerHTML = `
        <div style="text-align: center;">
            <div style="opacity: 0.6; font-size: 6px; letter-spacing: 1px;">SCORE</div>
            <div id="scoreValue" style="font-size: 11px; font-weight: bold; color: #ffaa00; text-shadow: 0 0 8px #ffaa00;">0</div>
        </div>
        <div style="text-align: center;">
            <div style="opacity: 0.6; font-size: 6px; letter-spacing: 1px;">MULT</div>
            <div id="multiplierValue" style="font-size: 11px; font-weight: bold; color: #88ff88; text-shadow: 0 0 6px #88ff88;">1.0x</div>
        </div>
        <div style="text-align: center;">
            <div style="opacity: 0.6; font-size: 6px; letter-spacing: 1px;">BEST</div>
            <div id="highScoreValue" style="font-size: 11px; font-weight: bold; color: #ff44ff; text-shadow: 0 0 8px #ff44ff;">${highScore}</div>
        </div>
        <div style="text-align: center;">
            <div style="opacity: 0.6; font-size: 6px; letter-spacing: 1px;">THREATS</div>
            <div id="asteroidCount" style="font-size: 11px; font-weight: bold; color: #ff4444;">0</div>
        </div>
        <div style="text-align: center;">
            <div style="opacity: 0.6; font-size: 6px; letter-spacing: 1px;">KILLS</div>
            <div id="killCount" style="font-size: 11px; font-weight: bold; color: #88ff44; text-shadow: 0 0 8px #88ff44;">0</div>
        </div>
        <div style="text-align: center;">
            <div style="opacity: 0.6; font-size: 6px; letter-spacing: 1px;">AMMO</div>
            <div id="ammoCount" style="font-size: 11px; font-weight: bold; color: #44aaff; text-shadow: 0 0 8px #44aaff;">1000</div>
        </div>
    `;
    dashboardContent.appendChild(statsRow);

    // Leaderboard
    const leaderboardDiv = document.createElement('div');
    leaderboardDiv.style.cssText = 'padding-top: 6px; border-top: 1px solid rgba(68, 170, 255, 0.3);';
    leaderboardDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="font-size: 8px; letter-spacing: 1px; opacity: 0.6;">TOP SCORES</div>
            <div id="gameTimer" style="font-size: 9px; color: #44aaff;">0:00</div>
        </div>
        <div id="leaderboardList" style="font-size: 8px;"></div>
    `;
    dashboardContent.appendChild(leaderboardDiv);

    setTimeout(updateLeaderboardDisplay, 100);

    // Orientation indicator container
    const orientationDiv = document.createElement('div');
    orientationDiv.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        padding-top: 6px;
        border-top: 1px solid rgba(68, 170, 255, 0.3);
    `;
    orientationDiv.innerHTML = `
        <div id="orientationIndicator" title="Click to reset orientation" style="
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(68, 170, 255, 0.5);
            overflow: hidden;
            cursor: pointer;
            transition: border-color 0.2s, box-shadow 0.2s;
        "></div>
    `;
    dashboardContent.appendChild(orientationDiv);

    // Add click handler to reset orientation
    const orientationIndicator = document.getElementById('orientationIndicator');
    if (orientationIndicator) {
        orientationIndicator.addEventListener('click', resetCameraOrientation);
        orientationIndicator.addEventListener('mouseenter', () => {
            orientationIndicator.style.borderColor = 'rgba(68, 170, 255, 0.9)';
            orientationIndicator.style.boxShadow = '0 0 8px rgba(68, 170, 255, 0.5)';
        });
        orientationIndicator.addEventListener('mouseleave', () => {
            orientationIndicator.style.borderColor = 'rgba(68, 170, 255, 0.5)';
            orientationIndicator.style.boxShadow = 'none';
        });
    }
}

function createOrientationIndicator(container, size = 60, isMini = false) {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.set(0, 0, 3.5);
    cam.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.id = isMini ? 'miniOrientationCanvas' : 'orientationCanvas';
    container.appendChild(renderer.domElement);

    const humanGroup = new THREE.Group();
    const humanMaterial = new THREE.MeshBasicMaterial({ color: 0x44aaff });

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), humanMaterial);
    head.position.y = 0.75;
    humanGroup.add(head);

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8), humanMaterial);
    body.position.y = 0.35;
    humanGroup.add(body);

    // Arms
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), humanMaterial);
    leftArm.position.set(-0.25, 0.4, 0);
    leftArm.rotation.z = Math.PI / 4;
    humanGroup.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), humanMaterial);
    rightArm.position.set(0.25, 0.4, 0);
    rightArm.rotation.z = -Math.PI / 4;
    humanGroup.add(rightArm);

    // Legs
    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8), humanMaterial);
    leftLeg.position.set(-0.1, -0.15, 0);
    humanGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8), humanMaterial);
    rightLeg.position.set(0.1, -0.15, 0);
    humanGroup.add(rightLeg);

    // Nose (direction indicator)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 8), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    nose.position.set(0, 0.75, 0.25);
    nose.rotation.x = Math.PI / 2;
    humanGroup.add(nose);

    scene.add(humanGroup);

    const orientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(orientLight);

    // Store references for animation loop
    if (isMini) {
        window.miniOrientationScene = scene;
        window.miniOrientationCamera = cam;
        window.miniOrientationRenderer = renderer;
        window.miniOrientationHuman = humanGroup;
    } else {
        window.orientationScene = scene;
        window.orientationCamera = cam;
        window.orientationRenderer = renderer;
        window.orientationHuman = humanGroup;
    }
}

function createUIStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes threatPulse {
            0%, 100% {
                text-shadow: 0 0 8px #ff4444;
                transform: scale(1);
                background-color: transparent;
            }
            50% {
                text-shadow: 0 0 25px #ff4444, 0 0 35px #ff0000, 0 0 45px #ff0000;
                transform: scale(1.2);
                background-color: rgba(255, 68, 68, 0.2);
            }
        }

        #asteroidCount {
            text-shadow: 0 0 8px #ff4444;
            border-radius: 4px;
            padding: 2px 4px;
            transition: all 0.2s;
        }

        .threat-active {
            animation: threatPulse 0.6s ease-in-out infinite;
        }

        #controls input[type="range"] {
            -webkit-appearance: none;
            height: 6px;
            background: linear-gradient(to right, #ff4444 0%, #333 45%, #333 55%, #44ff44 100%);
            border-radius: 3px;
        }
        #controls input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            background: #4488ff;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 8px #4488ff;
        }
        #controls input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            background: #4488ff;
            border-radius: 50%;
            cursor: pointer;
            border: none;
        }
        #shipControls input[type="range"] {
            -webkit-appearance: none;
            height: 6px;
            background: linear-gradient(to right, #225533 0%, #44ff88 50%, #225533 100%);
            border-radius: 3px;
        }
        #shipControls input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 14px;
            height: 14px;
            background: #44ff88;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 6px #44ff88;
        }
        #shipControls input[type="range"]::-moz-range-thumb {
            width: 14px;
            height: 14px;
            background: #44ff88;
            border-radius: 50%;
            cursor: pointer;
            border: none;
        }
        #gamePanel input[type="range"] {
            -webkit-appearance: none;
            height: 6px;
            background: linear-gradient(to right, #224466 0%, #44aaff 50%, #224466 100%);
            border-radius: 3px;
        }
        #gamePanel input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 18px;
            height: 18px;
            background: #44aaff;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 8px #44aaff;
        }
        #gamePanel input[type="range"]::-moz-range-thumb {
            width: 18px;
            height: 18px;
            background: #44aaff;
            border-radius: 50%;
            cursor: pointer;
            border: none;
        }
    `;
    document.head.appendChild(style);
}

// Main UI orchestrator - now much simpler with extracted helper functions!
function createControlUI() {
    // Create basic UI components
    createLaserButton();
    const shipControlPad = createShipControlPad();

    // Mode toggle needs inline implementation for closure over shipControlPad
    const modeToggleBtn = document.createElement('button');
    modeToggleBtn.id = 'modeToggleBtn';
    modeToggleBtn.style.cssText = `
        position: fixed;
        bottom: 10px;
        left: 10px;
        background: rgba(20, 20, 30, 0.9);
        border: 2px solid #44aaff;
        border-radius: 12px;
        padding: 10px;
        cursor: pointer;
        box-shadow: 0 0 15px rgba(68, 170, 255, 0.3);
        z-index: 1000;
        transition: all 0.2s;
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    // SVG icons for camera orbit and ship rotation modes
    const cameraOrbitIcon = `
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#44aaff" stroke-width="2">
            <circle cx="14" cy="14" r="10" stroke-dasharray="4 2" opacity="0.5"/>
            <circle cx="14" cy="14" r="4" fill="#44aaff"/>
            <path d="M 24 14 A 10 10 0 0 1 14 24" stroke="#44aaff" stroke-width="2" fill="none"/>
            <path d="M 14 24 L 16 21 M 14 24 L 11 22" stroke="#44aaff" stroke-width="2"/>
        </svg>`;

    const shipRotateIcon = `
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#44ff88" stroke-width="2">
            <path d="M 14 4 L 22 22 L 14 18 L 6 22 Z" fill="rgba(68, 255, 136, 0.3)" stroke="#44ff88"/>
            <path d="M 4 10 A 12 12 0 0 1 10 4" stroke="#44ff88" stroke-width="1.5" fill="none"/>
            <path d="M 10 4 L 8 6 M 10 4 L 12 6" stroke="#44ff88" stroke-width="1.5"/>
            <path d="M 24 18 A 12 12 0 0 1 18 24" stroke="#44ff88" stroke-width="1.5" fill="none"/>
            <path d="M 18 24 L 20 22 M 18 24 L 16 22" stroke="#44ff88" stroke-width="1.5"/>
        </svg>`;

    function updateModeToggle() {
        if (controlMode === 'camera') {
            // In camera mode - show camera orbit icon
            modeToggleBtn.innerHTML = cameraOrbitIcon;
            modeToggleBtn.style.borderColor = '#44aaff';
            modeToggleBtn.title = 'Camera Orbit Mode (tap for Ship Mode)';
            shipControlPad.style.display = 'none';
        } else {
            // In ship mode - show ship rotation icon
            modeToggleBtn.innerHTML = shipRotateIcon;
            modeToggleBtn.style.borderColor = '#44ff88';
            modeToggleBtn.title = 'Ship Rotation Mode (tap for Camera Mode)';
            shipControlPad.style.display = showDpadControls ? 'flex' : 'none';
        }
    }

    modeToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        controlMode = controlMode === 'camera' ? 'ship' : 'camera';
        updateModeToggle();
    });

    modeToggleBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        modeToggleBtn.style.transform = 'scale(0.95)';
    });

    modeToggleBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        modeToggleBtn.style.transform = 'scale(1)';
    });

    document.body.appendChild(modeToggleBtn);

    // Create remaining UI components using helper functions
    // Note: Pause and Quit buttons are now in the hamburger menu
    createHamburgerMenuAndSettings(updateModeToggle);
    createTouchHintsOverlay();
    createGameStatusPanel();
    createUIStyles();

    // Initialize mode toggle state
    setTimeout(updateModeToggle, 0);
}

createControlUI();

// === CAMERA ORBIT STATE (quaternion-based for continuous pole rotation) ===
// Use quaternion to avoid gimbal lock and pole singularity issues
let orbitTheta = 0;  // Horizontal angle (longitude) - for orientation indicator
let orbitPhi = Math.PI / 2;  // Vertical angle (latitude) - for orientation indicator
let cameraOrbitRadius = 15;  // Distance from target
let cameraOrbitQuaternion = new THREE.Quaternion();  // Cumulative rotation quaternion

// Initialize from current camera position
(function initOrbitAngles() {
    const spherical = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(cameraTarget)
    );
    orbitTheta = spherical.theta;
    orbitPhi = spherical.phi;
    cameraOrbitRadius = spherical.radius;

    // Initialize quaternion from initial spherical position
    // Start with camera looking at target from initial position
    const initialDir = camera.position.clone().sub(cameraTarget).normalize();
    const defaultDir = new THREE.Vector3(0, 0, 1);  // Default: looking from +Z
    cameraOrbitQuaternion.setFromUnitVectors(defaultDir, initialDir);
})();

// Update camera position from orbit quaternion (avoids pole singularity)
function updateCameraFromOrbit() {
    // Apply quaternion to get camera direction from target
    const cameraDir = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraOrbitQuaternion);

    // Position camera at orbit radius along this direction
    camera.position.copy(cameraTarget).addScaledVector(cameraDir, cameraOrbitRadius);

    // Compute up vector by rotating world up with the same quaternion
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraOrbitQuaternion);
    camera.up.copy(cameraUp);

    camera.lookAt(cameraTarget);

    // Update spherical angles for orientation indicator display
    const spherical = new THREE.Spherical().setFromVector3(cameraDir);
    orbitTheta = spherical.theta;
    orbitPhi = spherical.phi;
}

// Apply incremental rotation to orbit quaternion (avoids gimbal lock)
function applyOrbitRotation(deltaTheta, deltaPhi) {
    // Create rotation quaternions for horizontal (around world Y) and vertical (around camera right) axes
    // Horizontal rotation: around the camera's local up vector (maintains smooth pole crossing)
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraOrbitQuaternion);
    const horizontalQuat = new THREE.Quaternion().setFromAxisAngle(cameraUp, -deltaTheta);

    // Vertical rotation: around the camera's local right vector
    const cameraDir = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraOrbitQuaternion);
    const cameraRight = new THREE.Vector3().crossVectors(cameraUp, cameraDir).normalize();
    const verticalQuat = new THREE.Quaternion().setFromAxisAngle(cameraRight, deltaPhi);

    // Apply rotations: first horizontal, then vertical
    cameraOrbitQuaternion.premultiply(horizontalQuat);
    cameraOrbitQuaternion.premultiply(verticalQuat);
    cameraOrbitQuaternion.normalize();

    updateCameraFromOrbit();
}

// Reset camera to upright orientation (remove roll) while keeping view direction
function resetCameraOrientation() {
    // Get current camera direction
    const cameraDir = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraOrbitQuaternion);

    // Rebuild quaternion from direction with world up (no roll)
    // This keeps where we're looking but removes any accumulated roll
    const worldUp = new THREE.Vector3(0, 1, 0);

    // Handle edge case: looking straight up or down
    const dotUp = cameraDir.dot(worldUp);
    let cameraRight;
    if (Math.abs(dotUp) > 0.99) {
        // Looking nearly straight up or down - use world forward as reference
        cameraRight = new THREE.Vector3(1, 0, 0);
    } else {
        cameraRight = new THREE.Vector3().crossVectors(worldUp, cameraDir).normalize();
    }
    const cameraUp = new THREE.Vector3().crossVectors(cameraDir, cameraRight).normalize();

    // Build rotation matrix and convert to quaternion
    const rotMatrix = new THREE.Matrix4().makeBasis(cameraRight, cameraUp, cameraDir);
    cameraOrbitQuaternion.setFromRotationMatrix(rotMatrix);
    cameraOrbitQuaternion.normalize();

    updateCameraFromOrbit();
}

// === POINTER EVENTS UNIFIED INPUT ===
// Use pointer events to handle mouse, touch, and stylus uniformly. Behavior:
// - Single pointer: orbit (left-drag) by default. If Shift held => pan, Ctrl held => vertical drag zoom.
// - Two pointers (touch): pan + pinch zoom.
// - Right-button / middle-button drag still performs pan for mouse.

const pointerState = {
    pointers: new Map(), // pointerId -> {x,y, type, button}
    prevSingle: null,
    prevMidpoint: null,
    prevDistance: null,
};
// If pointer events don't work reliably on the device, use touch handlers as a fallback.
let touchHandlersActive = false;

renderer.domElement.addEventListener('pointerdown', (ev) => {
    // Skip pointer events if touch handlers are active (prevents double-handling on touch devices)
    if (touchHandlersActive) return;

    ev.preventDefault();
    renderer.domElement.setPointerCapture(ev.pointerId);
    pointerState.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, type: ev.pointerType, button: ev.button, buttons: ev.buttons });
    if (pointerState.pointers.size === 1) {
        pointerState.prevSingle = { x: ev.clientX, y: ev.clientY };
        // Start raycast aiming in ship mode
        if (controlMode === 'ship') startAiming();
    } else if (pointerState.pointers.size === 2) {
        const pts = Array.from(pointerState.pointers.values());
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        pointerState.prevMidpoint = mid;
        pointerState.prevDistance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
});

renderer.domElement.addEventListener('pointermove', (ev) => {
    // Skip pointer events if touch handlers are active (prevents double-handling on touch devices)
    if (touchHandlersActive) return;

    if (!pointerState.pointers.has(ev.pointerId) && ev.pointerType === 'mouse' && ev.buttons === 0) return;
    const prev = pointerState.pointers.get(ev.pointerId);
    const prevX = prev ? prev.x : ev.clientX;
    const prevY = prev ? prev.y : ev.clientY;
    const deltaX = ev.clientX - prevX;
    const deltaY = ev.clientY - prevY;

    pointerState.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, type: ev.pointerType, button: ev.button, buttons: ev.buttons });

    // Two-pointer touch/pointer gesture: pan + pinch zoom
    if (pointerState.pointers.size === 2) {
        const pts = Array.from(pointerState.pointers.values());
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);

        if (pointerState.prevMidpoint) {
            const panDeltaX = mid.x - pointerState.prevMidpoint.x;
            const panDeltaY = mid.y - pointerState.prevMidpoint.y;

            const cameraDir = new THREE.Vector3();
            camera.getWorldDirection(cameraDir);
            const cameraRight = new THREE.Vector3().crossVectors(cameraDir, camera.up).normalize();
            const cameraUp = new THREE.Vector3().crossVectors(cameraRight, cameraDir).normalize();

            camera.position.addScaledVector(cameraRight, -panDeltaX * panSpeed);
            camera.position.addScaledVector(cameraUp, panDeltaY * panSpeed);
            cameraTarget.addScaledVector(cameraRight, -panDeltaX * panSpeed);
            cameraTarget.addScaledVector(cameraUp, panDeltaY * panSpeed);
        }

        if (pointerState.prevDistance != null) {
            const zoomDelta = (pointerState.prevDistance - dist) * zoomSpeed * 3;
            cameraOrbitRadius = Math.max(3, Math.min(50, cameraOrbitRadius + zoomDelta));
            updateCameraFromOrbit();
        }

        pointerState.prevMidpoint = mid;
        pointerState.prevDistance = dist;
        return;
    }

    // Single pointer handling (mouse or touch)
    // Mouse with right or middle button: pan
    if (ev.pointerType === 'mouse' && (ev.buttons & 2 || ev.buttons & 4)) {
        // right (2) or middle (4)
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const cameraRight = new THREE.Vector3().crossVectors(cameraDir, camera.up).normalize();
        const cameraUp = new THREE.Vector3().crossVectors(cameraRight, cameraDir).normalize();

        const panX = -deltaX * panSpeed;
        const panY = deltaY * panSpeed;

        camera.position.addScaledVector(cameraRight, panX);
        camera.position.addScaledVector(cameraUp, panY);
        cameraTarget.addScaledVector(cameraRight, panX);
        cameraTarget.addScaledVector(cameraUp, panY);
        return;
    }

    // For single-pointer left-drag or touch-drag, respect modifier keys on mouse events
    // For touch pointers, modifiers won't be present; default to orbit.
    const isShift = ev.shiftKey;
    const isCtrl = ev.ctrlKey || ev.metaKey;

    if (isShift && !isCtrl) {
        // Pan
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const cameraRight = new THREE.Vector3().crossVectors(cameraDir, camera.up).normalize();
        const cameraUp = new THREE.Vector3().crossVectors(cameraRight, cameraDir).normalize();

        camera.position.addScaledVector(cameraRight, -deltaX * panSpeed);
        camera.position.addScaledVector(cameraUp, deltaY * panSpeed);
        cameraTarget.addScaledVector(cameraRight, -deltaX * panSpeed);
        cameraTarget.addScaledVector(cameraUp, deltaY * panSpeed);
        return;
    }

    if (isCtrl && !isShift) {
        // Vertical drag zoom
        const zoomAmount = deltaY * zoomSpeed * 4;
        const direction = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize();
        const distance = camera.position.distanceTo(cameraTarget);
        const newDistance = Math.max(3, Math.min(50, distance + zoomAmount));
        camera.position.copy(cameraTarget).addScaledVector(direction, newDistance);
        return;
    }

    // Single pointer drag
    if (pointerState.prevSingle) {
        if (controlMode === 'ship') {
            // Relative drag rotation - accumulate yaw/pitch from delta
            shipYaw   -= deltaX * ROT_SENSITIVITY;
            shipPitch -= deltaY * ROT_SENSITIVITY;
            shipPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, shipPitch));
        } else {
            // Camera mode: orbit around scene using quaternion rotation
            applyOrbitRotation(deltaX * rotationSpeed, deltaY * rotationSpeed);
        }
        pointerState.prevSingle = { x: ev.clientX, y: ev.clientY };
    }
});

renderer.domElement.addEventListener('pointerup', (ev) => {
    // Skip pointer events if touch handlers are active (prevents double-handling on touch devices)
    if (touchHandlersActive) return;

    renderer.domElement.releasePointerCapture(ev.pointerId);
    pointerState.pointers.delete(ev.pointerId);
    if (pointerState.pointers.size === 0) {
        pointerState.prevSingle = null;
        pointerState.prevMidpoint = null;
        pointerState.prevDistance = null;
        // Stop raycast aiming when no pointers active
        stopAiming();
    } else if (pointerState.pointers.size === 1) {
        const remaining = Array.from(pointerState.pointers.values())[0];
        pointerState.prevSingle = { x: remaining.x, y: remaining.y };
        pointerState.prevMidpoint = null;
        pointerState.prevDistance = null;
    }
});

renderer.domElement.addEventListener('pointercancel', (ev) => {
    // Skip pointer events if touch handlers are active (prevents double-handling on touch devices)
    if (touchHandlersActive) return;

    renderer.domElement.releasePointerCapture(ev.pointerId);
    pointerState.pointers.delete(ev.pointerId);
});

// --- TOUCH fallback (restore previous touch behavior if pointer events misbehave) ---
renderer.domElement.addEventListener('touchstart', (event) => {
    event.preventDefault();
    touchHandlersActive = true;
    touchState.pointers = Array.from(event.touches);
    hideTouchHints(); // Hide touch hints on first touch

    if (touchState.pointers.length === 1) {
        touchState.prevPosition = {
            x: touchState.pointers[0].clientX,
            y: touchState.pointers[0].clientY,
        };
        // Start raycast aiming in ship mode
        if (controlMode === 'ship') startAiming();
    } else if (touchState.pointers.length === 2) {
        const t1 = touchState.pointers[0];
        const t2 = touchState.pointers[1];
        touchState.prevMidpoint = {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
        };
        touchState.prevDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    }
}, { passive: false });

renderer.domElement.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const touches = Array.from(event.touches);

    // One finger: Ship aim or Camera orbit depending on mode
    if (touches.length === 1 && touchState.prevPosition) {
        const deltaX = touches[0].clientX - touchState.prevPosition.x;
        const deltaY = touches[0].clientY - touchState.prevPosition.y;

        if (controlMode === 'ship') {
            // Relative drag rotation - accumulate yaw/pitch from delta
            shipYaw   -= deltaX * ROT_SENSITIVITY;
            shipPitch -= deltaY * ROT_SENSITIVITY;
            shipPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, shipPitch));
        } else {
            // Camera mode: orbit around scene using quaternion rotation
            applyOrbitRotation(deltaX * rotationSpeed, deltaY * rotationSpeed);
        }

        touchState.prevPosition = { x: touches[0].clientX, y: touches[0].clientY };
    }

    // Two fingers: Pan + Zoom
    if (touches.length === 2 && touchState.prevMidpoint) {
        const t1 = touches[0];
        const t2 = touches[1];

        const midpoint = {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
        };
        const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

        // Pan
        const panDeltaX = midpoint.x - touchState.prevMidpoint.x;
        const panDeltaY = midpoint.y - touchState.prevMidpoint.y;

        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const cameraRight = new THREE.Vector3().crossVectors(cameraDir, camera.up).normalize();
        const cameraUp = new THREE.Vector3().crossVectors(cameraRight, cameraDir).normalize();

        camera.position.addScaledVector(cameraRight, -panDeltaX * panSpeed);
        camera.position.addScaledVector(cameraUp, panDeltaY * panSpeed);
        cameraTarget.addScaledVector(cameraRight, -panDeltaX * panSpeed);
        cameraTarget.addScaledVector(cameraUp, panDeltaY * panSpeed);

        // Zoom (pinch) - update cameraOrbitRadius
        const zoomDelta = (touchState.prevDistance - distance) * zoomSpeed * 3;
        cameraOrbitRadius = Math.max(3, Math.min(50, cameraOrbitRadius + zoomDelta));
        updateCameraFromOrbit();

        touchState.prevMidpoint = midpoint;
        touchState.prevDistance = distance;
    }

    touchState.pointers = touches;
}, { passive: false });

renderer.domElement.addEventListener('touchend', (event) => {
    touchState.pointers = Array.from(event.touches);
    if (touchState.pointers.length === 0) {
        touchState.prevPosition = null;
        touchState.prevMidpoint = null;
        touchState.prevDistance = null;
        touchHandlersActive = false;
        // Stop raycast aiming when no touches active
        stopAiming();
    } else if (touchState.pointers.length === 1) {
        touchState.prevPosition = {
            x: touchState.pointers[0].clientX,
            y: touchState.pointers[0].clientY,
        };
        touchState.prevMidpoint = null;
        touchState.prevDistance = null;
    }
});

// Keep wheel handling and contextmenu prevention
renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();

    const isSmallDelta = Math.abs(event.deltaY) < 50 && event.deltaMode === 0;
    const forceZoom = event.ctrlKey || event.metaKey;
    const forcePan = event.shiftKey;

    if (forcePan || (!forceZoom && isSmallDelta && !event.altKey)) {
        // Pan (touchpad two-finger scroll)
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const cameraRight = new THREE.Vector3().crossVectors(cameraDir, camera.up).normalize();
        const cameraUp = new THREE.Vector3().crossVectors(cameraRight, cameraDir).normalize();

        const panX = -event.deltaX * panSpeed * 0.5;
        const panY = event.deltaY * panSpeed * 0.5;

        camera.position.addScaledVector(cameraRight, panX);
        camera.position.addScaledVector(cameraUp, panY);
        cameraTarget.addScaledVector(cameraRight, panX);
        cameraTarget.addScaledVector(cameraUp, panY);
    } else {
        // Zoom (mouse wheel or Ctrl/Meta+gesture) - update cameraOrbitRadius
        const zoomAmount = event.deltaY * zoomSpeed;
        cameraOrbitRadius = Math.max(3, Math.min(50, cameraOrbitRadius + zoomAmount));
        updateCameraFromOrbit();
    }
}, { passive: false });

renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

// === KEYBOARD CONTROLS ===
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    keys.shift = e.shiftKey;
    keys.ctrl = e.ctrlKey || e.metaKey;
    // Prevent browser scrolling with arrow keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    keys.shift = e.shiftKey;
    keys.ctrl = e.ctrlKey || e.metaKey;
});

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updatePixelRatio();
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

// === ANIMATION LOOP ===
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Arrow key controls with modifiers
    // Plain arrows: Orbit | Shift+arrows: Pan | Ctrl+arrows: Zoom
    let cameraChanged = false;

    const hasArrow = keys['ArrowLeft'] || keys['ArrowRight'] || keys['ArrowUp'] || keys['ArrowDown'];

    if (hasArrow && keys.shift && !keys.ctrl) {
        // SHIFT + Arrows: Pan
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const cameraRight = new THREE.Vector3().crossVectors(cameraDir, camera.up).normalize();
        const cameraUp = new THREE.Vector3().crossVectors(cameraRight, cameraDir).normalize();
        const keyPanSpeed = 0.15;

        if (keys['ArrowLeft']) {
            camera.position.addScaledVector(cameraRight, -keyPanSpeed);
            cameraTarget.addScaledVector(cameraRight, -keyPanSpeed);
        }
        if (keys['ArrowRight']) {
            camera.position.addScaledVector(cameraRight, keyPanSpeed);
            cameraTarget.addScaledVector(cameraRight, keyPanSpeed);
        }
        if (keys['ArrowUp']) {
            camera.position.addScaledVector(cameraUp, keyPanSpeed);
            cameraTarget.addScaledVector(cameraUp, keyPanSpeed);
        }
        if (keys['ArrowDown']) {
            camera.position.addScaledVector(cameraUp, -keyPanSpeed);
            cameraTarget.addScaledVector(cameraUp, -keyPanSpeed);
        }
    } else if (hasArrow && keys.ctrl && !keys.shift) {
        // CTRL + Up/Down: Zoom
        if (keys['ArrowUp']) {
            cameraOrbitRadius = Math.max(3, cameraOrbitRadius - 0.3);
            cameraChanged = true;
        }
        if (keys['ArrowDown']) {
            cameraOrbitRadius = Math.min(50, cameraOrbitRadius + 0.3);
            cameraChanged = true;
        }
        // CTRL + Left/Right: Also orbit
        if (keys['ArrowLeft']) { applyOrbitRotation(-keyRotationSpeed, 0); }
        if (keys['ArrowRight']) { applyOrbitRotation(keyRotationSpeed, 0); }
    } else if (hasArrow) {
        // Plain arrows: Orbit using quaternion rotation (continuous through poles)
        let deltaTheta = 0, deltaPhi = 0;
        if (keys['ArrowLeft']) { deltaTheta = -keyRotationSpeed; }
        if (keys['ArrowRight']) { deltaTheta = keyRotationSpeed; }
        if (keys['ArrowUp']) { deltaPhi = keyRotationSpeed; }
        if (keys['ArrowDown']) { deltaPhi = -keyRotationSpeed; }
        if (deltaTheta !== 0 || deltaPhi !== 0) {
            applyOrbitRotation(deltaTheta, deltaPhi);
        }
    }

    // +/= and -/_ keys: Zoom (always)
    if (keys['Equal'] || keys['NumpadAdd']) {
        cameraOrbitRadius = Math.max(3, cameraOrbitRadius - 0.3);
        cameraChanged = true;
    }
    if (keys['Minus'] || keys['NumpadSubtract']) {
        cameraOrbitRadius = Math.min(50, cameraOrbitRadius + 0.3);
        cameraChanged = true;
    }

    // Apply camera changes (for zoom only now, rotation uses applyOrbitRotation)
    if (cameraChanged) {
        updateCameraFromOrbit();
    }

    // === PAUSE ALL GAME WORLD ANIMATIONS WHEN PAUSED ===
    // Camera controls above still work so player can look around while paused
    if (gameActive) {

    // Rotate Earth
    earth.rotation.y += planetRotationSpeed * planetRotationDirection * delta;
    clouds.rotation.y += planetRotationSpeed * planetRotationDirection * delta * 1.05;
    atmosphere.rotation.y = earth.rotation.y;

    // Earth's axial tilt: 23.5 degrees = 0.41 radians
    const EARTH_TILT = 0.41;
    earth.rotation.x = EARTH_TILT;
    clouds.rotation.x = EARTH_TILT;
    atmosphere.rotation.x = EARTH_TILT;

    // Moon orbit around Earth with realistic 5.14° inclination
    moonOrbitAngle += moonOrbitSpeed * moonOrbitDirection * delta;
    // Slowly rotate the ascending node (in reality ~18.6 year cycle, sped up for demo)
    moonAscendingNode += 0.01 * delta;

    // Calculate moon position with inclined orbit
    // Position in orbital plane (before inclination)
    const moonX = Math.cos(moonOrbitAngle) * MOON_ORBIT_RADIUS;
    const moonZ = Math.sin(moonOrbitAngle) * MOON_ORBIT_RADIUS;

    // Apply orbital inclination (rotation around the line of nodes)
    // The ascending node determines where the orbital plane intersects the ecliptic
    const cosInc = Math.cos(MOON_ORBIT_INCLINATION);
    const sinInc = Math.sin(MOON_ORBIT_INCLINATION);
    const cosNode = Math.cos(moonAscendingNode);
    const sinNode = Math.sin(moonAscendingNode);

    // Rotate orbital position: first around Y (node), then tilt (inclination)
    moon.position.x = moonX * cosNode - moonZ * sinNode * cosInc;
    moon.position.z = moonX * sinNode + moonZ * cosNode * cosInc;
    moon.position.y = moonZ * sinInc;

    // Moon rotation (tidally locked - same face always toward Earth)
    moon.rotation.y = -moonOrbitAngle + Math.PI;

    // Position moon light near the moon for visibility
    moonLight.position.copy(moon.position);

    // === LUNAR ECLIPSE DETECTION ===
    // Check if moon is in Earth's shadow (opposite side from sun)
    // Using pooled vectors to avoid per-frame allocation
    _sunDir.copy(SUN_POSITION).normalize();
    _moonDir.copy(moon.position).normalize();
    // Dot product: -1 means moon is directly behind Earth from sun's view
    const sunMoonDot = _sunDir.dot(_moonDir);

    // Calculate how close moon is to being perfectly aligned for lunar eclipse
    // Umbra cone angle depends on relative sizes - simplified for visual effect
    const EARTH_RADIUS = 2;
    const umbraAngle = Math.atan(EARTH_RADIUS / SUN_POSITION.length());
    const moonAngularPos = Math.acos(-sunMoonDot); // Angle from anti-sun direction

    // Determine eclipse intensity (0 = no eclipse, 1 = total eclipse)
    let lunarEclipseIntensity = 0;
    if (sunMoonDot < -0.7) { // Moon is roughly behind Earth
        // Check vertical alignment (moon must be near ecliptic plane)
        const verticalOffset = Math.abs(moon.position.y);
        const maxVerticalForEclipse = 0.8; // Some tolerance for partial eclipse

        if (verticalOffset < maxVerticalForEclipse) {
            // Calculate intensity based on alignment
            const alignmentFactor = 1 - (verticalOffset / maxVerticalForEclipse);
            const depthFactor = Math.min(1, (-sunMoonDot - 0.7) / 0.3);
            lunarEclipseIntensity = alignmentFactor * depthFactor;
        }
    }

    // Apply lunar eclipse effect - darken moon and add red tint (like real eclipses)
    // Safely update moon material (check if properties exist)
    if (moonMaterial && moonMaterial.color) {
        if (lunarEclipseIntensity > 0) {
            // During lunar eclipse, moon gets dark reddish color
            const eclipseBrightness = 1 - lunarEclipseIntensity * 0.85;
            const redTint = lunarEclipseIntensity * 0.3;
            moonMaterial.color.setRGB(
                eclipseBrightness + redTint,
                eclipseBrightness * 0.7,
                eclipseBrightness * 0.6
            );
            if (moonMaterial.emissive) {
                moonMaterial.emissive.setRGB(redTint * 0.3, 0, 0);
            }
            moonLight.intensity = 0.3 * (1 - lunarEclipseIntensity * 0.9);
        } else {
            // Normal moon appearance
            moonMaterial.color.setRGB(1, 1, 1);
            if (moonMaterial.emissive) {
                moonMaterial.emissive.setRGB(0, 0, 0);
            }
            moonLight.intensity = 0.3;
        }
    }

    // Ship orbital position (keeps orbiting Earth normally)
orbitAngle -= shipOrbitSpeed * shipOrbitDirection * delta;

const semiMajor = (orbitPerigee + orbitApogee) / 2;
const eccentricityOffset = (orbitApogee - orbitPerigee) / 2;
const currentRadius = semiMajor + eccentricityOffset * Math.cos(orbitAngle);

const incRad = orbitInclination * Math.PI / 180;
const flatX = Math.cos(orbitAngle) * currentRadius;
const flatZ = Math.sin(orbitAngle) * currentRadius;

spaceShip.position.x = flatX;
spaceShip.position.z = flatZ * Math.cos(incRad);
spaceShip.position.y = orbitY + flatZ * Math.sin(incRad);

// Ship orientation - different per mode
if (controlMode === 'camera') {
    // Auto face direction of travel
    const tangentX = Math.sin(orbitAngle) * shipOrbitDirection;
    const tangentZ = -Math.cos(orbitAngle) * shipOrbitDirection * Math.cos(incRad);
    const tangentY = -Math.cos(orbitAngle) * shipOrbitDirection * Math.sin(incRad);

    const forward = new THREE.Vector3(
        spaceShip.position.x + tangentX * 0.1,
        spaceShip.position.y + tangentY * 0.1,
        spaceShip.position.z + tangentZ * 0.1
    );
    spaceShip.lookAt(forward);
    spaceShip.rotateY(Math.PI);
}             else {
            // Relative rotation mode - accumulate angles from drag
            if (pointerState.prevSingle || touchState.prevPosition) {
                // Calculate delta from previous position (already handled in pointer/touch move)
                // Here we just apply accumulated rotation
            }
            
            // Build quaternion from accumulated yaw and pitch
            yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), shipYaw);
            pitchQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), shipPitch);
            spaceShip.quaternion.copy(yawQuat).multiply(pitchQuat);
        }

    // Animate thrusters
    for (let i = 1; i <= 5; i++) {
        const thruster = spaceShip.getObjectByName(`thruster${i}`);
        if (thruster) {
            thruster.children.forEach((cone, j) => {
                const flicker = 0.8 + Math.random() * 0.4;
                const length = 0.85 + Math.random() * 0.3;
                cone.scale.set(flicker, flicker, length);
            });
        }
    }

    // Nav light blinking animation
    const navRed = spaceShip.getObjectByName('navLightRed');
    const navGreen = spaceShip.getObjectByName('navLightGreen');
    if (navRed && navGreen) {
        const time = clock.getElapsedTime();
        // Red blinks every 1 second (on for 0.15s)
        const redBlink = (time % 1.0) < 0.15 ? 1 : 0;
        // Green blinks every 1.2 seconds, offset by 0.5s (on for 0.15s)
        const greenBlink = ((time + 0.5) % 1.2) < 0.15 ? 1 : 0;
        navRed.visible = redBlink === 1;
        navGreen.visible = greenBlink === 1;
    }

    // Update CubeCamera for canopy reflections (every 60 frames for performance)
    // CubeCamera renders the scene 6 times, so minimize update frequency
    if (typeof window._cubeFrameCount === 'undefined') window._cubeFrameCount = 0;
    window._cubeFrameCount++;
    if (window._cubeFrameCount % 60 === 0) {
        const canopy = spaceShip.getObjectByName('cockpitCanopy');
        if (canopy) {
            canopy.visible = false; // Hide canopy while rendering cubemap
            cubeCamera.position.copy(spaceShip.position);
            cubeCamera.update(renderer, scene);
            canopy.visible = true;
        }
    }

    // === BLUE METHANE ENGINE FLAME ANIMATION ===
    const flameTime = clock.getElapsedTime();
    const engineNames = ['top', 'bot_left', 'bot_right'];

    // Calculate thruster intensity based on ship orientation vs movement direction
    // Ship's backward direction (where thrusters point) is local +Z
    const shipBackward = new THREE.Vector3(0, 0, 1);
    shipBackward.applyQuaternion(spaceShip.quaternion);

    // Orbital tangent (movement direction)
    const movementDir = new THREE.Vector3(
        Math.sin(orbitAngle) * shipOrbitDirection,
        0,
        -Math.cos(orbitAngle) * shipOrbitDirection
    ).normalize();

    // Dot product: positive = thrusters facing movement (braking), negative = accelerating
    const thrusterAlignment = shipBackward.dot(movementDir);
    // Convert to throttle: -1 (full forward thrust) → 1.0 throttle, +1 (braking) → 0.0 throttle
    const thrusterIntensity = Math.max(0, -thrusterAlignment);

    engineNames.forEach((pos, idx) => {
        const flame = spaceShip.getObjectByName(`engine_flame_${pos}`);
        const outer = spaceShip.getObjectByName(`engine_outer_${pos}`);
        const core = spaceShip.getObjectByName(`engine_core_${pos}`);

        if (flame && outer) {
            if (thrusterIntensity < 0.1) {
                // Engines off - hide flames
                flame.visible = false;
                outer.visible = false;
            } else {
                flame.visible = true;
                outer.visible = true;

                // Flickering scale with multiple noise frequencies, scaled by intensity
                const flicker1 = Math.sin(flameTime * 25 + idx * 2) * 0.15;
                const flicker2 = Math.sin(flameTime * 40 + idx * 3) * 0.08;
                const flicker3 = Math.sin(flameTime * 15) * 0.1;
                const baseScale = (1 + flicker1 + flicker2 + flicker3) * thrusterIntensity;

                flame.scale.set(0.6 * baseScale, 1.2 * (1 + flicker1 * 1.5) * thrusterIntensity, 1);
                outer.scale.set(0.9 * baseScale, 1.6 * (1 + flicker2 * 1.2) * thrusterIntensity, 1);

                // Slight position jitter
                const jitterZ = Math.sin(flameTime * 30 + idx * 4) * 0.03;
                flame.position.z = 3.6 + jitterZ;
                outer.position.z = 3.8 + jitterZ * 0.5;
            }
        }

        if (core) {
            if (thrusterIntensity < 0.1) {
                core.visible = false;
            } else {
                core.visible = true;
                // Core brightness flicker scaled by intensity
                const coreFlicker = (0.9 + Math.sin(flameTime * 50 + idx) * 0.1) * thrusterIntensity;
                core.material.opacity = coreFlicker;
            }
        }
    });

    // === SPATIAL HASH REBUILD ===
    // Rebuild spatial hashes at the start of collision detection phase
    // This ensures all objects are in correct cells after movement
    rebuildSpatialHashes();

    // === ASTEROID MOVEMENT & ANIMATION ===
    for (let i = asteroids.length - 1; i >= 0; i--) {
        const asteroid = asteroids[i];

        // Always recalculate direction toward Earth to prevent asteroids from drifting away
        // Using pooled vector to avoid per-frame allocation
        _asteroidDir.set(0, 0, 0).sub(asteroid.position).normalize();
        const speed = asteroid.userData.velocity.length(); // Preserve original speed
        asteroid.userData.velocity.copy(_asteroidDir.multiplyScalar(speed));

        // Move asteroid toward Earth (using pooled vector to avoid allocation)
        _asteroidMovement.copy(asteroid.userData.velocity).multiplyScalar(delta);
        asteroid.position.add(_asteroidMovement);

        // Rotate asteroid
        const rotSpeed = asteroid.userData.rotationSpeed;
        asteroid.rotation.x += rotSpeed.x * delta;
        asteroid.rotation.y += rotSpeed.y * delta;
        asteroid.rotation.z += rotSpeed.z * delta;

        // Check collision with Earth
        const distanceToEarth = asteroid.position.length();
        const hitRadius = EARTH_RADIUS + asteroid.userData.size * 0.5;

        if (distanceToEarth < hitRadius) {
            // Check if this is an angel asteroid
            if (asteroid.userData.isAngel) {
                // Angel hit Earth - restore health to both!
                earthHealth = Math.min(maxEarthHealth, earthHealth + 25);
                moonHealth = Math.min(maxMoonHealth, moonHealth + 25);
                updateHealthDisplay();
                updateMoonHealthDisplay();
                createAngelExplosion(asteroid.position.clone());
                showNotification('+25 HEALTH (EARTH & MOON)!', '#88ffaa');
            } else {
                // Regular asteroid hit Earth - damage!
                const damage = Math.ceil(asteroid.userData.size * 5); // Bigger = more damage
                earthHealth -= damage;
                updateHealthDisplay();
                // Create explosion at impact point
                createExplosion(asteroid.position.clone(), asteroid.userData.size);
            }

            // Remove asteroid
            scene.remove(asteroid);
            asteroids.splice(i, 1);
            // Clean up occlusion state to prevent memory leak
            window._asteroidOcclusionState?.delete(asteroid.uuid);

            // Check game over
            if (earthHealth <= 0) {
                earthHealth = 0;
                gameActive = false;
                showGameOver();
            }
            continue; // Skip Moon check if already hit Earth
        }

        // Check collision with Moon
        const distanceToMoon = asteroid.position.distanceTo(moon.position);
        const moonHitRadius = MOON_RADIUS + asteroid.userData.size * 0.5;

        if (distanceToMoon < moonHitRadius) {
            // Check if this is an angel asteroid
            if (asteroid.userData.isAngel) {
                // Angel hit Moon - restore health to both!
                earthHealth = Math.min(maxEarthHealth, earthHealth + 25);
                moonHealth = Math.min(maxMoonHealth, moonHealth + 25);
                updateHealthDisplay();
                updateMoonHealthDisplay();
                createAngelExplosion(asteroid.position.clone());
                showNotification('+25 HEALTH (EARTH & MOON)!', '#88ffaa');
            } else {
                // Regular asteroid hit Moon - damage!
                const damage = Math.ceil(asteroid.userData.size * 5);
                moonHealth -= damage;
                updateMoonHealthDisplay();
                // Create explosion at impact point
                createExplosion(asteroid.position.clone(), asteroid.userData.size);
            }

            // Remove asteroid
            scene.remove(asteroid);
            asteroids.splice(i, 1);
            // Clean up occlusion state to prevent memory leak
            window._asteroidOcclusionState?.delete(asteroid.uuid);

            // Check if Moon is destroyed
            if (moonHealth <= 0) {
                moonHealth = 0;
                // Critical: Moon destruction also destroys Earth!
                earthHealth = 0;
                gameActive = false;
                showGameOver();
            }
        }
    }

    // Check if level failed (all asteroids gone but level not complete)
    checkLevelFailed();

    // === LASER BOLT ANIMATION & COLLISION DETECTION ===
    for (let i = laserBolts.length - 1; i >= 0; i--) {
        const bolt = laserBolts[i];

        // Move bolt (using pooled vector to avoid allocation)
        _boltMovement.copy(bolt.userData.velocity).multiplyScalar(delta);
        bolt.position.add(_boltMovement);
        bolt.userData.distanceTraveled += _boltMovement.length();

        // Check collision with asteroids using spatial hash (broad phase)
        // Query nearby asteroids within max possible hit radius (ASTEROID_MAX_SIZE + 0.5)
        let hitAsteroid = false;
        const maxHitRadius = 2.5; // ASTEROID_MAX_SIZE (2.0) + 0.5 buffer
        const nearbyAsteroids = queryNearbyAsteroids(bolt.position, maxHitRadius);

        for (let j = nearbyAsteroids.length - 1; j >= 0; j--) {
            const asteroid = nearbyAsteroids[j];
            // Skip if asteroid was already removed from the main array
            if (!asteroid.parent) continue;

            const distance = bolt.position.distanceTo(asteroid.position);
            const hitRadius = asteroid.userData.size + 0.5; // Hit radius based on size

            if (distance < hitRadius) {
                // Damage asteroid
                asteroid.userData.health--;

                // Immediate visual feedback - flash the asteroid
                const originalEmissive = asteroid.children[0].material.emissive.getHex();
                asteroid.children[0].material.emissive.setHex(0xffff00); // Yellow flash
                setTimeout(() => {
                    if (asteroid.parent) { // Check still exists
                        asteroid.children[0].material.emissive.setHex(originalEmissive);
                    }
                }, 100);

                // Dramatic hit effect with asteroid feedback
                createHitSpark(bolt.position.clone(), asteroid);

                if (asteroid.userData.health <= 0) {
                    // Check if this is an angel asteroid
                    if (asteroid.userData.isAngel) {
                        // Angel destroyed - restore health to both!
                        earthHealth = Math.min(maxEarthHealth, earthHealth + 25);
                        moonHealth = Math.min(maxMoonHealth, moonHealth + 25);
                        updateHealthDisplay();
                        updateMoonHealthDisplay();
                        createAngelExplosion(asteroid.position.clone());
                    } else {
                        // Regular asteroid destroyed!
                        const asteroidDistance = asteroid.position.length();
                        const multiplier = calculateScoreMultiplier(asteroidDistance);
                        const basePoints = Math.ceil(asteroid.userData.size * 10);
                        const earnedPoints = Math.ceil(basePoints * multiplier);
                        score += earnedPoints;
                        updateScoreDisplay();
                        updateMultiplierDisplay(multiplier);

                        // Show floating score popup for significant multipliers
                        if (multiplier >= 1.5) {
                            showScorePopup(earnedPoints, multiplier, asteroid.position.clone());
                        }

                        // Reward: gain ammo
                        laserAmmo += AMMO_REWARD_PER_KILL;
                        updateAmmoDisplay();

                        // Track kills
                        asteroidsDestroyed++;
                        updateKillCountDisplay();

                        // Decrement level asteroid counter
                        levelAsteroidsRemaining--;

                        // Every 3 kills, spawn an angel asteroid (only if Earth or Moon is damaged)
                        if (asteroidsDestroyed % ANGEL_SPAWN_INTERVAL === 0 && (earthHealth < maxEarthHealth || moonHealth < maxMoonHealth)) {
                            spawnAngelAsteroid();
                        }

                        // Create explosion at asteroid position (size-based)
                        createExplosion(asteroid.position.clone(), asteroid.userData.size);

                        // Check if level is complete
                        checkLevelComplete();
                    }

                    // Remove asteroid from main array (find its index since we're using spatial query results)
                    const asteroidIndex = asteroids.indexOf(asteroid);
                    if (asteroidIndex !== -1) {
                        scene.remove(asteroid);
                        asteroids.splice(asteroidIndex, 1);
                        // Clean up occlusion state to prevent memory leak
                        window._asteroidOcclusionState?.delete(asteroid.uuid);
                    }
                }

                // Return bolt to pool instead of destroying
                returnLaserToPool(bolt);
                laserBolts.splice(i, 1);
                hitAsteroid = true;
                break;
            }
        }

        // Check collision with Earth (friendly fire!)
        if (!hitAsteroid) {
            const distanceToEarth = bolt.position.length();
            if (distanceToEarth < EARTH_RADIUS + 0.3) {
                // Laser hit Earth!
                const damage = 2; // Small damage per laser hit
                earthHealth -= damage;
                updateHealthDisplay();

                // Create small impact explosion on Earth
                createExplosion(bolt.position.clone(), 0.3);

                // Return bolt to pool instead of destroying
                returnLaserToPool(bolt);
                laserBolts.splice(i, 1);
                hitAsteroid = true; // Prevent further checks

                // Check game over
                if (earthHealth <= 0) {
                    earthHealth = 0;
                    gameActive = false;
                    showGameOver();
                }
            }
        }

        // Check collision with Moon (friendly fire!)
        if (!hitAsteroid) {
            const distanceToMoon = bolt.position.distanceTo(moon.position);
            if (distanceToMoon < MOON_RADIUS + 0.3) {
                // Laser hit Moon!
                const damage = 2; // Small damage per laser hit
                moonHealth -= damage;
                updateMoonHealthDisplay();

                // Create small impact explosion on Moon
                createExplosion(bolt.position.clone(), 0.3);

                // Return bolt to pool instead of destroying
                returnLaserToPool(bolt);
                laserBolts.splice(i, 1);
                hitAsteroid = true; // Prevent further checks

                // Check if Moon is destroyed
                if (moonHealth <= 0) {
                    moonHealth = 0;
                    // Critical: Moon destruction also destroys Earth!
                    earthHealth = 0;
                    gameActive = false;
                    showGameOver();
                }
            }
        }

        // Return to pool if traveled too far (and didn't hit anything)
        if (!hitAsteroid && bolt.userData.distanceTraveled > LASER_MAX_DISTANCE) {
            returnLaserToPool(bolt);
            laserBolts.splice(i, 1);
        }
    }

    // === SPAWN ASTEROIDS ===
    spawnAsteroids();

    // Update asteroid count display (using cached DOM reference)
    const asteroidCountEl = _domCache.get('asteroidCount');
    if (asteroidCountEl) {
        asteroidCountEl.textContent = asteroids.length;
        // Make threats pulse/glow when there are active threats
        if (asteroids.length > 0) {
            asteroidCountEl.classList.add('threat-active');
        } else {
            asteroidCountEl.classList.remove('threat-active');
        }
    }

    // === UPDATE HUD ===
    updateTargetingHUD();
    updateThreatIndicator();

    // === UPDATE GAME TIMER === (using cached DOM reference)
    if (gameStartTime && gameActive) {
        gameElapsedTime = Math.floor((Date.now() - gameStartTime) / 1000);
        const timerEl = _domCache.get('gameTimer');
        if (timerEl) {
            timerEl.textContent = formatTime(gameElapsedTime);
        }
    }

    // === EXPLOSION ANIMATION ===
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];
        const age = Date.now() - explosion.userData.createdAt;
        const progress = age / explosion.userData.duration;

        if (progress >= 1) {
            // Return all pooled children to their pools before removing explosion group
            cleanupExplosionGroup(explosion);
            scene.remove(explosion);
            explosions.splice(i, 1);
        } else {
            // Animate explosion particles (using pooled vector to avoid allocation)
            explosion.children.forEach(child => {
                if (child.userData.velocity) {
                    _tempVec1.copy(child.userData.velocity).multiplyScalar(delta);
                    child.position.add(_tempVec1);
                    if (child.material && child.material.opacity !== undefined) {
                        child.material.opacity = 1 - progress;
                    }
                    if (child.userData.initialScale) {
                        const scale = child.userData.initialScale * (1 + progress * 3);
                        child.scale.set(scale, scale, scale);
                    }
                    // Rotate debris chunks
                    if (child.userData.rotationSpeed) {
                        child.rotation.x += child.userData.rotationSpeed.x * delta;
                        child.rotation.y += child.userData.rotationSpeed.y * delta;
                        child.rotation.z += child.userData.rotationSpeed.z * delta;
                    }
                }
            });
            // Fade flash
            if (explosion.userData.flash) {
                explosion.userData.flash.intensity = 3 * (1 - progress);
            }
        }
    }

    // Subtle starfield rotation
    starfield.rotation.y += 0.00005;

    } // End of gameActive check - animations paused when game is paused

    // Update orientation indicators (throttled to every 3 frames for performance)
    // These require separate render() calls so we minimize their frequency
    if (typeof window._orientFrameCount === 'undefined') window._orientFrameCount = 0;
    window._orientFrameCount++;
    if (window._orientFrameCount % 3 === 0) {
        // Main orientation indicator
        if (window.orientationHuman && window.orientationRenderer) {
            // Use the full camera quaternion to capture yaw, pitch, AND roll
            window.orientationHuman.quaternion.copy(cameraOrbitQuaternion);
            // Rotate 180° on Y because human faces +Z but we view from +Z
            window.orientationHuman.rotateY(Math.PI);
            window.orientationRenderer.render(window.orientationScene, window.orientationCamera);
        }

        // Mini orientation indicator (shown when dashboard is collapsed)
        if (window.miniOrientationHuman && window.miniOrientationRenderer) {
            window.miniOrientationHuman.quaternion.copy(cameraOrbitQuaternion);
            window.miniOrientationHuman.rotateY(Math.PI);
            window.miniOrientationRenderer.render(window.miniOrientationScene, window.miniOrientationCamera);
        }
    }

    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

// Show game instructions (isResume = true when called from info button)
function showInstructions(isResume = false) {
    // Pause game if resuming
    const wasPaused = !gameActive;
    if (isResume) {
        gameActive = false;
    }

    const overlay = document.createElement('div');
    overlay.id = 'instructionsOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        z-index: 10000;
        font-family: 'Courier New', monospace;
        color: #ffffff;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        padding: 20px 10px;
        box-sizing: border-box;
    `;
    overlay.innerHTML = `
        <div style="
            max-width: 600px;
            width: 100%;
            padding: 20px;
            box-sizing: border-box;
        ">
            <h1 style="
                color: #44ff88;
                font-size: clamp(24px, 6vw, 36px);
                text-align: center;
                margin-bottom: 20px;
            ">
                EARTH DEFENDER
            </h1>

            <div style="
                font-size: clamp(14px, 3.5vw, 18px);
                line-height: 1.6;
                margin-bottom: 20px;
            ">
                <p><strong style="color: #ffff44;">OBJECTIVE:</strong></p>
                <p style="margin: 5px 0;">Destroy all asteroids in each level to advance. Complete all 10 levels to win!</p>

                <p style="margin-top: 15px;"><strong style="color: #ffff44;">LEVEL SYSTEM:</strong></p>
                <p style="margin: 5px 0;">• Level 1 = 1 asteroid, Level 2 = 2 asteroids, ..., Level 10 = 10 asteroids</p>
                <p style="margin: 5px 0;">• Destroy all targets to advance to the next level</p>
                <p style="margin: 5px 0;">• Each level gives 40 ammo per asteroid (Level 5 = 200 ammo)</p>

                <p style="margin-top: 15px;"><strong style="color: #ffff44;">CONTROLS:</strong></p>
                <p style="margin: 5px 0;">• <strong>Mouse/Touch:</strong> Aim and rotate ship or camera</p>
                <p style="margin: 5px 0;">• <strong>Click/Tap:</strong> Fire lasers</p>
                <p style="margin: 5px 0;">• <strong>Arrow Keys:</strong> Rotate ship (WASD also works)</p>
                <p style="margin: 5px 0;">• <strong>Spacebar:</strong> Fire lasers</p>
                <p style="margin: 5px 0;">• <strong>Ship/Camera Toggle:</strong> Switch control modes</p>

                <p style="margin-top: 15px;"><strong style="color: #ffff44;">SPECIAL:</strong></p>
                <p style="margin: 5px 0;">• <span style="color: #00ff00;">Green Angel Asteroids</span> restore Earth health when destroyed</p>
                <p style="margin: 5px 0;">• Target reticles hide when asteroids are behind Earth/Moon/Ship</p>
            </div>

            <button id="startGameBtn" style="
                padding: 15px 40px;
                font-size: clamp(18px, 4vw, 24px);
                background: linear-gradient(135deg, #44ff88, #00cc66);
                color: #000;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                font-family: 'Courier New', monospace;
                font-weight: bold;
                box-shadow: 0 0 20px rgba(68, 255, 136, 0.5);
                display: block;
                margin: 20px auto;
                min-height: 44px;
                min-width: 120px;
                touch-action: manipulation;
            ">${isResume ? 'RESUME GAME' : 'START GAME'}</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('startGameBtn').addEventListener('click', () => {
        // Pre-initialize audio context on user gesture for zero-latency sound
        getAudioContext();

        overlay.remove();

        if (!isResume) {
            // Check for saved game before starting new
            if (hasSavedGame()) {
                showContinueDialog();
                return; // Don't start new game yet - dialog will handle it
            }

            // Starting new game - reset timer
            gameStartTime = Date.now();
            gameElapsedTime = 0;
            leaderboardChecked = false;
            // Reset and show touch hints for new game
            touchHintsShownThisSession = false;
            gameActive = true;
        }

        // Resume game if it wasn't already paused
        if (isResume && !wasPaused) {
            gameActive = true;
        }

        // Show touch hints if applicable
        updateTouchHintsOverlay();
    });
}

// Show instructions on first load
showInstructions();

// Initialize object pools BEFORE gameplay starts (pre-allocate all pooled objects)
initObjectPools();
console.log('[POOLS] Object pools initialized:', {
    lasers: laserPool.length,
    particles: explosionParticlePool.length,
    debris: debrisPool.length,
    lights: explosionLightPool.length
});

// Initialize game: start at level 1
startLevel(1);

animate();
