// Space Scene - Three.js Frontend

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

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
const totalTextures = 4;

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

// Create Earth
const earthGeometry = new THREE.SphereGeometry(2, 128, 128);
const earthMaterial = new THREE.MeshPhongMaterial({
    map: earthTexture,
    bumpMap: earthBumpMap,
    bumpScale: 0.05,
    specularMap: earthSpecularMap,
    specular: new THREE.Color(0x333333),
    shininess: 25
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

// Position camera
camera.position.set(4, 4, 12);
camera.lookAt(0, 0, 0);

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

    // Rotate Earth
    earth.rotation.y += planetRotationSpeed * planetRotationDirection * delta;
    clouds.rotation.y += planetRotationSpeed * planetRotationDirection * delta * 1.05;
    atmosphere.rotation.y = earth.rotation.y;

    earth.rotation.x = 0.2;
    clouds.rotation.x = 0.2;
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
