// Space Scene - Three.js Frontend

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
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
scene.add(spaceShip);

// === GAME STATE ===
let gameLevel = 1; // 1-10, controls asteroid spawn rate
let earthHealth = 100;
let maxEarthHealth = 100;
let score = 0;
let gameActive = true;

// Level settings: asteroids in field at once (level 1 = just 1 asteroid)
const LEVEL_ASTEROID_COUNTS = [1, 2, 3, 5, 7, 10, 14, 18, 25, 35]; // Level 1-10

// Track destroyed asteroids for rewards
let asteroidsDestroyed = 0;
const AMMO_REWARD_PER_KILL = 5; // Gain ammo when destroying asteroids
const ANGEL_SPAWN_INTERVAL = 3; // Every 3 kills, spawn an angel asteroid

// === SOUND SYSTEM ===
let soundEnabled = true;
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Sound manager with synthesized sounds
const SoundManager = {
    playLaser() {
        if (!soundEnabled) return;

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Laser sound: quick descending frequency
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    },

    playExplosion(size = 1) {
        if (!soundEnabled) return;

        // White noise for explosion
        const bufferSize = audioContext.sampleRate * 0.5; // 0.5 second
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;

        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.5);

        const gainNode = audioContext.createGain();
        const volume = Math.min(0.2, 0.1 * size);
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        noise.start(audioContext.currentTime);
        noise.stop(audioContext.currentTime + 0.5);
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

// Asteroid spawn settings
const ASTEROID_SPAWN_MIN_DISTANCE = 120;
const ASTEROID_SPAWN_MAX_DISTANCE = 180;
const ASTEROID_MIN_SIZE = 0.5;
const ASTEROID_MAX_SIZE = 2.0;
const EARTH_RADIUS = 2; // For collision detection

// Speed scales with level: level 1 is very slow, level 10 is fast
function getAsteroidSpeed() {
    const baseMin = 1.0;  // Slow at level 1
    const baseMax = 2.0;
    const levelMultiplier = 0.5 + (gameLevel - 1) * 0.3; // 0.5x at L1, up to 3.2x at L10
    const min = baseMin * levelMultiplier;
    const max = baseMax * levelMultiplier;
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

// Create asteroid with rocky appearance
function createAsteroid() {
    const asteroidGroup = new THREE.Group();

    // Random size (affects health and damage)
    const size = ASTEROID_MIN_SIZE + Math.random() * (ASTEROID_MAX_SIZE - ASTEROID_MIN_SIZE);

    // Health based on size: bigger = more hits required
    // Health: small asteroids = 1 hit, medium = 2, large = 3 max
    const health = Math.ceil(size); // 1-3 hits based on size

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

    // Velocity: moves toward Earth (origin) with slight random offset
    const speed = getAsteroidSpeed();
    const targetOffset = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
    );
    const direction = targetOffset.sub(asteroidGroup.position).normalize();

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
    return asteroidGroup;
}

// Spawn asteroids to maintain level count
function spawnAsteroids() {
    if (!gameActive) return;

    const targetCount = LEVEL_ASTEROID_COUNTS[gameLevel - 1] || 3;

    while (asteroids.length < targetCount) {
        createAsteroid();
    }
}

// Create explosion effect (size-based)
function createExplosion(position, asteroidSize = 1) {
    // Play explosion sound
    SoundManager.playExplosion(asteroidSize);

    const explosionGroup = new THREE.Group();
    explosionGroup.position.copy(position);

    // Scale explosion based on asteroid size
    const scaleFactor = Math.max(0.5, asteroidSize);
    const particleCount = Math.floor(6 + asteroidSize * 4);

    // Multiple expanding spheres for explosion
    const colors = [0xff4400, 0xff8800, 0xffcc00, 0xffffff];
    for (let i = 0; i < particleCount; i++) {
        const size = (0.2 + Math.random() * 0.4) * scaleFactor;
        const geo = new THREE.SphereGeometry(size, 8, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: colors[Math.floor(Math.random() * colors.length)],
            transparent: true,
            opacity: 1
        });
        const sphere = new THREE.Mesh(geo, mat);

        // Random offset
        sphere.position.set(
            (Math.random() - 0.5) * scaleFactor,
            (Math.random() - 0.5) * scaleFactor,
            (Math.random() - 0.5) * scaleFactor
        );
        sphere.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 8 * scaleFactor,
            (Math.random() - 0.5) * 8 * scaleFactor,
            (Math.random() - 0.5) * 8 * scaleFactor
        );
        sphere.userData.initialScale = size;
        explosionGroup.add(sphere);
    }

    // Bright flash
    const flash = new THREE.PointLight(0xff8800, 3 * scaleFactor, 20 * scaleFactor);
    explosionGroup.add(flash);
    explosionGroup.userData.flash = flash;

    explosionGroup.userData.createdAt = Date.now();
    explosionGroup.userData.duration = 600 + asteroidSize * 200; // Bigger = longer explosion

    scene.add(explosionGroup);
    explosions.push(explosionGroup);
    return explosionGroup;
}

// Create dramatic hit spark when laser damages asteroid
function createHitSpark(position, asteroid) {
    const sparkGroup = new THREE.Group();
    sparkGroup.position.copy(position);

    // Lots of bright sparks flying outward
    const colors = [0xffff00, 0xff8800, 0xffffff, 0xff4400, 0xffcc00];
    for (let i = 0; i < 20; i++) {
        const size = 0.1 + Math.random() * 0.25;
        const geo = new THREE.SphereGeometry(size, 6, 6);
        const mat = new THREE.MeshBasicMaterial({
            color: colors[Math.floor(Math.random() * colors.length)],
            transparent: true,
            opacity: 1
        });
        const spark = new THREE.Mesh(geo, mat);
        spark.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 25,
            (Math.random() - 0.5) * 25,
            (Math.random() - 0.5) * 25
        );
        spark.userData.initialScale = size;
        sparkGroup.add(spark);
    }

    // Add debris chunks
    for (let i = 0; i < 5; i++) {
        const chunkSize = 0.15 + Math.random() * 0.2;
        const chunkGeo = new THREE.TetrahedronGeometry(chunkSize);
        const chunkMat = new THREE.MeshBasicMaterial({
            color: 0x6b5b4d,
            transparent: true,
            opacity: 1
        });
        const chunk = new THREE.Mesh(chunkGeo, chunkMat);
        chunk.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 15
        );
        chunk.userData.initialScale = chunkSize;
        chunk.userData.rotationSpeed = new THREE.Vector3(
            Math.random() * 5,
            Math.random() * 5,
            Math.random() * 5
        );
        sparkGroup.add(chunk);
    }

    // Bright flash at impact point
    const flash = new THREE.PointLight(0xffaa00, 5, 15);
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

// Special explosion for angel asteroid
function createAngelExplosion(position) {
    // Play explosion sound (medium size)
    SoundManager.playExplosion(1.5);

    const explosionGroup = new THREE.Group();
    explosionGroup.position.copy(position);

    // Bright healing particles
    const colors = [0x88ffaa, 0xffffff, 0xaaffcc, 0xffdd88];
    for (let i = 0; i < 30; i++) {
        const size = 0.2 + Math.random() * 0.4;
        const geo = new THREE.SphereGeometry(size, 8, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: colors[Math.floor(Math.random() * colors.length)],
            transparent: true,
            opacity: 1
        });
        const sphere = new THREE.Mesh(geo, mat);
        sphere.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 12
        );
        sphere.userData.initialScale = size;
        explosionGroup.add(sphere);
    }

    // Bright healing flash
    const flash = new THREE.PointLight(0x88ffaa, 8, 30);
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

// Update score display
function updateScoreDisplay() {
    const scoreEl = document.getElementById('scoreValue');
    if (scoreEl) {
        scoreEl.textContent = score;
    }
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

// Restart game
function restartGame() {
    // Reset state
    earthHealth = maxEarthHealth;
    score = 0;
    laserAmmo = 1000;
    asteroidsDestroyed = 0;
    gameActive = true;

    // Clear all asteroids
    asteroids.forEach(a => scene.remove(a));
    asteroids.length = 0;

    // Update displays
    updateHealthDisplay();
    updateScoreDisplay();
    updateAmmoDisplay();
    updateKillCountDisplay();
}

// Targeting HUD: shows crosshairs over asteroids
function updateTargetingHUD() {
    let hudContainer = document.getElementById('targetingHUD');
    if (!hudContainer) {
        hudContainer = document.createElement('div');
        hudContainer.id = 'targetingHUD';
        hudContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 100;
        `;
        document.body.appendChild(hudContainer);
    }

    // Clear previous markers
    hudContainer.innerHTML = '';

    // Add alignment line from ship
    const alignmentLine = document.getElementById('alignmentLine') || createAlignmentLine();

    // Get ship's forward direction
    const shipDirection = new THREE.Vector3(0, 0, -1);
    shipDirection.applyQuaternion(spaceShip.quaternion);

    // Update alignment line (dotted line showing where ship is aiming)
    updateAlignmentLine(shipDirection);

    // Project each asteroid to screen space
    asteroids.forEach((asteroid, index) => {
        const screenPos = projectToScreen(asteroid.position);

        if (screenPos.z < 1 && screenPos.x > -50 && screenPos.x < window.innerWidth + 50 &&
            screenPos.y > -50 && screenPos.y < window.innerHeight + 50) {

            // Calculate apparent size based on distance
            const distance = camera.position.distanceTo(asteroid.position);
            const baseSize = 40 + asteroid.userData.size * 20;
            const size = Math.max(20, Math.min(100, baseSize * (50 / distance)));

            // Check if asteroid is aligned with ship direction
            const toAsteroid = asteroid.position.clone().sub(spaceShip.position).normalize();
            const alignment = shipDirection.dot(toAsteroid);
            const isAligned = alignment > 0.98; // Within ~11 degrees

            // Create targeting reticle
            const reticle = document.createElement('div');
            reticle.style.cssText = `
                position: absolute;
                left: ${screenPos.x - size/2}px;
                top: ${screenPos.y - size/2}px;
                width: ${size}px;
                height: ${size}px;
                border: 2px solid ${isAligned ? '#ff4444' : '#44aaff'};
                border-radius: 50%;
                box-shadow: 0 0 10px ${isAligned ? '#ff4444' : '#44aaff'};
            `;

            // Crosshair lines
            const crosshair = document.createElement('div');
            crosshair.innerHTML = `
                <div style="position:absolute;left:50%;top:0;width:2px;height:30%;background:${isAligned ? '#ff4444' : '#44aaff'};transform:translateX(-50%);"></div>
                <div style="position:absolute;left:50%;bottom:0;width:2px;height:30%;background:${isAligned ? '#ff4444' : '#44aaff'};transform:translateX(-50%);"></div>
                <div style="position:absolute;top:50%;left:0;width:30%;height:2px;background:${isAligned ? '#ff4444' : '#44aaff'};transform:translateY(-50%);"></div>
                <div style="position:absolute;top:50%;right:0;width:30%;height:2px;background:${isAligned ? '#ff4444' : '#44aaff'};transform:translateY(-50%);"></div>
            `;
            crosshair.style.cssText = `position:absolute;width:100%;height:100%;`;
            reticle.appendChild(crosshair);

            // Health indicator (for multi-hit asteroids)
            if (asteroid.userData.maxHealth > 1) {
                const healthPct = (asteroid.userData.health / asteroid.userData.maxHealth) * 100;
                const healthIndicator = document.createElement('div');
                healthIndicator.style.cssText = `
                    position: absolute;
                    bottom: -12px;
                    left: 10%;
                    width: 80%;
                    height: 4px;
                    background: rgba(0,0,0,0.5);
                    border-radius: 2px;
                `;
                healthIndicator.innerHTML = `<div style="width:${healthPct}%;height:100%;background:#ff4444;border-radius:2px;"></div>`;
                reticle.appendChild(healthIndicator);
            }

            // Distance indicator
            const distLabel = document.createElement('div');
            distLabel.style.cssText = `
                position: absolute;
                top: -18px;
                left: 50%;
                transform: translateX(-50%);
                font-family: 'Courier New', monospace;
                font-size: 10px;
                color: ${isAligned ? '#ff4444' : '#44aaff'};
                text-shadow: 0 0 5px ${isAligned ? '#ff0000' : '#0088ff'};
            `;
            distLabel.textContent = Math.round(distance) + 'm';
            reticle.appendChild(distLabel);

            hudContainer.appendChild(reticle);
        }
    });
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

    // Only show if ship is on screen
    if (shipScreen.z < 1 && farScreen.z < 1) {
        aimLine.setAttribute('x1', shipScreen.x);
        aimLine.setAttribute('y1', shipScreen.y);
        aimLine.setAttribute('x2', farScreen.x);
        aimLine.setAttribute('y2', farScreen.y);
        aimLine.style.opacity = '0.6';
    } else {
        aimLine.style.opacity = '0';
    }
}

function fireLasers() {
    // Check ammo and game state
    if (laserAmmo <= 0 || !gameActive) return;

    // Play laser sound
    SoundManager.playLaser();

    // Get ship's forward direction (negative Z in local space)
    const shipDirection = new THREE.Vector3(0, 0, -1);
    shipDirection.applyQuaternion(spaceShip.quaternion);

    // Cannon positions (2 weapon pods on sides)
    const cannonOffsets = [
        { x: -0.9, y: -0.15 },  // Left cannon
        { x: 0.9, y: -0.15 }    // Right cannon
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
        const localPos = new THREE.Vector3(offset.x, offset.y, -3.5);
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

    // Decrement ammo (one shot = 2 bolts from 2 cannons)
    laserAmmo--;
    updateAmmoDisplay();
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
let orbitRadius = 4.5;
let orbitPerigee = 4.5;  // Closest point (can be adjusted)
let orbitApogee = 4.5;   // Farthest point (same as perigee = circular)
let orbitInclination = 0; // Degrees of orbital tilt

// Control mode: 'camera' or 'ship'
let controlMode = 'ship'; // Start in ship mode for gameplay
const orbitY = 1.5;

// Ship starts already partway through entry for immediate action
let shipPhase = 'orbit'; // Start directly in orbit for smooth experience
let orbitAngle = Math.PI * 1.5; // Starting angle

// Ship orientation (pitch, yaw, roll offsets)
let shipPitch = 0;  // Vertical aim (up/down)
let shipYaw = 0;    // Horizontal aim (left/right)
let shipRoll = 0;   // Roll (banking)

// Ship control input state
const shipInput = {
    pitchUp: false,
    pitchDown: false,
    yawLeft: false,
    yawRight: false
};
const SHIP_ROTATION_SPEED = 1.5; // Radians per second

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

    // Make laser button standalone and always visible
    laserDiv.appendChild(laserBtn);
    laserDiv.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        z-index: 1000;
    `;
    document.body.appendChild(laserDiv);

    // === MODE TOGGLE (Camera/Ship) - Single toggle button ===
    const modeToggleBtn = document.createElement('button');
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

    function updateModeToggle() {
        if (controlMode === 'camera') {
            // In camera mode, button shows "SHIP" (tap to switch to ship)
            modeToggleBtn.textContent = 'SHIP';
            shipControlPad.style.display = 'none';
        } else {
            // In ship mode, button shows "CAM" (tap to switch to camera)
            modeToggleBtn.textContent = 'CAM';
            shipControlPad.style.display = 'flex';
        }
    }

    modeToggleBtn.addEventListener('click', () => {
        // Toggle between modes
        controlMode = controlMode === 'camera' ? 'ship' : 'camera';
        updateModeToggle();
    });

    // Touch feedback
    modeToggleBtn.addEventListener('touchstart', () => {
        modeToggleBtn.style.transform = 'scale(0.95)';
    });
    modeToggleBtn.addEventListener('touchend', () => {
        modeToggleBtn.style.transform = 'scale(1)';
    });

    document.body.appendChild(modeToggleBtn);

    // === HAMBURGER MENU FOR SETTINGS ===
    const hamburgerBtn = document.createElement('button');
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

    // Settings panel (hidden by default)
    const settingsPanel = document.createElement('div');
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

    // Sound toggle in settings
    const soundSetting = document.createElement('div');
    soundSetting.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const soundIcon = document.createElement('div');
    soundIcon.textContent = '🔊';
    soundIcon.style.cssText = 'font-size: 16px;';

    const soundLabel = document.createElement('div');
    soundLabel.textContent = 'Sound';
    soundLabel.style.cssText = 'color: #fff; font-family: monospace; font-size: 12px;';

    const soundToggleBtn = document.createElement('button');
    soundToggleBtn.textContent = 'OFF'; // Start with sound ON, so button shows "OFF" (what you'll switch to)
    soundToggleBtn.style.cssText = `
        padding: 8px 16px;
        border: 2px solid #44ff88;
        border-radius: 6px;
        background: #44ff88;
        color: #000;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        font-weight: bold;
        transition: all 0.2s;
        min-width: 60px;
    `;

    function updateSoundToggle() {
        if (soundEnabled) {
            // Sound is ON, button shows "OFF" (tap to turn off)
            soundToggleBtn.textContent = 'OFF';
        } else {
            // Sound is OFF, button shows "ON" (tap to turn on)
            soundToggleBtn.textContent = 'ON';
        }
    }

    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        updateSoundToggle();
    });

    soundSetting.appendChild(soundIcon);
    soundSetting.appendChild(soundLabel);
    soundSetting.appendChild(soundToggleBtn);
    settingsPanel.appendChild(soundSetting);

    // === ORBIT CONTROLS IN SETTINGS ===
    // Planet rotation control
    const planetSetting = document.createElement('div');
    planetSetting.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-top: 1px solid #444;';

    const planetHeader = document.createElement('div');
    planetHeader.style.cssText = 'color: #fff; font-family: monospace; font-size: 11px; opacity: 0.8;';
    planetHeader.textContent = '🌍 PLANET ROTATION';
    planetSetting.appendChild(planetHeader);

    const planetSlider = document.createElement('input');
    planetSlider.type = 'range';
    planetSlider.min = '-100';
    planetSlider.max = '100';
    planetSlider.value = '25';
    planetSlider.style.cssText = 'width: 100%; cursor: pointer;';
    planetSetting.appendChild(planetSlider);

    const planetValue = document.createElement('div');
    planetValue.style.cssText = 'font-size: 9px; color: #888; text-align: center;';
    planetValue.textContent = 'CW 0.12';
    planetSetting.appendChild(planetValue);
    settingsPanel.appendChild(planetSetting);

    // Moon orbit control
    const moonSetting = document.createElement('div');
    moonSetting.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-top: 1px solid #444;';

    const moonHeader = document.createElement('div');
    moonHeader.style.cssText = 'color: #fff; font-family: monospace; font-size: 11px; opacity: 0.8;';
    moonHeader.textContent = '🌙 MOON ORBIT';
    moonSetting.appendChild(moonHeader);

    const moonSlider = document.createElement('input');
    moonSlider.type = 'range';
    moonSlider.min = '-100';
    moonSlider.max = '100';
    moonSlider.value = '30';
    moonSlider.style.cssText = 'width: 100%; cursor: pointer;';
    moonSetting.appendChild(moonSlider);

    const moonValue = document.createElement('div');
    moonValue.style.cssText = 'font-size: 9px; color: #888; text-align: center;';
    moonValue.textContent = 'CW 0.15';
    moonSetting.appendChild(moonValue);
    settingsPanel.appendChild(moonSetting);

    // Ship orbit control
    const shipOrbitSetting = document.createElement('div');
    shipOrbitSetting.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-top: 1px solid #444;';

    const shipHeader = document.createElement('div');
    shipHeader.style.cssText = 'color: #fff; font-family: monospace; font-size: 11px; opacity: 0.8;';
    shipHeader.textContent = '🚀 SHIP ORBIT';
    shipOrbitSetting.appendChild(shipHeader);

    const shipOrbitSlider = document.createElement('input');
    shipOrbitSlider.type = 'range';
    shipOrbitSlider.min = '-100';
    shipOrbitSlider.max = '100';
    shipOrbitSlider.value = '50';
    shipOrbitSlider.style.cssText = 'width: 100%; cursor: pointer;';
    shipOrbitSetting.appendChild(shipOrbitSlider);

    const shipOrbitValue = document.createElement('div');
    shipOrbitValue.style.cssText = 'font-size: 9px; color: #888; text-align: center;';
    shipOrbitValue.textContent = 'CW 0.25';
    shipOrbitSetting.appendChild(shipOrbitValue);
    settingsPanel.appendChild(shipOrbitSetting);

    // Event handlers for orbit controls
    planetSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        planetRotationSpeed = Math.abs(val) / 400;
        planetRotationDirection = val >= 0 ? 1 : -1;
        const dir = val === 0 ? 'STOP' : (val > 0 ? 'CW' : 'CCW');
        planetValue.textContent = `${dir} ${planetRotationSpeed.toFixed(2)}`;
    });

    moonSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        moonOrbitSpeed = Math.abs(val) / 200;
        moonOrbitDirection = val >= 0 ? 1 : -1;
        const dir = val === 0 ? 'STOP' : (val > 0 ? 'CW' : 'CCW');
        moonValue.textContent = `${dir} ${moonOrbitSpeed.toFixed(2)}`;
    });

    shipOrbitSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        shipOrbitSpeed = Math.abs(val) / 200;
        shipOrbitDirection = val >= 0 ? 1 : -1;
        const dir = val === 0 ? 'STOP' : (val > 0 ? 'CW' : 'CCW');
        shipOrbitValue.textContent = `${dir} ${shipOrbitSpeed.toFixed(2)}`;
    });

    // Toggle settings panel
    let settingsPanelOpen = false;
    hamburgerBtn.addEventListener('click', () => {
        settingsPanelOpen = !settingsPanelOpen;
        settingsPanel.style.display = settingsPanelOpen ? 'flex' : 'none';
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (settingsPanelOpen && !settingsPanel.contains(e.target) && !hamburgerBtn.contains(e.target)) {
            settingsPanelOpen = false;
            settingsPanel.style.display = 'none';
        }
    });

    document.body.appendChild(settingsPanel);
    document.body.appendChild(hamburgerBtn);

    // === SHIP CONTROL PAD (D-pad style) ===
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

        // Mouse events
        btn.addEventListener('mousedown', activate);
        btn.addEventListener('mouseup', deactivate);
        btn.addEventListener('mouseleave', deactivate);

        // Touch events
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            activate();
        });
        btn.addEventListener('touchend', deactivate);
        btn.addEventListener('touchcancel', deactivate);

        return btn;
    };

    const upBtn = createDpadButton('pitchUp', '&#9650;'); // ▲
    const downBtn = createDpadButton('pitchDown', '&#9660;'); // ▼
    const leftBtn = createDpadButton('yawLeft', '&#9664;'); // ◀
    const rightBtn = createDpadButton('yawRight', '&#9654;'); // ▶

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

    // === KEYBOARD CONTROLS FOR SHIP ===
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

    // Initialize mode toggle state
    setTimeout(updateModeToggle, 0);

    // === GAME STATUS PANEL (top left) ===
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
    `;

    // Level selector - more compact
    const levelDiv = document.createElement('div');
    levelDiv.innerHTML = '<div style="font-size: 9px; letter-spacing: 1px; margin-bottom: 4px; opacity: 0.8;">LVL</div>';

    const levelRow = document.createElement('div');
    levelRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const levelSlider = document.createElement('input');
    levelSlider.type = 'range';
    levelSlider.min = '1';
    levelSlider.max = '10';
    levelSlider.value = '1';
    levelSlider.style.cssText = 'flex: 1;';
    levelSlider.addEventListener('input', (e) => {
        gameLevel = parseInt(e.target.value);
        levelValue.textContent = gameLevel;
        updateLevelDisplay();
    });

    const levelValue = document.createElement('div');
    levelValue.id = 'levelValue';
    levelValue.textContent = '1';
    levelValue.style.cssText = 'font-size: 18px; font-weight: bold; color: #44aaff; text-shadow: 0 0 10px #44aaff; min-width: 24px; text-align: center;';

    levelRow.appendChild(levelSlider);
    levelRow.appendChild(levelValue);
    levelDiv.appendChild(levelRow);
    gamePanel.appendChild(levelDiv);

    // Earth health bar - more compact
    const healthDiv = document.createElement('div');
    healthDiv.innerHTML = '<div style="font-size: 8px; letter-spacing: 1px; opacity: 0.6; margin-bottom: 3px;">HEALTH</div>';

    const healthBarContainer = document.createElement('div');
    healthBarContainer.style.cssText = `
        width: 100%;
        height: 14px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 7px;
        overflow: hidden;
        border: 1px solid #44ff88;
    `;

    const healthBar = document.createElement('div');
    healthBar.id = 'healthBar';
    healthBar.style.cssText = `
        width: 100%;
        height: 100%;
        background: #44ff88;
        transition: width 0.3s, background 0.3s;
    `;
    healthBarContainer.appendChild(healthBar);

    const healthText = document.createElement('div');
    healthText.id = 'healthText';
    healthText.textContent = '100';
    healthText.style.cssText = 'font-size: 11px; text-align: center; margin-top: 2px; color: #44ff88;';

    healthDiv.appendChild(healthBarContainer);
    healthDiv.appendChild(healthText);
    gamePanel.appendChild(healthDiv);

    // Stats row - score/threats/kills/ammo in compact format
    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px; padding-top: 6px; border-top: 1px solid rgba(68, 170, 255, 0.3); font-size: 9px;';

    statsRow.innerHTML = `
        <div style="text-align: center;">
            <div style="opacity: 0.6; font-size: 7px; letter-spacing: 1px;">SCORE</div>
            <div id="scoreValue" style="font-size: 12px; font-weight: bold; color: #ffaa00; text-shadow: 0 0 8px #ffaa00;">0</div>
        </div>
        <div style="text-align: center;">
            <div style="opacity: 0.6; font-size: 7px; letter-spacing: 1px;">THREATS</div>
            <div id="asteroidCount" style="font-size: 12px; font-weight: bold; color: #ff4444;">0</div>
        </div>
        <div style="text-align: center;">
            <div style="opacity: 0.6; font-size: 7px; letter-spacing: 1px;">KILLS</div>
            <div id="killCount" style="font-size: 12px; font-weight: bold; color: #88ff44; text-shadow: 0 0 8px #88ff44;">0</div>
        </div>
        <div style="text-align: center;">
            <div style="opacity: 0.6; font-size: 7px; letter-spacing: 1px;">AMMO</div>
            <div id="ammoCount" style="font-size: 12px; font-weight: bold; color: #44aaff; text-shadow: 0 0 8px #44aaff;">1000</div>
        </div>
    `;
    gamePanel.appendChild(statsRow);

    document.body.appendChild(gamePanel);

    // Slider styling and threat animation
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

    // Single pointer drag
    if (pointerState.prevSingle) {
        if (controlMode === 'ship') {
            // Ship mode: drag to aim the ship
            const aimSensitivity = 0.005;
            shipYaw -= deltaX * aimSensitivity;
            shipPitch -= deltaY * aimSensitivity;
            // Clamp pitch
            shipPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, shipPitch));
        } else {
            // Camera mode: orbit around scene
            const spherical = new THREE.Spherical().setFromVector3(
                camera.position.clone().sub(cameraTarget)
            );
            spherical.theta -= deltaX * rotationSpeed;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - deltaY * rotationSpeed));

            const newPos = new THREE.Vector3().setFromSpherical(spherical);
            camera.position.copy(cameraTarget).add(newPos);
            camera.lookAt(cameraTarget);
        }
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

    // One finger: Ship aim or Camera orbit depending on mode
    if (touches.length === 1 && touchState.prevPosition) {
        const deltaX = touches[0].clientX - touchState.prevPosition.x;
        const deltaY = touches[0].clientY - touchState.prevPosition.y;

        if (controlMode === 'ship') {
            // Ship mode: drag to aim the ship
            const aimSensitivity = 0.005;
            shipYaw -= deltaX * aimSensitivity;
            shipPitch -= deltaY * aimSensitivity;
            // Clamp pitch
            shipPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, shipPitch));
        } else {
            // Camera mode: orbit around scene
            const spherical = new THREE.Spherical().setFromVector3(
                camera.position.clone().sub(cameraTarget)
            );
            spherical.theta -= deltaX * rotationSpeed;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - deltaY * rotationSpeed));

            const newPos = new THREE.Vector3().setFromSpherical(spherical);
            camera.position.copy(cameraTarget).add(newPos);
            camera.lookAt(cameraTarget);
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
    const sunDir = SUN_POSITION.clone().normalize();
    const moonDir = moon.position.clone().normalize();
    // Dot product: -1 means moon is directly behind Earth from sun's view
    const sunMoonDot = sunDir.dot(moonDir);

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

    // Ship orbit with elliptical path and inclination
    orbitAngle -= shipOrbitSpeed * shipOrbitDirection * delta;

    // Calculate elliptical orbit radius based on perigee and apogee
    // Using simplified ellipse: r = (perigee + apogee) / 2 + (apogee - perigee) / 2 * cos(angle)
    const semiMajor = (orbitPerigee + orbitApogee) / 2;
    const eccentricityOffset = (orbitApogee - orbitPerigee) / 2;
    const currentRadius = semiMajor + eccentricityOffset * Math.cos(orbitAngle);

    // Apply orbital inclination (tilt the orbital plane)
    const incRad = orbitInclination * Math.PI / 180;
    const flatX = Math.cos(orbitAngle) * currentRadius;
    const flatZ = Math.sin(orbitAngle) * currentRadius;

    // Rotate orbital plane around X axis for inclination
    spaceShip.position.x = flatX;
    spaceShip.position.z = flatZ * Math.cos(incRad);
    spaceShip.position.y = orbitY + flatZ * Math.sin(incRad);

    // Ship orientation - face direction of travel
    const tangentX = Math.sin(orbitAngle) * shipOrbitDirection;
    const tangentZ = -Math.cos(orbitAngle) * shipOrbitDirection * Math.cos(incRad);
    const tangentY = -Math.cos(orbitAngle) * shipOrbitDirection * Math.sin(incRad);

    const forward = new THREE.Vector3(
        spaceShip.position.x + tangentX,
        spaceShip.position.y + tangentY,
        spaceShip.position.z + tangentZ
    );
    spaceShip.lookAt(forward);
    spaceShip.rotateY(Math.PI);

    // Update ship rotation from input (only in ship mode)
    if (controlMode === 'ship') {
        if (shipInput.pitchUp) shipPitch -= SHIP_ROTATION_SPEED * delta;
        if (shipInput.pitchDown) shipPitch += SHIP_ROTATION_SPEED * delta;
        if (shipInput.yawLeft) shipYaw -= SHIP_ROTATION_SPEED * delta;
        if (shipInput.yawRight) shipYaw += SHIP_ROTATION_SPEED * delta;

        // Clamp pitch to prevent flipping
        shipPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, shipPitch));
    }

    // Apply custom pitch, yaw, roll orientation offsets
    spaceShip.rotateY(shipYaw);
    spaceShip.rotateX(shipPitch);
    spaceShip.rotateZ(shipRoll);

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
    const engineNames = ['top', 'bot_left', 'bot_right'];
    engineNames.forEach((pos, idx) => {
        const flame = spaceShip.getObjectByName(`engine_flame_${pos}`);
        const outer = spaceShip.getObjectByName(`engine_outer_${pos}`);
        const core = spaceShip.getObjectByName(`engine_core_${pos}`);

        if (flame && outer) {
            // Flickering scale with multiple noise frequencies
            const flicker1 = Math.sin(flameTime * 25 + idx * 2) * 0.15;
            const flicker2 = Math.sin(flameTime * 40 + idx * 3) * 0.08;
            const flicker3 = Math.sin(flameTime * 15) * 0.1;
            const baseScale = 1 + flicker1 + flicker2 + flicker3;

            flame.scale.set(0.6 * baseScale, 1.2 * (1 + flicker1 * 1.5), 1);
            outer.scale.set(0.9 * baseScale, 1.6 * (1 + flicker2 * 1.2), 1);

            // Slight position jitter
            const jitterZ = Math.sin(flameTime * 30 + idx * 4) * 0.03;
            flame.position.z = 3.6 + jitterZ;
            outer.position.z = 3.8 + jitterZ * 0.5;
        }

        if (core) {
            // Core brightness flicker
            const coreFlicker = 0.9 + Math.sin(flameTime * 50 + idx) * 0.1;
            core.material.opacity = coreFlicker;
        }
    });

    // === ASTEROID MOVEMENT & ANIMATION ===
    for (let i = asteroids.length - 1; i >= 0; i--) {
        const asteroid = asteroids[i];

        // Move asteroid toward Earth
        const movement = asteroid.userData.velocity.clone().multiplyScalar(delta);
        asteroid.position.add(movement);

        // Rotate asteroid
        const rotSpeed = asteroid.userData.rotationSpeed;
        asteroid.rotation.x += rotSpeed.x * delta;
        asteroid.rotation.y += rotSpeed.y * delta;
        asteroid.rotation.z += rotSpeed.z * delta;

        // Make health bar always face camera (billboard effect)
        if (asteroid.userData.healthBar) {
            asteroid.userData.healthBar.quaternion.copy(camera.quaternion);
        }

        // Check collision with Earth
        const distanceToEarth = asteroid.position.length();
        const hitRadius = EARTH_RADIUS + asteroid.userData.size * 0.5;

        if (distanceToEarth < hitRadius) {
            // Asteroid hit Earth!
            const damage = Math.ceil(asteroid.userData.size * 5); // Bigger = more damage
            earthHealth -= damage;
            updateHealthDisplay();

            // Create explosion at impact point
            createExplosion(asteroid.position.clone(), asteroid.userData.size);

            // Remove asteroid
            scene.remove(asteroid);
            asteroids.splice(i, 1);

            // Check game over
            if (earthHealth <= 0) {
                earthHealth = 0;
                gameActive = false;
                showGameOver();
            }
        }
    }

    // === LASER BOLT ANIMATION & COLLISION DETECTION ===
    for (let i = laserBolts.length - 1; i >= 0; i--) {
        const bolt = laserBolts[i];

        // Move bolt
        const movement = bolt.userData.velocity.clone().multiplyScalar(delta);
        bolt.position.add(movement);
        bolt.userData.distanceTraveled += movement.length();

        // Check collision with asteroids
        let hitAsteroid = false;
        for (let j = asteroids.length - 1; j >= 0; j--) {
            const asteroid = asteroids[j];
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

                // Show/update health bar on asteroid
                if (!asteroid.userData.healthBar) {
                    // Create health bar - much larger and more visible
                    const healthBarGroup = new THREE.Group();

                    // Background (black/dark for contrast)
                    const bgGeo = new THREE.PlaneGeometry(asteroid.userData.size * 3, 0.8);
                    const bgMat = new THREE.MeshBasicMaterial({
                        color: 0x000000,
                        transparent: true,
                        opacity: 0.7,
                        side: THREE.DoubleSide
                    });
                    const bg = new THREE.Mesh(bgGeo, bgMat);
                    healthBarGroup.add(bg);

                    // Red background bar
                    const redGeo = new THREE.PlaneGeometry(asteroid.userData.size * 3, 0.6);
                    const redMat = new THREE.MeshBasicMaterial({
                        color: 0xff0000,
                        transparent: true,
                        opacity: 0.8,
                        side: THREE.DoubleSide
                    });
                    const redBar = new THREE.Mesh(redGeo, redMat);
                    redBar.position.z = 0.01;
                    healthBarGroup.add(redBar);

                    // Health fill (green)
                    const fillGeo = new THREE.PlaneGeometry(asteroid.userData.size * 3, 0.6);
                    const fillMat = new THREE.MeshBasicMaterial({
                        color: 0x00ff00,
                        transparent: true,
                        opacity: 0.9,
                        side: THREE.DoubleSide
                    });
                    const fill = new THREE.Mesh(fillGeo, fillMat);
                    fill.position.z = 0.02; // In front of red bar
                    healthBarGroup.add(fill);

                    healthBarGroup.position.y = asteroid.userData.size + 1.5; // Higher above asteroid
                    asteroid.add(healthBarGroup);
                    asteroid.userData.healthBar = healthBarGroup;
                    asteroid.userData.healthFill = fill;
                    asteroid.userData.maxHealth = asteroid.userData.health + 1; // Store max health
                }

                // Update health bar fill
                const healthPct = asteroid.userData.health / asteroid.userData.maxHealth;
                asteroid.userData.healthFill.scale.x = Math.max(0, healthPct);
                asteroid.userData.healthFill.position.x = -(asteroid.userData.size * 1.5 * (1 - healthPct));

                // Color based on health
                if (healthPct > 0.5) {
                    asteroid.userData.healthFill.material.color.setHex(0x00ff00); // Green
                } else if (healthPct > 0.25) {
                    asteroid.userData.healthFill.material.color.setHex(0xffaa00); // Orange
                } else {
                    asteroid.userData.healthFill.material.color.setHex(0xff0000); // Red
                }

                // Dramatic hit effect with asteroid feedback
                createHitSpark(bolt.position.clone(), asteroid);

                if (asteroid.userData.health <= 0) {
                    // Check if this is an angel asteroid
                    if (asteroid.userData.isAngel) {
                        // Angel destroyed - restore health!
                        earthHealth = Math.min(maxEarthHealth, earthHealth + 25);
                        updateHealthDisplay();
                        createAngelExplosion(asteroid.position.clone());
                    } else {
                        // Regular asteroid destroyed!
                        score += Math.ceil(asteroid.userData.size * 10);
                        updateScoreDisplay();

                        // Reward: gain ammo
                        laserAmmo += AMMO_REWARD_PER_KILL;
                        updateAmmoDisplay();

                        // Track kills
                        asteroidsDestroyed++;
                        updateKillCountDisplay();

                        // Every 3 kills, spawn an angel asteroid
                        if (asteroidsDestroyed % ANGEL_SPAWN_INTERVAL === 0) {
                            spawnAngelAsteroid();
                        }

                        // Create explosion at asteroid position (size-based)
                        createExplosion(asteroid.position.clone(), asteroid.userData.size);
                    }

                    // Remove asteroid
                    scene.remove(asteroid);
                    asteroids.splice(j, 1);
                }

                // Remove bolt
                scene.remove(bolt);
                laserBolts.splice(i, 1);
                hitAsteroid = true;
                break;
            }
        }

        // Remove if traveled too far (and didn't hit anything)
        if (!hitAsteroid && bolt.userData.distanceTraveled > LASER_MAX_DISTANCE) {
            scene.remove(bolt);
            laserBolts.splice(i, 1);
        }
    }

    // === SPAWN ASTEROIDS ===
    spawnAsteroids();

    // Update asteroid count display
    const asteroidCountEl = document.getElementById('asteroidCount');
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

    // === EXPLOSION ANIMATION ===
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];
        const age = Date.now() - explosion.userData.createdAt;
        const progress = age / explosion.userData.duration;

        if (progress >= 1) {
            // Remove explosion
            scene.remove(explosion);
            explosions.splice(i, 1);
        } else {
            // Animate explosion particles
            explosion.children.forEach(child => {
                if (child.userData.velocity) {
                    child.position.add(child.userData.velocity.clone().multiplyScalar(delta));
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

    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

animate();
