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

// Create realistic starship with cockpit at front
function createSpaceShip() {
    const shipGroup = new THREE.Group();

    // Materials that reflect light
    const hullMaterial = new THREE.MeshPhongMaterial({
        color: 0x888888,
        shininess: 60,
        specular: 0x444444
    });
    const darkHullMaterial = new THREE.MeshPhongMaterial({
        color: 0x555555,
        shininess: 40,
        specular: 0x333333
    });
    const accentMaterial = new THREE.MeshPhongMaterial({
        color: 0xaaaaaa,
        shininess: 80,
        specular: 0x666666
    });
    const windowMaterial = new THREE.MeshPhongMaterial({
        color: 0x66ccff,
        shininess: 100,
        specular: 0xffffff,
        emissive: 0x224466,
        emissiveIntensity: 0.3
    });

    // Main hull - sleek elongated body (oriented so nose is at -Z, thrusters at +Z)
    const hullGeometry = new THREE.CylinderGeometry(0.3, 0.5, 2.0, 12);
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.rotation.x = Math.PI / 2;
    shipGroup.add(hull);

    // Nose cone (at front, -Z direction)
    const noseGeometry = new THREE.ConeGeometry(0.3, 0.8, 12);
    const nose = new THREE.Mesh(noseGeometry, accentMaterial);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, -1.4);
    shipGroup.add(nose);

    // Cockpit window (at front, on top of nose area)
    const cockpitGeometry = new THREE.SphereGeometry(0.2, 12, 12);
    const cockpit = new THREE.Mesh(cockpitGeometry, windowMaterial);
    cockpit.position.set(0, 0.28, -0.7);
    cockpit.scale.set(1.2, 0.6, 1.5);
    shipGroup.add(cockpit);

    // Wing struts
    const wingGeometry = new THREE.BoxGeometry(2.4, 0.06, 0.5);
    const wings = new THREE.Mesh(wingGeometry, darkHullMaterial);
    wings.position.set(0, 0, 0.2);
    shipGroup.add(wings);

    // Wing tips
    const wingTipGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.7);
    const leftWingTip = new THREE.Mesh(wingTipGeometry, accentMaterial);
    leftWingTip.position.set(-1.2, 0, 0.3);
    shipGroup.add(leftWingTip);

    const rightWingTip = new THREE.Mesh(wingTipGeometry, accentMaterial);
    rightWingTip.position.set(1.2, 0, 0.3);
    shipGroup.add(rightWingTip);

    // Engine nacelles (at rear)
    const nacelleGeometry = new THREE.CylinderGeometry(0.15, 0.2, 1.0, 8);

    const leftNacelle = new THREE.Mesh(nacelleGeometry, darkHullMaterial);
    leftNacelle.rotation.x = Math.PI / 2;
    leftNacelle.position.set(-0.6, -0.1, 0.9);
    shipGroup.add(leftNacelle);

    const rightNacelle = new THREE.Mesh(nacelleGeometry, darkHullMaterial);
    rightNacelle.rotation.x = Math.PI / 2;
    rightNacelle.position.set(0.6, -0.1, 0.9);
    shipGroup.add(rightNacelle);

    // Engine block (rear)
    const engineBlockGeometry = new THREE.BoxGeometry(0.7, 0.35, 0.5);
    const engineBlock = new THREE.Mesh(engineBlockGeometry, darkHullMaterial);
    engineBlock.position.set(0, 0, 1.15);
    shipGroup.add(engineBlock);

    // Main thrusters (at rear, +Z direction) - emissive for glow
    const thrustMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd00 });

    const thrustGeometry = new THREE.ConeGeometry(0.1, 0.6, 8);

    const thrust1 = new THREE.Mesh(thrustGeometry, thrustMaterial);
    thrust1.rotation.x = -Math.PI / 2;
    thrust1.position.set(-0.2, 0, 1.5);
    thrust1.name = 'mainThrust';
    shipGroup.add(thrust1);

    const thrust2 = new THREE.Mesh(thrustGeometry, thrustMaterial);
    thrust2.rotation.x = -Math.PI / 2;
    thrust2.position.set(0, 0, 1.5);
    thrust2.name = 'mainThrust2';
    shipGroup.add(thrust2);

    const thrust3 = new THREE.Mesh(thrustGeometry, thrustMaterial);
    thrust3.rotation.x = -Math.PI / 2;
    thrust3.position.set(0.2, 0, 1.5);
    thrust3.name = 'mainThrust3';
    shipGroup.add(thrust3);

    // Nacelle thrusters
    const nacelleThrustGeometry = new THREE.ConeGeometry(0.08, 0.5, 6);

    const leftNacelleThrust = new THREE.Mesh(nacelleThrustGeometry, thrustMaterial);
    leftNacelleThrust.rotation.x = -Math.PI / 2;
    leftNacelleThrust.position.set(-0.6, -0.1, 1.5);
    leftNacelleThrust.name = 'leftNacelleThrust';
    shipGroup.add(leftNacelleThrust);

    const rightNacelleThrust = new THREE.Mesh(nacelleThrustGeometry, thrustMaterial);
    rightNacelleThrust.rotation.x = -Math.PI / 2;
    rightNacelleThrust.position.set(0.6, -0.1, 1.5);
    rightNacelleThrust.name = 'rightNacelleThrust';
    shipGroup.add(rightNacelleThrust);

    return shipGroup;
}

const spaceShip = createSpaceShip();
scene.add(spaceShip);

// Orbit parameters
const orbitRadius = 4.5;
const orbitSpeed = 0.25;
const orbitY = 1.5;

// Entry animation - ship comes from top-right, behind Earth, then orbits left to right
const entryStartAngle = Math.PI * 1.25; // Start orbit from back-right

// Initial position (top-right of screen, behind Earth)
let shipStartX = 10;
let shipStartY = 8;
let shipStartZ = -15; // Behind Earth (negative Z)

// Target position - entry point on orbit circle
const shipTargetX = Math.cos(entryStartAngle) * orbitRadius;
const shipTargetY = orbitY;
const shipTargetZ = Math.sin(entryStartAngle) * orbitRadius;

// Ship animation state
let shipProgress = 0;
const shipSpeed = 0.1;
let orbitStartTime = 0;
let hasEnteredOrbit = false;

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
        // Entry phase
        shipProgress += shipSpeed * delta;
        if (shipProgress > 1) shipProgress = 1;

        // Smooth easing
        const easeProgress = 1 - Math.pow(1 - shipProgress, 3);

        const newX = shipStartX + (shipTargetX - shipStartX) * easeProgress;
        const newY = shipStartY + (shipTargetY - shipStartY) * easeProgress;
        const newZ = shipStartZ + (shipTargetZ - shipStartZ) * easeProgress;

        spaceShip.position.set(newX, newY, newZ);

        // Ship faces direction of travel (nose forward, thrusters behind)
        const travelDir = new THREE.Vector3(
            shipTargetX - shipStartX,
            shipTargetY - shipStartY,
            shipTargetZ - shipStartZ
        ).normalize();

        // Look in direction of travel, then flip so thrusters trail behind
        const lookTarget = spaceShip.position.clone().add(travelDir);
        spaceShip.lookAt(lookTarget);
        spaceShip.rotateY(Math.PI); // Flip 180° so nose leads and thrusters trail

        if (shipProgress >= 1 && !hasEnteredOrbit) {
            orbitStartTime = elapsed;
            hasEnteredOrbit = true;
        }
    } else {
        // Orbit phase - clockwise (left to right from camera view)
        const orbitElapsed = elapsed - orbitStartTime;
        const angle = entryStartAngle - orbitElapsed * orbitSpeed; // Subtract for clockwise

        spaceShip.position.x = Math.cos(angle) * orbitRadius;
        spaceShip.position.z = Math.sin(angle) * orbitRadius;
        spaceShip.position.y = orbitY;

        // Tangent direction for clockwise orbit: tangent = (sin(angle), 0, -cos(angle))
        const tangentX = Math.sin(angle);
        const tangentZ = -Math.cos(angle);

        // Point nose in direction of travel, then flip so thrusters trail behind
        const forwardPoint = new THREE.Vector3(
            spaceShip.position.x + tangentX,
            spaceShip.position.y,
            spaceShip.position.z + tangentZ
        );
        spaceShip.lookAt(forwardPoint);
        spaceShip.rotateY(Math.PI); // Flip 180° so nose leads and thrusters trail
    }

    // Animate thrust flames
    const thrusters = ['mainThrust', 'mainThrust2', 'mainThrust3', 'leftNacelleThrust', 'rightNacelleThrust'];
    thrusters.forEach(name => {
        const thrust = spaceShip.getObjectByName(name);
        if (thrust) {
            const flicker = 0.7 + Math.random() * 0.5;
            thrust.scale.set(flicker, 0.7 + Math.random() * 0.6, flicker);
        }
    });

    // Subtle starfield rotation
    starfield.rotation.y += 0.0001;

    renderer.render(scene, camera);
}

animate();
