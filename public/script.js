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

// Create Earth with continents texture
function createEarthTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Ocean base
    ctx.fillStyle = '#1a4d7c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw continents (simplified shapes)
    ctx.fillStyle = '#2d5a27';

    // North America
    ctx.beginPath();
    ctx.moveTo(150, 100);
    ctx.lineTo(250, 80);
    ctx.lineTo(280, 120);
    ctx.lineTo(300, 180);
    ctx.lineTo(260, 220);
    ctx.lineTo(200, 240);
    ctx.lineTo(140, 220);
    ctx.lineTo(100, 180);
    ctx.lineTo(120, 140);
    ctx.closePath();
    ctx.fill();

    // South America
    ctx.beginPath();
    ctx.moveTo(220, 260);
    ctx.lineTo(260, 280);
    ctx.lineTo(280, 340);
    ctx.lineTo(260, 420);
    ctx.lineTo(220, 450);
    ctx.lineTo(200, 400);
    ctx.lineTo(210, 320);
    ctx.closePath();
    ctx.fill();

    // Europe
    ctx.beginPath();
    ctx.moveTo(480, 100);
    ctx.lineTo(540, 90);
    ctx.lineTo(560, 120);
    ctx.lineTo(540, 160);
    ctx.lineTo(500, 170);
    ctx.lineTo(470, 140);
    ctx.closePath();
    ctx.fill();

    // Africa
    ctx.beginPath();
    ctx.moveTo(480, 180);
    ctx.lineTo(560, 200);
    ctx.lineTo(580, 280);
    ctx.lineTo(560, 360);
    ctx.lineTo(500, 380);
    ctx.lineTo(460, 340);
    ctx.lineTo(450, 260);
    ctx.lineTo(460, 200);
    ctx.closePath();
    ctx.fill();

    // Asia
    ctx.beginPath();
    ctx.moveTo(580, 80);
    ctx.lineTo(750, 100);
    ctx.lineTo(820, 140);
    ctx.lineTo(840, 200);
    ctx.lineTo(780, 240);
    ctx.lineTo(700, 260);
    ctx.lineTo(620, 240);
    ctx.lineTo(580, 180);
    ctx.lineTo(560, 120);
    ctx.closePath();
    ctx.fill();

    // India
    ctx.beginPath();
    ctx.moveTo(680, 260);
    ctx.lineTo(720, 280);
    ctx.lineTo(700, 340);
    ctx.lineTo(660, 320);
    ctx.closePath();
    ctx.fill();

    // Australia
    ctx.beginPath();
    ctx.moveTo(820, 320);
    ctx.lineTo(900, 340);
    ctx.lineTo(920, 400);
    ctx.lineTo(880, 420);
    ctx.lineTo(820, 400);
    ctx.lineTo(800, 360);
    ctx.closePath();
    ctx.fill();

    // North Pole ice cap
    const northPoleGradient = ctx.createRadialGradient(512, 0, 0, 512, 0, 120);
    northPoleGradient.addColorStop(0, '#ffffff');
    northPoleGradient.addColorStop(0.5, '#e8f4f8');
    northPoleGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = northPoleGradient;
    ctx.fillRect(0, 0, canvas.width, 80);

    // South Pole / Antarctica ice cap
    const southPoleGradient = ctx.createRadialGradient(512, 512, 0, 512, 512, 140);
    southPoleGradient.addColorStop(0, '#ffffff');
    southPoleGradient.addColorStop(0.4, '#e8f4f8');
    southPoleGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = southPoleGradient;
    ctx.fillRect(0, 440, canvas.width, 72);

    // Add some terrain variation
    ctx.fillStyle = '#3d6a37';
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * canvas.width;
        const y = 60 + Math.random() * (canvas.height - 120); // Avoid poles
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 15 + 3, 0, Math.PI * 2);
        ctx.fill();
    }

    return new THREE.CanvasTexture(canvas);
}

// Create cloud texture
function createCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Transparent base
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw cloud patches
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';

    for (let i = 0; i < 80; i++) {
        const x = Math.random() * canvas.width;
        const y = 30 + Math.random() * (canvas.height - 60);
        const width = 40 + Math.random() * 100;
        const height = 20 + Math.random() * 40;

        ctx.beginPath();
        ctx.ellipse(x, y, width, height, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }

    // Add some wispy clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < 40; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const width = 60 + Math.random() * 150;
        const height = 10 + Math.random() * 25;

        ctx.beginPath();
        ctx.ellipse(x, y, width, height, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }

    return new THREE.CanvasTexture(canvas);
}

const earthTexture = createEarthTexture();
const earthGeometry = new THREE.SphereGeometry(2, 64, 64);
const earthMaterial = new THREE.MeshPhongMaterial({
    map: earthTexture,
    shininess: 10,
    specular: 0x333333
});
const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);

// Cloud layer
const cloudTexture = createCloudTexture();
const cloudGeometry = new THREE.SphereGeometry(2.02, 64, 64);
const cloudMaterial = new THREE.MeshPhongMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.8,
    depthWrite: false
});
const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
scene.add(clouds);

// Atmosphere glow
const atmosphereGeometry = new THREE.SphereGeometry(2.08, 64, 64);
const atmosphereMaterial = new THREE.MeshPhongMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide
});
const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
scene.add(atmosphere);

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

        // Look in direction of travel
        const lookTarget = spaceShip.position.clone().add(travelDir);
        spaceShip.lookAt(lookTarget);

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

        // Point nose in direction of travel
        const forwardPoint = new THREE.Vector3(
            spaceShip.position.x + tangentX,
            spaceShip.position.y,
            spaceShip.position.z + tangentZ
        );
        spaceShip.lookAt(forwardPoint);
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
