// Space Scene - Three.js Frontend

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
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

const EARTH_TEXTURE_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg';
const EARTH_BUMP_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png';
const EARTH_SPECULAR_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-water.png';
const CLOUDS_TEXTURE_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-clouds.png';
const EARTH_NIGHT_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg';

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
scene.add(earth);

// Cloud layer
const cloudGeometry = new THREE.SphereGeometry(2.03, 64, 64);
const cloudMaterial = new THREE.MeshPhongMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.6,
    depthWrite: false
});
const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
scene.add(clouds);

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
    specular: new THREE.Color(0x222222)
});

const moon = new THREE.Mesh(moonGeometry, moonMaterial);
scene.add(moon);

// Add a subtle light that follows the moon to ensure it's visible
const moonLight = new THREE.PointLight(0xffffee, 0.3, 10);
scene.add(moonLight);

// Moon orbital parameters
const MOON_ORBIT_RADIUS = 6;
const MOON_ORBIT_SPEED = 0.15;
let moonOrbitAngle = 0;

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
// === SPACESHIP - X-Wing inspired Star Wars style fighter ===
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

    // Materials - weathered military spacecraft look
    const hullMat = new THREE.MeshStandardMaterial({
        color: 0xd8d8d0,
        metalness: 0.4,
        roughness: 0.6
    });
    const darkHullMat = new THREE.MeshStandardMaterial({
        color: 0x3a3a3a,
        metalness: 0.5,
        roughness: 0.5
    });
    const accentMat = new THREE.MeshStandardMaterial({
        color: 0xcc3333,
        metalness: 0.3,
        roughness: 0.4
    });
    const engineMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        metalness: 0.7,
        roughness: 0.3
    });
    const interiorMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.2,
        roughness: 0.8
    });

    // === MAIN FUSELAGE - Angular X-Wing style ===
    // Nose cone - pointed
    const noseGeo = new THREE.ConeGeometry(0.25, 1.2, 6);
    const nose = new THREE.Mesh(noseGeo, hullMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -2.8;
    ship.add(nose);

    // Main body - hexagonal cross-section
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(0, 0.35);
    bodyShape.lineTo(0.3, 0.2);
    bodyShape.lineTo(0.3, -0.15);
    bodyShape.lineTo(0, -0.25);
    bodyShape.lineTo(-0.3, -0.15);
    bodyShape.lineTo(-0.3, 0.2);
    bodyShape.closePath();

    const extrudeSettings = { depth: 3.5, bevelEnabled: false };
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    const body = new THREE.Mesh(bodyGeo, hullMat);
    body.rotation.x = Math.PI;
    body.position.z = -2.2;
    ship.add(body);

    // Rear engine housing
    const rearGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.8, 8);
    const rear = new THREE.Mesh(rearGeo, darkHullMat);
    rear.rotation.x = Math.PI / 2;
    rear.position.z = 1.7;
    ship.add(rear);

    // === COCKPIT INTERIOR ===
    // Cockpit floor/base
    const cockpitFloor = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.05, 0.8),
        interiorMat
    );
    cockpitFloor.position.set(0, -0.05, -1.8);
    ship.add(cockpitFloor);

    // Pilot seat
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.25), interiorMat);
    seatBase.position.set(0, 0.05, -1.7);
    ship.add(seatBase);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.08), interiorMat);
    seatBack.position.set(0, 0.22, -1.55);
    seatBack.rotation.x = 0.15;
    ship.add(seatBack);

    // Pilot body (orange flight suit like Rebel pilot)
    const pilotBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.25, 8),
        new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.8 })
    );
    pilotBody.position.set(0, 0.22, -1.7);
    ship.add(pilotBody);

    // Pilot helmet (white with visor)
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.3, metalness: 0.1 });
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), helmetMat);
    helmet.position.set(0, 0.42, -1.7);
    helmet.scale.set(1, 1.1, 1);
    ship.add(helmet);
    // Visor
    const visor = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.1 })
    );
    visor.position.set(0, 0.42, -1.65);
    visor.rotation.x = Math.PI * 0.6;
    ship.add(visor);

    // Control console
    const console1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.15), interiorMat);
    console1.position.set(0, 0.15, -2.1);
    console1.rotation.x = -0.4;
    ship.add(console1);

    // Console screens (glowing)
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
    const screen1 = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.05), screenMat);
    screen1.position.set(-0.08, 0.2, -2.05);
    screen1.rotation.x = -0.4;
    ship.add(screen1);
    const screen2 = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.05), new THREE.MeshBasicMaterial({ color: 0xff8800 }));
    screen2.position.set(0.08, 0.2, -2.05);
    screen2.rotation.x = -0.4;
    ship.add(screen2);

    // Control sticks
    const stickMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.15, 8), stickMat);
    stick.position.set(0.12, 0.12, -1.9);
    stick.rotation.z = -0.2;
    ship.add(stick);

    // === CANOPY - Reflective glass ===
    const canopyGeo = new THREE.SphereGeometry(0.38, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const canopyMat = new THREE.MeshPhysicalMaterial({
        color: 0x88aacc,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.7,
        thickness: 0.5,
        envMap: cubeRenderTarget.texture,
        envMapIntensity: 1.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        reflectivity: 1.0,
        ior: 1.52,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.scale.set(0.9, 0.7, 1.4);
    canopy.position.set(0, 0.32, -1.75);
    canopy.name = 'cockpitCanopy';
    ship.add(canopy);

    // Canopy frame (metal strips)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.3 });
    const frameStrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.9), frameMat);
    frameStrip.position.set(0, 0.52, -1.75);
    ship.add(frameStrip);

    // === S-FOILS (X-Wing style wings) ===
    function createWing(isTop, isLeft) {
        const wingGroup = new THREE.Group();
        const xMult = isLeft ? -1 : 1;
        const yMult = isTop ? 1 : -1;

        // Main wing structure
        const wingGeo = new THREE.BoxGeometry(2.2, 0.04, 0.35);
        const wing = new THREE.Mesh(wingGeo, hullMat);
        wing.position.set(xMult * 1.3, yMult * 0.08, 0.3);
        wingGroup.add(wing);

        // Wing stripe (red accent)
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.045, 0.08), accentMat);
        stripe.position.set(xMult * 1.0, yMult * 0.085, 0.3);
        wingGroup.add(stripe);

        // Laser cannon at wing tip
        const cannonGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.8, 8);
        const cannon = new THREE.Mesh(cannonGeo, darkHullMat);
        cannon.rotation.x = Math.PI / 2;
        cannon.position.set(xMult * 2.3, yMult * 0.08, -0.3);
        wingGroup.add(cannon);

        // Cannon tip (glowing)
        const cannonTip = new THREE.Mesh(
            new THREE.SphereGeometry(0.035, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff2200 })
        );
        cannonTip.position.set(xMult * 2.3, yMult * 0.08, -1.15);
        cannonTip.name = isLeft ? 'cannonTipLeft' : 'cannonTipRight';
        wingGroup.add(cannonTip);

        return wingGroup;
    }

    ship.add(createWing(true, true));   // Top left
    ship.add(createWing(true, false));  // Top right
    ship.add(createWing(false, true));  // Bottom left
    ship.add(createWing(false, false)); // Bottom right

    // === ENGINES (4 engine pods with blue methane flames) ===
    // Create flame texture for engine glow
    function makeBlueFlameTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        grad.addColorStop(0, 'rgba(220,240,255,1)');
        grad.addColorStop(0.2, 'rgba(100,180,255,0.95)');
        grad.addColorStop(0.5, 'rgba(30,100,220,0.7)');
        grad.addColorStop(0.8, 'rgba(10,40,150,0.3)');
        grad.addColorStop(1, 'rgba(0,10,60,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }
    const blueFlameTexture = makeBlueFlameTexture();

    function createEngine(isTop, isLeft) {
        const engGroup = new THREE.Group();
        const xMult = isLeft ? -1 : 1;
        const yMult = isTop ? 1 : -1;
        const engX = xMult * 0.55;
        const engY = yMult * 0.15;

        // Engine nacelle
        const nacelle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.15, 1.2, 12),
            engineMat
        );
        nacelle.rotation.x = Math.PI / 2;
        nacelle.position.set(engX, engY, 1.0);
        engGroup.add(nacelle);

        // Engine intake ring
        const intake = new THREE.Mesh(
            new THREE.TorusGeometry(0.13, 0.025, 8, 16),
            darkHullMat
        );
        intake.position.set(engX, engY, 0.35);
        engGroup.add(intake);

        // Exhaust nozzle
        const nozzle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.11, 0.15, 12),
            new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.2 })
        );
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(engX, engY, 1.55);
        engGroup.add(nozzle);

        // Hot white core
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xeeffff });
        const core = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), coreMat);
        core.position.set(engX, engY, 1.62);
        core.name = `engine_core_${isTop ? 'top' : 'bot'}_${isLeft ? 'left' : 'right'}`;
        engGroup.add(core);

        // Blue flame sprite (main glow)
        const flameMat = new THREE.SpriteMaterial({
            map: blueFlameTexture,
            color: 0x88ccff,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
        const flame = new THREE.Sprite(flameMat);
        flame.scale.set(0.35, 0.5, 1);
        flame.position.set(engX, engY, 1.85);
        flame.name = `engine_flame_${isTop ? 'top' : 'bot'}_${isLeft ? 'left' : 'right'}`;
        engGroup.add(flame);

        // Outer glow sprite
        const outerMat = new THREE.SpriteMaterial({
            map: blueFlameTexture,
            color: 0x4488ff,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });
        const outer = new THREE.Sprite(outerMat);
        outer.scale.set(0.5, 0.7, 1);
        outer.position.set(engX, engY, 1.95);
        outer.name = `engine_outer_${isTop ? 'top' : 'bot'}_${isLeft ? 'left' : 'right'}`;
        engGroup.add(outer);

        // Point light for glow
        const engLight = new THREE.PointLight(0x4488ff, 0.5, 3, 2);
        engLight.position.set(engX, engY, 1.7);
        engGroup.add(engLight);

        return engGroup;
    }

    ship.add(createEngine(true, true));
    ship.add(createEngine(true, false));
    ship.add(createEngine(false, true));
    ship.add(createEngine(false, false));

    // === ASTROMECH DROID (R2 unit) ===
    const droidBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.2, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
    );
    droidBody.position.set(0, 0.25, -0.8);
    ship.add(droidBody);

    const droidHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
    );
    droidHead.position.set(0, 0.35, -0.8);
    ship.add(droidHead);

    // Droid eye
    const droidEye = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    droidEye.position.set(0, 0.38, -0.72);
    ship.add(droidEye);

    // Blue panels on droid
    const droidPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, 0.01),
        new THREE.MeshStandardMaterial({ color: 0x0044aa })
    );
    droidPanel.position.set(0.07, 0.25, -0.71);
    ship.add(droidPanel);

    // === NAV LIGHTS ===
    const navGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const navR = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    navR.position.set(-2.4, 0, 0.3);
    navR.name = 'navLightRed';
    ship.add(navR);

    const navG = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    navG.position.set(2.4, 0, 0.3);
    navG.name = 'navLightGreen';
    ship.add(navG);

    // White tail light
    const navW = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    navW.position.set(0, 0, 2.1);
    ship.add(navW);

    return ship;
}

const spaceShip = createSpaceShip();
scene.add(spaceShip);

// === LASER SYSTEM ===
const laserBolts = [];
const LASER_SPEED = 80;
const LASER_MAX_DISTANCE = 150;

// Create laser bolt geometry and material (reusable)
const laserGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8);
const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
const laserGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.6
});

function fireLasers() {
    // Get ship's forward direction (negative Z in local space)
    const shipDirection = new THREE.Vector3(0, 0, -1);
    shipDirection.applyQuaternion(spaceShip.quaternion);

    // Cannon positions (4 wing tips)
    const cannonOffsets = [
        { x: -2.3, y: 0.08 },   // Top left
        { x: 2.3, y: 0.08 },    // Top right
        { x: -2.3, y: -0.08 },  // Bottom left
        { x: 2.3, y: -0.08 }    // Bottom right
    ];

    cannonOffsets.forEach(offset => {
        // Create laser bolt
        const bolt = new THREE.Group();

        // Core (bright red)
        const core = new THREE.Mesh(laserGeo, laserMat);
        core.rotation.x = Math.PI / 2;
        bolt.add(core);

        // Glow layer
        const glow = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8),
            laserGlowMat
        );
        glow.rotation.x = Math.PI / 2;
        bolt.add(glow);

        // Point light for illumination
        const light = new THREE.PointLight(0xff3300, 0.8, 2);
        bolt.add(light);

        // Position at cannon tip in world space
        const localPos = new THREE.Vector3(offset.x, offset.y, -1.15);
        localPos.applyQuaternion(spaceShip.quaternion);
        bolt.position.copy(spaceShip.position).add(localPos);

        // Store velocity and distance traveled
        bolt.userData.velocity = shipDirection.clone().multiplyScalar(LASER_SPEED);
        bolt.userData.distanceTraveled = 0;

        // Orient bolt in direction of travel
        bolt.lookAt(bolt.position.clone().add(shipDirection));

        scene.add(bolt);
        laserBolts.push(bolt);
    });
}

// Spacebar listener for firing
let canFire = true;
const FIRE_COOLDOWN = 150; // ms between shots

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && canFire) {
        e.preventDefault();
        fireLasers();
        canFire = false;
        setTimeout(() => { canFire = true; }, FIRE_COOLDOWN);
    }
});

// === ORBIT PARAMETERS ===
const orbitRadius = 4.5;
const orbitY = 1.5;

// Ship starts already partway through entry for immediate action
let shipPhase = 'orbit'; // Start directly in orbit for smooth experience
let orbitAngle = Math.PI * 1.5; // Starting angle

spaceShip.position.set(
    Math.cos(orbitAngle) * orbitRadius,
    orbitY,
    Math.sin(orbitAngle) * orbitRadius
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
function createControlUI() {
    const container = document.createElement('div');
    container.id = 'controls';
    container.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 15, 30, 0.9);
        border: 1px solid #4488ff;
        border-radius: 12px;
        padding: 15px 25px;
        display: flex;
        gap: 30px;
        font-family: 'Courier New', monospace;
        color: #4488ff;
        box-shadow: 0 0 20px rgba(68, 136, 255, 0.2);
    `;

    // Planet controls
    const planetDiv = document.createElement('div');
    planetDiv.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 8px;';

    const planetLabel = document.createElement('div');
    planetLabel.textContent = 'PLANET';
    planetLabel.style.cssText = 'font-size: 10px; letter-spacing: 2px; opacity: 0.7;';
    planetDiv.appendChild(planetLabel);

    const planetSlider = document.createElement('input');
    planetSlider.type = 'range';
    planetSlider.min = '-100';
    planetSlider.max = '100';
    planetSlider.value = '25';
    planetSlider.style.cssText = 'width: 120px; cursor: pointer;';
    planetDiv.appendChild(planetSlider);

    const planetValue = document.createElement('div');
    planetValue.style.cssText = 'font-size: 10px;';
    planetValue.textContent = 'CW 0.12';
    planetDiv.appendChild(planetValue);

    container.appendChild(planetDiv);

    // Ship controls
    const shipDiv = document.createElement('div');
    shipDiv.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 8px;';

    const shipLabel = document.createElement('div');
    shipLabel.textContent = 'SHIP ORBIT';
    shipLabel.style.cssText = 'font-size: 10px; letter-spacing: 2px; opacity: 0.7;';
    shipDiv.appendChild(shipLabel);

    const shipSlider = document.createElement('input');
    shipSlider.type = 'range';
    shipSlider.min = '-100';
    shipSlider.max = '100';
    shipSlider.value = '50';
    shipSlider.style.cssText = 'width: 120px; cursor: pointer;';
    shipDiv.appendChild(shipSlider);

    const shipValue = document.createElement('div');
    shipValue.style.cssText = 'font-size: 10px;';
    shipValue.textContent = 'CW 0.25';
    shipDiv.appendChild(shipValue);

    container.appendChild(shipDiv);

    document.body.appendChild(container);

    // Event handlers
    planetSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        planetRotationSpeed = Math.abs(val) / 400;
        planetRotationDirection = val >= 0 ? 1 : -1;
        const dir = val === 0 ? 'STOP' : (val > 0 ? 'CW' : 'CCW');
        planetValue.textContent = `${dir} ${planetRotationSpeed.toFixed(2)}`;
    });

    shipSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        shipOrbitSpeed = Math.abs(val) / 200;
        shipOrbitDirection = val >= 0 ? 1 : -1;
        const dir = val === 0 ? 'STOP' : (val > 0 ? 'CW' : 'CCW');
        shipValue.textContent = `${dir} ${shipOrbitSpeed.toFixed(2)}`;
    });

    // Laser fire button
    const laserDiv = document.createElement('div');
    laserDiv.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;';

    const laserBtn = document.createElement('button');
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
    laserBtn.addEventListener('mousedown', () => {
        laserBtn.style.transform = 'scale(0.95)';
        laserBtn.style.boxShadow = '0 0 25px rgba(255, 50, 0, 0.8), inset 0 1px 0 rgba(255,255,255,0.2)';
    });
    laserBtn.addEventListener('mouseup', () => {
        laserBtn.style.transform = 'scale(1)';
        laserBtn.style.boxShadow = '0 0 15px rgba(255, 50, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)';
    });
    laserBtn.addEventListener('mouseleave', () => {
        laserBtn.style.transform = 'scale(1)';
        laserBtn.style.boxShadow = '0 0 15px rgba(255, 50, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)';
    });
    laserBtn.addEventListener('click', () => {
        if (canFire) {
            fireLasers();
            canFire = false;
            setTimeout(() => { canFire = true; }, FIRE_COOLDOWN);
        }
    });
    // Touch support
    laserBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        laserBtn.style.transform = 'scale(0.95)';
        if (canFire) {
            fireLasers();
            canFire = false;
            setTimeout(() => { canFire = true; }, FIRE_COOLDOWN);
        }
    });
    laserBtn.addEventListener('touchend', () => {
        laserBtn.style.transform = 'scale(1)';
    });

    laserDiv.appendChild(laserBtn);
    container.appendChild(laserDiv);

    // Slider styling
    const style = document.createElement('style');
    style.textContent = `
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
    `;
    document.head.appendChild(style);
}

createControlUI();

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
    ev.preventDefault();
    renderer.domElement.setPointerCapture(ev.pointerId);
    pointerState.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, type: ev.pointerType, button: ev.button, buttons: ev.buttons });
    if (pointerState.pointers.size === 1) {
        pointerState.prevSingle = { x: ev.clientX, y: ev.clientY };
    } else if (pointerState.pointers.size === 2) {
        const pts = Array.from(pointerState.pointers.values());
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        pointerState.prevMidpoint = mid;
        pointerState.prevDistance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
});

renderer.domElement.addEventListener('pointermove', (ev) => {
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
            const direction = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize();
            const currentDist = camera.position.distanceTo(cameraTarget);
            const newDist = Math.max(3, Math.min(50, currentDist + zoomDelta));
            camera.position.copy(cameraTarget).addScaledVector(direction, newDist);
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

    // Orbit
    if (pointerState.prevSingle) {
        const spherical = new THREE.Spherical().setFromVector3(
            camera.position.clone().sub(cameraTarget)
        );
        spherical.theta -= deltaX * rotationSpeed;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - deltaY * rotationSpeed));

        const newPos = new THREE.Vector3().setFromSpherical(spherical);
        camera.position.copy(cameraTarget).add(newPos);
        camera.lookAt(cameraTarget);
        pointerState.prevSingle = { x: ev.clientX, y: ev.clientY };
    }
});

renderer.domElement.addEventListener('pointerup', (ev) => {
    renderer.domElement.releasePointerCapture(ev.pointerId);
    pointerState.pointers.delete(ev.pointerId);
    if (pointerState.pointers.size === 0) {
        pointerState.prevSingle = null;
        pointerState.prevMidpoint = null;
        pointerState.prevDistance = null;
    } else if (pointerState.pointers.size === 1) {
        const remaining = Array.from(pointerState.pointers.values())[0];
        pointerState.prevSingle = { x: remaining.x, y: remaining.y };
        pointerState.prevMidpoint = null;
        pointerState.prevDistance = null;
    }
});

renderer.domElement.addEventListener('pointercancel', (ev) => {
    renderer.domElement.releasePointerCapture(ev.pointerId);
    pointerState.pointers.delete(ev.pointerId);
});

// --- TOUCH fallback (restore previous touch behavior if pointer events misbehave) ---
renderer.domElement.addEventListener('touchstart', (event) => {
    event.preventDefault();
    touchHandlersActive = true;
    touchState.pointers = Array.from(event.touches);

    if (touchState.pointers.length === 1) {
        touchState.prevPosition = {
            x: touchState.pointers[0].clientX,
            y: touchState.pointers[0].clientY,
        };
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

    // One finger: Orbit
    if (touches.length === 1 && touchState.prevPosition) {
        const deltaX = touches[0].clientX - touchState.prevPosition.x;
        const deltaY = touches[0].clientY - touchState.prevPosition.y;

        const spherical = new THREE.Spherical().setFromVector3(
            camera.position.clone().sub(cameraTarget)
        );
        spherical.theta -= deltaX * rotationSpeed;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - deltaY * rotationSpeed));

        const newPos = new THREE.Vector3().setFromSpherical(spherical);
        camera.position.copy(cameraTarget).add(newPos);
        camera.lookAt(cameraTarget);

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

        // Zoom (pinch) - 6x multiplier for responsive pinch
        const zoomDelta = (touchState.prevDistance - distance) * zoomSpeed * 3;
        const direction = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize();
        const currentDist = camera.position.distanceTo(cameraTarget);
        const newDist = Math.max(3, Math.min(50, currentDist + zoomDelta));
        camera.position.copy(cameraTarget).addScaledVector(direction, newDist);

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
        // Zoom (mouse wheel or Ctrl/Meta+gesture)
        const zoomAmount = event.deltaY * zoomSpeed;
        const direction = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize();
        const distance = camera.position.distanceTo(cameraTarget);
        const newDistance = Math.max(3, Math.min(50, distance + zoomAmount));

        camera.position.copy(cameraTarget).addScaledVector(direction, newDistance);
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
    const spherical = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(cameraTarget)
    );
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
        cameraChanged = true;
    } else if (hasArrow && keys.ctrl && !keys.shift) {
        // CTRL + Up/Down: Zoom
        if (keys['ArrowUp']) {
            spherical.radius = Math.max(3, spherical.radius - 0.3);
            cameraChanged = true;
        }
        if (keys['ArrowDown']) {
            spherical.radius = Math.min(50, spherical.radius + 0.3);
            cameraChanged = true;
        }
        // CTRL + Left/Right: Also orbit (or could be something else)
        if (keys['ArrowLeft']) { spherical.theta += keyRotationSpeed; cameraChanged = true; }
        if (keys['ArrowRight']) { spherical.theta -= keyRotationSpeed; cameraChanged = true; }
    } else if (hasArrow) {
        // Plain arrows: Orbit
        if (keys['ArrowLeft']) { spherical.theta += keyRotationSpeed; cameraChanged = true; }
        if (keys['ArrowRight']) { spherical.theta -= keyRotationSpeed; cameraChanged = true; }
        if (keys['ArrowUp']) { spherical.phi = Math.max(0.1, spherical.phi - keyRotationSpeed); cameraChanged = true; }
        if (keys['ArrowDown']) { spherical.phi = Math.min(Math.PI - 0.1, spherical.phi + keyRotationSpeed); cameraChanged = true; }
    }

    // +/= and -/_ keys: Zoom (always)
    if (keys['Equal'] || keys['NumpadAdd']) {
        spherical.radius = Math.max(3, spherical.radius - 0.3);
        cameraChanged = true;
    }
    if (keys['Minus'] || keys['NumpadSubtract']) {
        spherical.radius = Math.min(50, spherical.radius + 0.3);
        cameraChanged = true;
    }

    // Apply camera changes
    if (cameraChanged) {
        const newPos = new THREE.Vector3().setFromSpherical(spherical);
        camera.position.copy(cameraTarget).add(newPos);
        camera.lookAt(cameraTarget);
    }

    // Rotate Earth
    earth.rotation.y += planetRotationSpeed * planetRotationDirection * delta;
    clouds.rotation.y += planetRotationSpeed * planetRotationDirection * delta * 1.05;
    atmosphere.rotation.y = earth.rotation.y;

    // Earth's axial tilt: 23.5 degrees = 0.41 radians
    const EARTH_TILT = 0.41;
    earth.rotation.x = EARTH_TILT;
    clouds.rotation.x = EARTH_TILT;
    atmosphere.rotation.x = EARTH_TILT;

    // Moon orbit around Earth
    moonOrbitAngle += MOON_ORBIT_SPEED * delta;
    moon.position.x = Math.cos(moonOrbitAngle) * MOON_ORBIT_RADIUS;
    moon.position.z = Math.sin(moonOrbitAngle) * MOON_ORBIT_RADIUS;
    moon.position.y = Math.sin(moonOrbitAngle * 0.5) * 0.5; // Slight orbital inclination

    // Moon rotation (tidally locked - same face always toward Earth)
    moon.rotation.y = -moonOrbitAngle + Math.PI;

    // Position moon light near the moon for visibility
    moonLight.position.copy(moon.position);

    // Ship orbit
    orbitAngle -= shipOrbitSpeed * shipOrbitDirection * delta;

    spaceShip.position.x = Math.cos(orbitAngle) * orbitRadius;
    spaceShip.position.z = Math.sin(orbitAngle) * orbitRadius;
    spaceShip.position.y = orbitY;

    // Ship orientation - face direction of travel
    const tangentX = Math.sin(orbitAngle) * shipOrbitDirection;
    const tangentZ = -Math.cos(orbitAngle) * shipOrbitDirection;

    const forward = new THREE.Vector3(
        spaceShip.position.x + tangentX,
        spaceShip.position.y,
        spaceShip.position.z + tangentZ
    );
    spaceShip.lookAt(forward);
    spaceShip.rotateY(Math.PI);

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

    // Update CubeCamera for canopy reflections (every few frames for performance)
    if (Math.floor(clock.getElapsedTime() * 10) % 3 === 0) {
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
    const enginePositions = ['top_left', 'top_right', 'bot_left', 'bot_right'];
    enginePositions.forEach(pos => {
        const flame = spaceShip.getObjectByName(`engine_flame_${pos}`);
        const outer = spaceShip.getObjectByName(`engine_outer_${pos}`);
        const core = spaceShip.getObjectByName(`engine_core_${pos}`);

        if (flame && outer) {
            // Flickering scale with multiple noise frequencies
            const flicker1 = Math.sin(flameTime * 25 + pos.length) * 0.15;
            const flicker2 = Math.sin(flameTime * 40 + pos.length * 2) * 0.08;
            const flicker3 = Math.sin(flameTime * 15) * 0.1;
            const baseScale = 1 + flicker1 + flicker2 + flicker3;

            flame.scale.set(0.35 * baseScale, 0.5 * (1 + flicker1 * 1.5), 1);
            outer.scale.set(0.5 * baseScale, 0.7 * (1 + flicker2 * 1.2), 1);

            // Slight position jitter
            const jitterZ = Math.sin(flameTime * 30 + pos.length * 3) * 0.02;
            flame.position.z = 1.85 + jitterZ;
            outer.position.z = 1.95 + jitterZ * 0.5;
        }

        if (core) {
            // Core brightness flicker
            const coreFlicker = 0.9 + Math.sin(flameTime * 50) * 0.1;
            core.material.opacity = coreFlicker;
        }
    });

    // === LASER BOLT ANIMATION ===
    for (let i = laserBolts.length - 1; i >= 0; i--) {
        const bolt = laserBolts[i];

        // Move bolt
        const movement = bolt.userData.velocity.clone().multiplyScalar(delta);
        bolt.position.add(movement);
        bolt.userData.distanceTraveled += movement.length();

        // Remove if traveled too far
        if (bolt.userData.distanceTraveled > LASER_MAX_DISTANCE) {
            scene.remove(bolt);
            laserBolts.splice(i, 1);
        }
    }

    // Subtle starfield rotation
    starfield.rotation.y += 0.00005;

    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

animate();
