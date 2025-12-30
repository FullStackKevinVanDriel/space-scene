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

// Create glowing sun
function createSun() {
    const sunGroup = new THREE.Group();

    // Core - bright hot center
    const coreGeom = new THREE.SphereGeometry(3, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0xfffef0
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    sunGroup.add(core);

    // Inner glow layer
    const glow1Geom = new THREE.SphereGeometry(3.5, 32, 32);
    const glow1Mat = new THREE.MeshBasicMaterial({
        color: 0xffee88,
        transparent: true,
        opacity: 0.6,
        side: THREE.BackSide
    });
    const glow1 = new THREE.Mesh(glow1Geom, glow1Mat);
    sunGroup.add(glow1);

    // Outer glow layer
    const glow2Geom = new THREE.SphereGeometry(5, 32, 32);
    const glow2Mat = new THREE.MeshBasicMaterial({
        color: 0xffdd44,
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide
    });
    const glow2 = new THREE.Mesh(glow2Geom, glow2Mat);
    sunGroup.add(glow2);

    // Corona - largest, faintest glow
    const coronaGeom = new THREE.SphereGeometry(8, 32, 32);
    const coronaMat = new THREE.MeshBasicMaterial({
        color: 0xffcc22,
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide
    });
    const corona = new THREE.Mesh(coronaGeom, coronaMat);
    sunGroup.add(corona);

    // Point light at sun for additional glow effect
    const sunLight = new THREE.PointLight(0xffffee, 1, 200);
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
const totalTextures = 5;

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

// Starfield
function createStarfield() {
    const starCount = 3000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 300;
        positions[i + 1] = (Math.random() - 0.5) * 300;
        positions[i + 2] = (Math.random() - 0.5) * 300;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, sizeAttenuation: true });
    const starfield = new THREE.Points(geometry, material);
    scene.add(starfield);
    return starfield;
}

const starfield = createStarfield();

// === SPACESHIP - Sleek sci-fi fighter design ===
function createSpaceShip() {
    const ship = new THREE.Group();

    // Materials - lighter hull colors for better visibility
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.7, roughness: 0.3 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x0aa8ff, emissive: 0x003355, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.1 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x666677, metalness: 0.8, roughness: 0.2 });
    const interiorMat = new THREE.MeshStandardMaterial({ color: 0x333340, metalness: 0.3, roughness: 0.6 });

    // Organic fuselage using LatheGeometry for a photographed, crafted look
    const profile = [];
    // profile from nose to rear (x: radius, y: length)
    profile.push(new THREE.Vector2(0.02, -2.8));
    profile.push(new THREE.Vector2(0.18, -2.6));
    profile.push(new THREE.Vector2(0.26, -1.8));
    profile.push(new THREE.Vector2(0.38, -0.6));
    profile.push(new THREE.Vector2(0.44, 0.25));
    profile.push(new THREE.Vector2(0.40, 1.2));
    profile.push(new THREE.Vector2(0.28, 1.8));
    profile.push(new THREE.Vector2(0.18, 2.0));
    const lathe = new THREE.LatheGeometry(profile, 64);
    const fuselage = new THREE.Mesh(lathe, hullMat);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.position.z = -0.8;
    fuselage.castShadow = true;
    fuselage.receiveShadow = true;
    ship.add(fuselage);

    // Sculpted nose cap blended onto lathe profile (slightly glossy)
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 20), hullMat);
    nose.scale.set(1.0, 0.8, 1.0);
    nose.position.z = -3.0;
    ship.add(nose);

    // Add subtle panel seams: thin strips slightly above hull
    function addPanelStrip(offsetZ, length, yaw, mat) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.01, 0.06), mat);
        strip.position.set(0, 0.02, offsetZ);
        strip.rotation.y = yaw;
        strip.castShadow = false;
        strip.receiveShadow = false;
        ship.add(strip);
    }
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1e1f22, metalness: 0.6, roughness: 0.45 });
    addPanelStrip(-1.2, 1.8, 0.02, panelMat);
    addPanelStrip(-0.2, 2.2, -0.04, panelMat);

    // Dorsal spine for structural detail
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 1.6), frameMat);
    spine.position.set(0, 0.12, -0.2);
    spine.rotation.x = 0.02;
    ship.add(spine);

    // Small forward winglets and camera/sensor array
    const wingletLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.14), hullMat);
    wingletLeft.position.set(-0.9, 0.04, -1.0);
    wingletLeft.rotation.set(0.05, 0.15, -0.06);
    ship.add(wingletLeft);
    const wingletRight = wingletLeft.clone(); wingletRight.position.x = 0.9; wingletRight.rotation.z = 0.06; ship.add(wingletRight);

    // Antennae / sensor mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.45, 6), frameMat);
    mast.position.set(0, 0.35, -1.6);
    ship.add(mast);

    // Cockpit interior - pilot seat and controls (visible through glass)
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.06), interiorMat);
    seatBack.position.set(0, 0.12, -2.0);
    ship.add(seatBack);
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.12), interiorMat);
    seatBase.position.set(0, 0.02, -2.05);
    ship.add(seatBase);
    // Control panel
    const consoleMat = new THREE.MeshStandardMaterial({ color: 0x222228, emissive: 0x001122, emissiveIntensity: 0.3 });
    const console1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.08), consoleMat);
    console1.position.set(0, 0.08, -2.35);
    console1.rotation.x = -0.3;
    ship.add(console1);
    // Small indicator lights on console
    const indicatorMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const ind1 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), indicatorMat);
    ind1.position.set(-0.04, 0.1, -2.33);
    ship.add(ind1);
    const ind2 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4400 }));
    ind2.position.set(0.04, 0.1, -2.33);
    ship.add(ind2);
    // Pilot helmet/head shape
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.1, roughness: 0.4 }));
    helmet.position.set(0, 0.22, -2.0);
    helmet.scale.set(1, 1.1, 1);
    ship.add(helmet);

    // Cockpit: transparent glass canopy
    const canopyGeo = new THREE.SphereGeometry(0.32, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    const canopyMat = new THREE.MeshPhysicalMaterial({
        color: 0xaaddff,
        transmission: 0.95,
        thickness: 0.1,
        roughness: 0.02,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        ior: 1.5,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.scale.set(1.0, 0.9, 1.6);
    canopy.position.set(0, 0.22, -2.2);
    canopy.rotation.x = 0.05;
    canopy.name = 'cockpitCanopy';
    ship.add(canopy);

    // Cockpit frame
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 40, Math.PI), frameMat);
    frame.rotation.x = Math.PI / 2;
    frame.rotation.z = Math.PI / 2.1;
    frame.position.set(0, 0.18, -2.0);
    ship.add(frame);

    // Wings - slim swept geometry
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 0.65), hullMat);
    wing.position.set(0, 0.02, 0.2);
    wing.rotation.x = 0.02;
    ship.add(wing);

    // Vertical stabilizers
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.35), hullMat);
    fin.position.set(-0.95, 0.25, 0.6);
    fin.rotation.z = -0.25;
    ship.add(fin);
    const fin2 = fin.clone();
    fin2.position.x = 0.95; fin2.rotation.z = 0.25;
    ship.add(fin2);

    // Engine nacelles and intakes
    const nacelleGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.9, 24);
    const leftNacelle = new THREE.Mesh(nacelleGeo, hullMat); leftNacelle.rotation.x = Math.PI / 2; leftNacelle.position.set(-0.6, -0.08, 1.0); ship.add(leftNacelle);
    const rightNacelle = leftNacelle.clone(); rightNacelle.position.x = 0.6; ship.add(rightNacelle);

    // Create a radial gradient texture for flame glow (canvas)
    function makeFlameTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(size/2, size/2, 2, size/2, size/2, size/2);
        grad.addColorStop(0, 'rgba(180,235,255,1)');
        grad.addColorStop(0.4, 'rgba(0,170,255,0.9)');
        grad.addColorStop(1, 'rgba(0,40,80,0)');
        ctx.fillStyle = grad; ctx.fillRect(0,0,size,size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }
    const flameTex = makeFlameTexture();

    function createThruster(x, y, z, scale=1, name='') {
        const g = new THREE.Group();
        // inner cone for core
        const core = new THREE.Mesh(new THREE.ConeGeometry(0.06*scale, 0.8*scale, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        core.rotation.x = -Math.PI/2; core.position.z = 0.1*scale; core.scale.set(1,1,0.8); g.add(core);

        // blue flame sprite glow
        const spriteMat = new THREE.SpriteMaterial({ map: flameTex, color: 0x66ddff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.5*scale, 0.9*scale, 1.0);
        sprite.position.set(0, 0, 0.25*scale);
        g.add(sprite);

        // small point light for emissive feel
        const pl = new THREE.PointLight(0x66ccff, 0.6, 4*scale, 2);
        pl.position.set(0,0,0.2*scale);
        g.add(pl);

        g.position.set(x,y,z);
        if (name) g.name = name;
        return g;
    }

    // Add thrusters (names preserved so animation code still finds them)
    const t1 = createThruster(-0.2, -0.05, 1.55, 1.0, 'thruster1'); ship.add(t1);
    const t2 = createThruster(0, -0.05, 1.55, 1.15, 'thruster2'); ship.add(t2);
    const t3 = createThruster(0.2, -0.05, 1.55, 1.0, 'thruster3'); ship.add(t3);
    const t4 = createThruster(-0.6, -0.08, 1.65, 0.85, 'thruster4'); ship.add(t4);
    const t5 = createThruster(0.6, -0.08, 1.65, 0.85, 'thruster5'); ship.add(t5);

    // Nav lights
    const navGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const navR = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0xff4444 })); navR.position.set(-1.4,0.02,0.7); ship.add(navR);
    const navG = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0x44ff88 })); navG.position.set(1.4,0.02,0.7); ship.add(navG);

    return ship;
}

const spaceShip = createSpaceShip();
scene.add(spaceShip);

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

    // Subtle starfield rotation
    starfield.rotation.y += 0.00005;

    renderer.render(scene, camera);
}

animate();
