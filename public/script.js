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

// Add lighting
const ambientLight = new THREE.AmbientLight(0x404050, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffee, 1.5);
directionalLight.position.set(10, 8, 5);
scene.add(directionalLight);

// Add subtle fill light from opposite side
const fillLight = new THREE.DirectionalLight(0x4466aa, 0.3);
fillLight.position.set(-5, -3, -5);
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
const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
        dayTexture: { value: earthTexture },
        nightTexture: { value: earthNightTexture },
        bumpMap: { value: earthBumpMap },
        bumpScale: { value: 0.05 },
        lightDirection: { value: new THREE.Vector3(10, 8, 5).normalize() }
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 lightDirection;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            // Calculate how much this fragment faces the light
            float lightIntensity = dot(vNormal, lightDirection);

            // Smooth transition at terminator (-0.2 to 0.1 range for sharper transition)
            float dayNightMix = smoothstep(-0.2, 0.1, lightIntensity);

            // Sample textures
            vec4 dayColor = texture2D(dayTexture, vUv);
            vec4 nightColor = texture2D(nightTexture, vUv);

            // Day side: full color with lighting
            vec3 litDay = dayColor.rgb * (0.4 + 0.6 * max(0.0, lightIntensity));

            // Night side: very dark with bright city lights
            vec3 litNight = dayColor.rgb * 0.01 + nightColor.rgb * 2.5;

            // Blend between day and night
            vec3 finalColor = mix(litNight, litDay, dayNightMix);

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
    opacity: 0.85,
    depthWrite: false
});
const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
scene.add(clouds);

// Atmosphere glow
const atmosphereGeometry = new THREE.SphereGeometry(2.1, 64, 64);
const atmosphereMaterial = new THREE.MeshPhongMaterial({
    color: 0x0088ff,
    transparent: true,
    opacity: 0.12,
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

    // Materials
    const hullDark = new THREE.MeshPhongMaterial({ color: 0x1a1a24, shininess: 80, specular: 0x444455 });
    const hullMid = new THREE.MeshPhongMaterial({ color: 0x2a2a38, shininess: 70, specular: 0x555566 });
    const hullLight = new THREE.MeshPhongMaterial({ color: 0x3a3a48, shininess: 60, specular: 0x666677 });
    const accentBlue = new THREE.MeshPhongMaterial({ color: 0x0088ff, emissive: 0x004488, emissiveIntensity: 0.5 });
    const accentRed = new THREE.MeshPhongMaterial({ color: 0xff3333, emissive: 0x881111, emissiveIntensity: 0.3 });
    const cockpitGlass = new THREE.MeshPhongMaterial({
        color: 0x88ccff, emissive: 0x2266aa, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.85, shininess: 100
    });

    // Main fuselage - sleek tapered body
    const fuselageLength = 3.2;
    const fuselageShape = new THREE.Shape();
    fuselageShape.moveTo(0, 0.2);
    fuselageShape.bezierCurveTo(0.25, 0.22, 0.35, 0.12, 0.35, 0);
    fuselageShape.bezierCurveTo(0.35, -0.12, 0.25, -0.18, 0, -0.2);
    fuselageShape.bezierCurveTo(-0.25, -0.18, -0.35, -0.12, -0.35, 0);
    fuselageShape.bezierCurveTo(-0.35, 0.12, -0.25, 0.22, 0, 0.2);

    const fuselageGeo = new THREE.ExtrudeGeometry(fuselageShape, {
        depth: fuselageLength, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3
    });
    const fuselage = new THREE.Mesh(fuselageGeo, hullMid);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.position.z = -fuselageLength / 2;
    ship.add(fuselage);

    // Nose cone - sharp pointed
    const noseGeo = new THREE.ConeGeometry(0.22, 1.0, 8);
    const nose = new THREE.Mesh(noseGeo, hullLight);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -fuselageLength / 2 - 0.5;
    ship.add(nose);

    // Cockpit canopy
    const canopyGeo = new THREE.SphereGeometry(0.18, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const canopy = new THREE.Mesh(canopyGeo, cockpitGlass);
    canopy.scale.set(1.2, 0.6, 2.0);
    canopy.position.set(0, 0.15, -0.8);
    ship.add(canopy);

    // Cockpit frame
    const frameGeo = new THREE.TorusGeometry(0.16, 0.025, 6, 16, Math.PI);
    const frame = new THREE.Mesh(frameGeo, hullDark);
    frame.rotation.x = Math.PI / 2;
    frame.rotation.z = Math.PI / 2;
    frame.scale.set(1.2, 1, 1.5);
    frame.position.set(0, 0.16, -0.6);
    ship.add(frame);

    // Main wings - swept back
    const wingGeo = new THREE.BoxGeometry(2.8, 0.04, 0.7);
    const wings = new THREE.Mesh(wingGeo, hullMid);
    wings.position.set(0, 0, 0.4);
    ship.add(wings);

    // Wing tips - angled
    const tipGeo = new THREE.BoxGeometry(0.5, 0.06, 0.4);
    const leftTip = new THREE.Mesh(tipGeo, hullDark);
    leftTip.position.set(-1.5, 0.08, 0.5);
    leftTip.rotation.z = 0.3;
    ship.add(leftTip);

    const rightTip = new THREE.Mesh(tipGeo, hullDark);
    rightTip.position.set(1.5, 0.08, 0.5);
    rightTip.rotation.z = -0.3;
    ship.add(rightTip);

    // Wing accent lights
    const lightStripGeo = new THREE.BoxGeometry(1.5, 0.03, 0.05);
    const leftLight = new THREE.Mesh(lightStripGeo, accentBlue);
    leftLight.position.set(-0.8, 0.03, 0.5);
    ship.add(leftLight);

    const rightLight = new THREE.Mesh(lightStripGeo, accentBlue);
    rightLight.position.set(0.8, 0.03, 0.5);
    ship.add(rightLight);

    // Vertical stabilizers
    const finGeo = new THREE.BoxGeometry(0.04, 0.4, 0.5);
    const leftFin = new THREE.Mesh(finGeo, hullDark);
    leftFin.position.set(-1.3, 0.2, 0.6);
    leftFin.rotation.z = -0.2;
    ship.add(leftFin);

    const rightFin = new THREE.Mesh(finGeo, hullDark);
    rightFin.position.set(1.3, 0.2, 0.6);
    rightFin.rotation.z = 0.2;
    ship.add(rightFin);

    // Engine nacelles
    const nacelleGeo = new THREE.CylinderGeometry(0.14, 0.18, 1.2, 12);
    const leftNacelle = new THREE.Mesh(nacelleGeo, hullDark);
    leftNacelle.rotation.x = Math.PI / 2;
    leftNacelle.position.set(-0.6, -0.08, 1.0);
    ship.add(leftNacelle);

    const rightNacelle = new THREE.Mesh(nacelleGeo, hullDark);
    rightNacelle.rotation.x = Math.PI / 2;
    rightNacelle.position.set(0.6, -0.08, 1.0);
    ship.add(rightNacelle);

    // Engine intakes (glowing rings)
    const intakeGeo = new THREE.TorusGeometry(0.15, 0.03, 8, 16);
    const leftIntake = new THREE.Mesh(intakeGeo, accentBlue);
    leftIntake.position.set(-0.6, -0.08, 0.4);
    ship.add(leftIntake);

    const rightIntake = new THREE.Mesh(intakeGeo, accentBlue);
    rightIntake.position.set(0.6, -0.08, 0.4);
    ship.add(rightIntake);

    // Main engine block
    const engineGeo = new THREE.BoxGeometry(0.8, 0.35, 0.6);
    const engineBlock = new THREE.Mesh(engineGeo, hullDark);
    engineBlock.position.set(0, -0.05, 1.2);
    ship.add(engineBlock);

    // === BLUE METHANE THRUSTERS ===
    const thrusterCore = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const thrusterMid = new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.9 });
    const thrusterOuter = new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.6 });

    function createThruster(x, y, z, scale = 1) {
        const group = new THREE.Group();

        // Hot white core
        const coreGeo = new THREE.ConeGeometry(0.04 * scale, 0.35 * scale, 8);
        const core = new THREE.Mesh(coreGeo, thrusterCore);
        core.rotation.x = -Math.PI / 2;
        group.add(core);

        // Mid cyan layer
        const midGeo = new THREE.ConeGeometry(0.08 * scale, 0.55 * scale, 8);
        const mid = new THREE.Mesh(midGeo, thrusterMid);
        mid.rotation.x = -Math.PI / 2;
        mid.position.z = 0.08 * scale;
        group.add(mid);

        // Outer blue glow
        const outerGeo = new THREE.ConeGeometry(0.13 * scale, 0.75 * scale, 8);
        const outer = new THREE.Mesh(outerGeo, thrusterOuter);
        outer.rotation.x = -Math.PI / 2;
        outer.position.z = 0.15 * scale;
        group.add(outer);

        group.position.set(x, y, z);
        return group;
    }

    // Main thrusters
    const mainThrust1 = createThruster(-0.2, -0.05, 1.55, 1.0);
    mainThrust1.name = 'thruster1';
    ship.add(mainThrust1);

    const mainThrust2 = createThruster(0, -0.05, 1.55, 1.15);
    mainThrust2.name = 'thruster2';
    ship.add(mainThrust2);

    const mainThrust3 = createThruster(0.2, -0.05, 1.55, 1.0);
    mainThrust3.name = 'thruster3';
    ship.add(mainThrust3);

    // Nacelle thrusters
    const leftThrust = createThruster(-0.6, -0.08, 1.65, 0.85);
    leftThrust.name = 'thruster4';
    ship.add(leftThrust);

    const rightThrust = createThruster(0.6, -0.08, 1.65, 0.85);
    rightThrust.name = 'thruster5';
    ship.add(rightThrust);

    // Navigation lights
    const navLightGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const redNav = new THREE.Mesh(navLightGeo, accentRed);
    redNav.position.set(-1.4, 0.02, 0.7);
    ship.add(redNav);

    const greenNav = new THREE.Mesh(navLightGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    greenNav.position.set(1.4, 0.02, 0.7);
    ship.add(greenNav);

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

    earth.rotation.x = 0.2;
    clouds.rotation.x = 0.2;

    // Update shader light direction based on Earth's rotation
    // Light is fixed in world space, transform to Earth's local space
    const worldLightDir = new THREE.Vector3(10, 8, 5).normalize();
    const inverseRotation = new THREE.Matrix4().makeRotationFromEuler(earth.rotation).invert();
    const localLightDir = worldLightDir.clone().applyMatrix4(inverseRotation);
    earthMaterial.uniforms.lightDirection.value.copy(localLightDir);
    atmosphere.rotation.x = 0.2;

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
