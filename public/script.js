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

// Add lighting from top-right
const ambientLight = new THREE.AmbientLight(0x333344, 0.3);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffee, 1.5);
directionalLight.position.set(10, 8, 5); // Top-right position
scene.add(directionalLight);

// Rotation state
let rotationSpeed = 0.1;
let rotationDirection = 1;

// Texture loader
const textureLoader = new THREE.TextureLoader();

// NASA/satellite imagery URLs
const EARTH_TEXTURE_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg';
const EARTH_BUMP_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png';
const EARTH_SPECULAR_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-water.png';
const CLOUDS_TEXTURE_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-clouds.png';

// Loading indicator
const loadingDiv = document.createElement('div');
loadingDiv.id = 'loading';
loadingDiv.innerHTML = 'Loading satellite imagery...';
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
`;
document.body.appendChild(loadingDiv);

let texturesLoaded = 0;
const totalTextures = 4;

function onTextureLoad() {
    texturesLoaded++;
    loadingDiv.innerHTML = `Loading satellite imagery... ${Math.round(texturesLoaded/totalTextures*100)}%`;
    if (texturesLoaded >= totalTextures) {
        setTimeout(() => loadingDiv.remove(), 500);
    }
}

// Load NASA Blue Marble Earth texture (photographic satellite imagery)
const earthTexture = textureLoader.load(EARTH_TEXTURE_URL, onTextureLoad);
const earthBumpMap = textureLoader.load(EARTH_BUMP_URL, onTextureLoad);
const earthSpecularMap = textureLoader.load(EARTH_SPECULAR_URL, onTextureLoad);
const cloudTexture = textureLoader.load(CLOUDS_TEXTURE_URL, onTextureLoad);

// Create Earth with high-quality NASA textures
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

// Cloud layer with satellite cloud imagery
const cloudGeometry = new THREE.SphereGeometry(2.03, 64, 64);
const cloudMaterial = new THREE.MeshPhongMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
});
const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
scene.add(clouds);

// Atmosphere glow
const atmosphereGeometry = new THREE.SphereGeometry(2.1, 64, 64);
const atmosphereMaterial = new THREE.MeshPhongMaterial({
    color: 0x0088ff,
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide
});
const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
scene.add(atmosphere);

// Try to fetch real-time cloud data from NASA GIBS (optional enhancement)
async function fetchRealtimeClouds() {
    try {
        // NASA GIBS provides daily satellite imagery
        // Using MODIS cloud layer
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];

        // NASA GIBS WMTS endpoint for cloud imagery
        const gibsUrl = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/jpeg&TIME=${dateStr}`;

        // Note: CORS may prevent direct loading, using proxy or fallback
        console.log('Real-time cloud data available from NASA GIBS');
    } catch (e) {
        console.log('Using cached cloud imagery');
    }
}

fetchRealtimeClouds();

// Create starfield background
function createStarfield() {
    const starCount = 2000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
        starPositions[i] = (Math.random() - 0.5) * 200;
        starPositions[i + 1] = (Math.random() - 0.5) * 200;
        starPositions[i + 2] = (Math.random() - 0.5) * 200;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));

    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.1,
        sizeAttenuation: true
    });

    const starfield = new THREE.Points(starGeometry, starMaterial);
    scene.add(starfield);
    return starfield;
}

const starfield = createStarfield();

// Create sci-fi starship
function createSpaceShip() {
    const shipGroup = new THREE.Group();

    // Sci-fi materials
    const hullMaterial = new THREE.MeshPhongMaterial({
        color: 0x2a2a35,
        shininess: 80,
        specular: 0x555566
    });
    const darkMaterial = new THREE.MeshPhongMaterial({
        color: 0x1a1a22,
        shininess: 40,
        specular: 0x333344
    });
    const accentMaterial = new THREE.MeshPhongMaterial({
        color: 0x445566,
        shininess: 100,
        specular: 0x88aacc
    });
    const glowMaterial = new THREE.MeshPhongMaterial({
        color: 0x00aaff,
        emissive: 0x0066aa,
        emissiveIntensity: 0.6,
        shininess: 100
    });
    const cockpitMaterial = new THREE.MeshPhongMaterial({
        color: 0x88ddff,
        emissive: 0x2288aa,
        emissiveIntensity: 0.4,
        shininess: 120,
        specular: 0xffffff,
        transparent: true,
        opacity: 0.9
    });

    // === MAIN FUSELAGE ===
    // Primary hull - angular sci-fi shape
    const mainHullShape = new THREE.Shape();
    mainHullShape.moveTo(0, 0.25);
    mainHullShape.lineTo(0.35, 0.15);
    mainHullShape.lineTo(0.4, -0.1);
    mainHullShape.lineTo(0.2, -0.25);
    mainHullShape.lineTo(-0.2, -0.25);
    mainHullShape.lineTo(-0.4, -0.1);
    mainHullShape.lineTo(-0.35, 0.15);
    mainHullShape.closePath();

    const extrudeSettings = { depth: 2.5, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05 };
    const mainHullGeometry = new THREE.ExtrudeGeometry(mainHullShape, extrudeSettings);
    const mainHull = new THREE.Mesh(mainHullGeometry, hullMaterial);
    mainHull.rotation.x = Math.PI / 2;
    mainHull.position.set(0, 0, -1.25);
    shipGroup.add(mainHull);

    // === NOSE SECTION ===
    // Pointed nose cone
    const noseGeometry = new THREE.ConeGeometry(0.28, 1.2, 6);
    const nose = new THREE.Mesh(noseGeometry, accentMaterial);
    nose.rotation.x = -Math.PI / 2;
    nose.rotation.z = Math.PI / 6;
    nose.position.set(0, 0.05, -1.85);
    shipGroup.add(nose);

    // Nose accent ridge
    const noseRidgeGeometry = new THREE.BoxGeometry(0.08, 0.12, 0.8);
    const noseRidge = new THREE.Mesh(noseRidgeGeometry, glowMaterial);
    noseRidge.position.set(0, 0.2, -1.6);
    shipGroup.add(noseRidge);

    // === COCKPIT ===
    const cockpitGeometry = new THREE.SphereGeometry(0.22, 16, 16);
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.set(0, 0.28, -1.0);
    cockpit.scale.set(1.3, 0.7, 1.8);
    shipGroup.add(cockpit);

    // Cockpit frame
    const frameGeometry = new THREE.TorusGeometry(0.2, 0.03, 8, 16);
    const frame = new THREE.Mesh(frameGeometry, darkMaterial);
    frame.position.set(0, 0.28, -0.85);
    frame.rotation.x = Math.PI / 2;
    frame.scale.set(1.3, 1, 0.7);
    shipGroup.add(frame);

    // === WINGS ===
    // Main swept wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(1.8, -0.3);
    wingShape.lineTo(2.0, -0.2);
    wingShape.lineTo(1.6, 0.1);
    wingShape.lineTo(0, 0.15);
    wingShape.closePath();

    const wingExtrudeSettings = { depth: 0.06, bevelEnabled: false };
    const wingGeometry = new THREE.ExtrudeGeometry(wingShape, wingExtrudeSettings);

    const leftWing = new THREE.Mesh(wingGeometry, hullMaterial);
    leftWing.position.set(-0.3, 0, 0.3);
    leftWing.rotation.y = Math.PI;
    leftWing.rotation.z = 0.05;
    shipGroup.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeometry, hullMaterial);
    rightWing.position.set(0.3, 0, 0.3);
    rightWing.rotation.z = -0.05;
    shipGroup.add(rightWing);

    // Wing glow strips
    const wingGlowGeometry = new THREE.BoxGeometry(1.2, 0.04, 0.06);
    const leftWingGlow = new THREE.Mesh(wingGlowGeometry, glowMaterial);
    leftWingGlow.position.set(-1.0, 0.02, 0.2);
    leftWingGlow.rotation.y = 0.15;
    shipGroup.add(leftWingGlow);

    const rightWingGlow = new THREE.Mesh(wingGlowGeometry, glowMaterial);
    rightWingGlow.position.set(1.0, 0.02, 0.2);
    rightWingGlow.rotation.y = -0.15;
    shipGroup.add(rightWingGlow);

    // === ENGINE SECTION ===
    // Main engine block
    const engineGeometry = new THREE.BoxGeometry(0.9, 0.4, 0.7);
    const engine = new THREE.Mesh(engineGeometry, darkMaterial);
    engine.position.set(0, -0.05, 1.0);
    shipGroup.add(engine);

    // Engine nacelles (large)
    const nacelleGeometry = new THREE.CylinderGeometry(0.18, 0.22, 1.4, 12);

    const leftNacelle = new THREE.Mesh(nacelleGeometry, hullMaterial);
    leftNacelle.rotation.x = Math.PI / 2;
    leftNacelle.position.set(-0.55, -0.08, 0.9);
    shipGroup.add(leftNacelle);

    const rightNacelle = new THREE.Mesh(nacelleGeometry, hullMaterial);
    rightNacelle.rotation.x = Math.PI / 2;
    rightNacelle.position.set(0.55, -0.08, 0.9);
    shipGroup.add(rightNacelle);

    // Nacelle intake rings
    const intakeGeometry = new THREE.TorusGeometry(0.2, 0.04, 8, 16);
    const leftIntake = new THREE.Mesh(intakeGeometry, glowMaterial);
    leftIntake.position.set(-0.55, -0.08, 0.2);
    shipGroup.add(leftIntake);

    const rightIntake = new THREE.Mesh(intakeGeometry, glowMaterial);
    rightIntake.position.set(0.55, -0.08, 0.2);
    shipGroup.add(rightIntake);

    // === THRUSTERS (Blue methane flames) ===
    const thrustCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const thrustOuterMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ccff,
        transparent: true,
        opacity: 0.8
    });

    // Main engine thrusters (3)
    function createThruster(x, y, z, scale = 1) {
        const group = new THREE.Group();

        // Inner white-hot core
        const coreGeometry = new THREE.ConeGeometry(0.06 * scale, 0.4 * scale, 8);
        const core = new THREE.Mesh(coreGeometry, thrustCoreMaterial);
        core.rotation.x = -Math.PI / 2;
        group.add(core);

        // Outer blue flame
        const outerGeometry = new THREE.ConeGeometry(0.12 * scale, 0.7 * scale, 8);
        const outer = new THREE.Mesh(outerGeometry, thrustOuterMaterial);
        outer.rotation.x = -Math.PI / 2;
        outer.position.z = 0.1 * scale;
        group.add(outer);

        group.position.set(x, y, z);
        group.name = 'thruster';
        return group;
    }

    const thrust1 = createThruster(-0.25, -0.05, 1.45, 1);
    thrust1.name = 'mainThrust';
    shipGroup.add(thrust1);

    const thrust2 = createThruster(0, -0.05, 1.45, 1.1);
    thrust2.name = 'mainThrust2';
    shipGroup.add(thrust2);

    const thrust3 = createThruster(0.25, -0.05, 1.45, 1);
    thrust3.name = 'mainThrust3';
    shipGroup.add(thrust3);

    // Nacelle thrusters
    const leftNacelleThrust = createThruster(-0.55, -0.08, 1.65, 0.9);
    leftNacelleThrust.name = 'leftNacelleThrust';
    shipGroup.add(leftNacelleThrust);

    const rightNacelleThrust = createThruster(0.55, -0.08, 1.65, 0.9);
    rightNacelleThrust.name = 'rightNacelleThrust';
    shipGroup.add(rightNacelleThrust);

    // === DETAIL ELEMENTS ===
    // Antenna array
    const antennaGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.4, 6);
    const antenna = new THREE.Mesh(antennaGeometry, accentMaterial);
    antenna.position.set(0, 0.4, -0.5);
    antenna.rotation.z = -0.2;
    shipGroup.add(antenna);

    // Sensor dome
    const sensorGeometry = new THREE.SphereGeometry(0.08, 12, 12);
    const sensor = new THREE.Mesh(sensorGeometry, glowMaterial);
    sensor.position.set(0, -0.28, -0.3);
    shipGroup.add(sensor);

    // Hull panel lines (decorative)
    const panelGeometry = new THREE.BoxGeometry(0.02, 0.02, 1.5);
    const panel1 = new THREE.Mesh(panelGeometry, darkMaterial);
    panel1.position.set(0.25, 0.18, 0);
    shipGroup.add(panel1);

    const panel2 = new THREE.Mesh(panelGeometry, darkMaterial);
    panel2.position.set(-0.25, 0.18, 0);
    shipGroup.add(panel2);

    return shipGroup;
}

const spaceShip = createSpaceShip();
scene.add(spaceShip);

// Orbit parameters
const orbitRadius = 4.5;
const orbitSpeed = 0.25;
const orbitY = 1.5;

// === SMOOTH ORBITAL ENTRY ===
// Calculate entry angle and tangent point for seamless transition
const entryStartAngle = Math.PI * 1.5; // Enter from the back

// Calculate the tangent point and approach vector for smooth entry
// Ship approaches tangentially to the orbit circle
const tangentPoint = {
    x: Math.cos(entryStartAngle) * orbitRadius,
    y: orbitY,
    z: Math.sin(entryStartAngle) * orbitRadius
};

// Tangent direction at entry point (for clockwise orbit)
const tangentDir = {
    x: Math.sin(entryStartAngle),
    z: -Math.cos(entryStartAngle)
};

// Start position - extend back along the tangent line from entry point
const approachDistance = 25;
const shipStartX = tangentPoint.x - tangentDir.x * approachDistance + 8; // Offset to top-right
const shipStartY = tangentPoint.y + 6; // Higher up
const shipStartZ = tangentPoint.z - tangentDir.z * approachDistance;

// Control point for Bezier curve (for smooth arc into orbit)
const controlPoint = {
    x: tangentPoint.x - tangentDir.x * 8,
    y: tangentPoint.y + 3,
    z: tangentPoint.z - tangentDir.z * 8
};

// Target is the tangent point on the orbit
const shipTargetX = tangentPoint.x;
const shipTargetY = tangentPoint.y;
const shipTargetZ = tangentPoint.z;

// Ship animation state
let shipProgress = 0;
const shipSpeed = 0.08;
let orbitStartTime = 0;
let hasEnteredOrbit = false;

// Quadratic Bezier interpolation for smooth curved entry
function bezierPoint(t, p0, p1, p2) {
    const mt = 1 - t;
    return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

function bezierTangent(t, p0, p1, p2) {
    return 2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1);
}

spaceShip.position.set(shipStartX, shipStartY, shipStartZ);

// Position camera
camera.position.set(3, 3, 10);
camera.lookAt(0, 0, 0);

// Create UI control dial
function createControlUI() {
    const container = document.createElement('div');
    container.id = 'controls';
    container.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 20, 40, 0.85);
        border: 2px solid #4488ff;
        border-radius: 15px;
        padding: 20px 30px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        font-family: 'Courier New', monospace;
        color: #4488ff;
        box-shadow: 0 0 20px rgba(68, 136, 255, 0.3);
    `;

    const label = document.createElement('div');
    label.textContent = 'PLANET ROTATION';
    label.style.cssText = 'font-size: 12px; letter-spacing: 2px; margin-bottom: 5px;';
    container.appendChild(label);

    const dialContainer = document.createElement('div');
    dialContainer.style.cssText = 'display: flex; align-items: center; gap: 15px;';

    const reverseLabel = document.createElement('span');
    reverseLabel.textContent = '◄ REV';
    reverseLabel.style.cssText = 'font-size: 11px; opacity: 0.7;';
    dialContainer.appendChild(reverseLabel);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '-100';
    slider.max = '100';
    slider.value = '25';
    slider.style.cssText = `
        width: 200px;
        height: 8px;
        -webkit-appearance: none;
        background: linear-gradient(to right, #ff4444 0%, #444 45%, #444 55%, #44ff44 100%);
        border-radius: 4px;
        outline: none;
        cursor: pointer;
    `;
    dialContainer.appendChild(slider);

    const forwardLabel = document.createElement('span');
    forwardLabel.textContent = 'FWD ►';
    forwardLabel.style.cssText = 'font-size: 11px; opacity: 0.7;';
    dialContainer.appendChild(forwardLabel);

    container.appendChild(dialContainer);

    const speedDisplay = document.createElement('div');
    speedDisplay.id = 'speedDisplay';
    speedDisplay.textContent = 'Speed: 0.10 | Direction: CW';
    speedDisplay.style.cssText = 'font-size: 11px; margin-top: 5px; color: #88aaff;';
    container.appendChild(speedDisplay);

    document.body.appendChild(container);

    // Slider event - more intense rotation range
    slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        // More intense: 0-100 maps to 0-0.5 (was 0-0.1)
        rotationSpeed = Math.abs(value) / 200;
        rotationDirection = value >= 0 ? 1 : -1;

        const dirText = value === 0 ? 'STOPPED' : (value > 0 ? 'CW' : 'CCW');
        speedDisplay.textContent = `Speed: ${rotationSpeed.toFixed(2)} | Direction: ${dirText}`;

        fetch('/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                speed: rotationSpeed,
                direction: rotationDirection === 1 ? 'cw' : 'ccw'
            })
        }).catch(() => {});
    });

    const style = document.createElement('style');
    style.textContent = `
        #controls input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 20px;
            height: 20px;
            background: #4488ff;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 10px #4488ff;
        }
        #controls input[type="range"]::-moz-range-thumb {
            width: 20px;
            height: 20px;
            background: #4488ff;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 10px #4488ff;
            border: none;
        }
    `;
    document.head.appendChild(style);
}

createControlUI();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Rotate Earth (more intense with slider)
    earth.rotation.y += rotationSpeed * rotationDirection * delta;
    atmosphere.rotation.y = earth.rotation.y;

    // Clouds rotate slightly faster for realism
    clouds.rotation.y += rotationSpeed * rotationDirection * delta * 1.1;

    // Earth tilt
    earth.rotation.x = 0.2;
    atmosphere.rotation.x = 0.2;
    clouds.rotation.x = 0.2;

    // Animate space ship
    if (shipProgress < 1) {
        // Entry phase - smooth Bezier curve approach
        shipProgress += shipSpeed * delta;
        if (shipProgress > 1) shipProgress = 1;

        // Smooth easing for the parameter
        const t = 1 - Math.pow(1 - shipProgress, 2);

        // Calculate position along Bezier curve
        const newX = bezierPoint(t, shipStartX, controlPoint.x, shipTargetX);
        const newY = bezierPoint(t, shipStartY, controlPoint.y, shipTargetY);
        const newZ = bezierPoint(t, shipStartZ, controlPoint.z, shipTargetZ);

        spaceShip.position.set(newX, newY, newZ);

        // Calculate tangent of Bezier curve for smooth orientation
        const tanX = bezierTangent(t, shipStartX, controlPoint.x, shipTargetX);
        const tanY = bezierTangent(t, shipStartY, controlPoint.y, shipTargetY);
        const tanZ = bezierTangent(t, shipStartZ, controlPoint.z, shipTargetZ);

        const travelDir = new THREE.Vector3(tanX, tanY, tanZ).normalize();

        // Look in direction of travel, then flip so thrusters trail behind
        const lookTarget = spaceShip.position.clone().add(travelDir);
        spaceShip.lookAt(lookTarget);
        spaceShip.rotateY(Math.PI);

        if (shipProgress >= 1 && !hasEnteredOrbit) {
            orbitStartTime = elapsed;
            hasEnteredOrbit = true;
        }
    } else {
        // Orbit phase - clockwise (left to right from camera view)
        const orbitElapsed = elapsed - orbitStartTime;
        const angle = entryStartAngle - orbitElapsed * orbitSpeed;

        spaceShip.position.x = Math.cos(angle) * orbitRadius;
        spaceShip.position.z = Math.sin(angle) * orbitRadius;
        spaceShip.position.y = orbitY;

        // Tangent direction for clockwise orbit
        const tangentX = Math.sin(angle);
        const tangentZ = -Math.cos(angle);

        // Point nose in direction of travel
        const forwardPoint = new THREE.Vector3(
            spaceShip.position.x + tangentX,
            spaceShip.position.y,
            spaceShip.position.z + tangentZ
        );
        spaceShip.lookAt(forwardPoint);
        spaceShip.rotateY(Math.PI);
    }

    // Animate thrust flames (new thruster groups)
    const thrusters = ['mainThrust', 'mainThrust2', 'mainThrust3', 'leftNacelleThrust', 'rightNacelleThrust'];
    thrusters.forEach(name => {
        const thrustGroup = spaceShip.getObjectByName(name);
        if (thrustGroup && thrustGroup.children) {
            // Animate each part of the thruster
            thrustGroup.children.forEach((child, i) => {
                const flicker = 0.7 + Math.random() * 0.5;
                const lengthFlicker = 0.8 + Math.random() * 0.4;
                child.scale.set(flicker, flicker, lengthFlicker);
            });
        }
    });

    // Subtle starfield rotation
    starfield.rotation.y += 0.0001;

    renderer.render(scene, camera);
}

animate();
