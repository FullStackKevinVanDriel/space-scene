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

// Rotation state
let rotationSpeed = 0.05;
let rotationDirection = 1; // 1 for clockwise, -1 for counter-clockwise

// Create solid Earth with wireframe overlay
const earthGeometry = new THREE.SphereGeometry(2, 32, 32);

// Solid inner sphere (dark blue)
const earthSolidMaterial = new THREE.MeshBasicMaterial({
    color: 0x112244
});
const earthSolid = new THREE.Mesh(earthGeometry, earthSolidMaterial);
scene.add(earthSolid);

// Wireframe overlay (lighter blue)
const earthWireMaterial = new THREE.MeshBasicMaterial({
    color: 0x4488ff,
    wireframe: true
});
const earth = new THREE.Mesh(earthGeometry, earthWireMaterial);
scene.add(earth);

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

// Create realistic starship
function createSpaceShip() {
    const shipGroup = new THREE.Group();

    const hullMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 });
    const darkHullMaterial = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const accentMaterial = new THREE.MeshBasicMaterial({ color: 0x888888 });
    const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x66ccff });

    // Main hull - sleek elongated body
    const hullGeometry = new THREE.CylinderGeometry(0.3, 0.5, 2.0, 12);
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.rotation.x = Math.PI / 2;
    shipGroup.add(hull);

    // Nose cone
    const noseGeometry = new THREE.ConeGeometry(0.3, 0.8, 12);
    const nose = new THREE.Mesh(noseGeometry, accentMaterial);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, -1.4);
    shipGroup.add(nose);

    // Cockpit window
    const cockpitGeometry = new THREE.SphereGeometry(0.18, 8, 8);
    const cockpit = new THREE.Mesh(cockpitGeometry, windowMaterial);
    cockpit.position.set(0, 0.25, -0.8);
    cockpit.scale.set(1, 0.5, 1.5);
    shipGroup.add(cockpit);

    // Wing struts
    const wingGeometry = new THREE.BoxGeometry(2.0, 0.05, 0.4);
    const wings = new THREE.Mesh(wingGeometry, darkHullMaterial);
    wings.position.set(0, 0, 0.2);
    shipGroup.add(wings);

    // Wing tips
    const wingTipGeometry = new THREE.BoxGeometry(0.3, 0.08, 0.6);
    const leftWingTip = new THREE.Mesh(wingTipGeometry, accentMaterial);
    leftWingTip.position.set(-1.0, 0, 0.3);
    shipGroup.add(leftWingTip);

    const rightWingTip = new THREE.Mesh(wingTipGeometry, accentMaterial);
    rightWingTip.position.set(1.0, 0, 0.3);
    shipGroup.add(rightWingTip);

    // Engine nacelles
    const nacelleGeometry = new THREE.CylinderGeometry(0.15, 0.18, 0.8, 8);

    const leftNacelle = new THREE.Mesh(nacelleGeometry, darkHullMaterial);
    leftNacelle.rotation.x = Math.PI / 2;
    leftNacelle.position.set(-0.5, -0.1, 0.8);
    shipGroup.add(leftNacelle);

    const rightNacelle = new THREE.Mesh(nacelleGeometry, darkHullMaterial);
    rightNacelle.rotation.x = Math.PI / 2;
    rightNacelle.position.set(0.5, -0.1, 0.8);
    shipGroup.add(rightNacelle);

    // Engine block (rear)
    const engineBlockGeometry = new THREE.BoxGeometry(0.6, 0.3, 0.4);
    const engineBlock = new THREE.Mesh(engineBlockGeometry, darkHullMaterial);
    engineBlock.position.set(0, 0, 1.1);
    shipGroup.add(engineBlock);

    // Main thrusters (3 engines)
    const thrustGeometry = new THREE.ConeGeometry(0.1, 0.6, 8);
    const thrustMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd00 });

    const thrust1 = new THREE.Mesh(thrustGeometry, thrustMaterial);
    thrust1.rotation.x = -Math.PI / 2;
    thrust1.position.set(-0.2, 0, 1.4);
    thrust1.name = 'mainThrust';
    shipGroup.add(thrust1);

    const thrust2 = new THREE.Mesh(thrustGeometry, thrustMaterial);
    thrust2.rotation.x = -Math.PI / 2;
    thrust2.position.set(0, 0, 1.4);
    thrust2.name = 'mainThrust2';
    shipGroup.add(thrust2);

    const thrust3 = new THREE.Mesh(thrustGeometry, thrustMaterial);
    thrust3.rotation.x = -Math.PI / 2;
    thrust3.position.set(0.2, 0, 1.4);
    thrust3.name = 'mainThrust3';
    shipGroup.add(thrust3);

    // Nacelle thrusters
    const nacelleThrustGeometry = new THREE.ConeGeometry(0.08, 0.4, 6);

    const leftNacelleThrust = new THREE.Mesh(nacelleThrustGeometry, thrustMaterial);
    leftNacelleThrust.rotation.x = -Math.PI / 2;
    leftNacelleThrust.position.set(-0.5, -0.1, 1.3);
    leftNacelleThrust.name = 'leftNacelleThrust';
    shipGroup.add(leftNacelleThrust);

    const rightNacelleThrust = new THREE.Mesh(nacelleThrustGeometry, thrustMaterial);
    rightNacelleThrust.rotation.x = -Math.PI / 2;
    rightNacelleThrust.position.set(0.5, -0.1, 1.3);
    rightNacelleThrust.name = 'rightNacelleThrust';
    shipGroup.add(rightNacelleThrust);

    return shipGroup;
}

const spaceShip = createSpaceShip();
scene.add(spaceShip);

// Orbit parameters
const orbitRadius = 4;
const orbitSpeed = 0.3;
const orbitY = 2;

// Calculate starting angle so ship enters orbit seamlessly from top-left
// Ship comes from top-left (-15, 10, -5) toward orbit position
// We want to start orbit where the entry path would naturally meet the circle
const entryStartAngle = Math.atan2(0, orbitRadius); // Start at angle where z=0, x=orbitRadius

// Initial position for space ship (top-left, flying in toward viewer with flames visible)
let shipStartX = -12;
let shipStartY = 8;
let shipStartZ = -20; // Start behind/far, coming toward viewer

// Target position - entry point on orbit circle
const shipTargetX = Math.cos(entryStartAngle) * orbitRadius;
const shipTargetY = orbitY;
const shipTargetZ = Math.sin(entryStartAngle) * orbitRadius;

// Ship animation progress
let shipProgress = 0;
const shipSpeed = 0.12;
let orbitStartTime = 0;

spaceShip.position.set(shipStartX, shipStartY, shipStartZ);

// Position camera
camera.position.z = 10;
camera.position.y = 3;
camera.position.x = 2;
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
        background: rgba(0, 20, 40, 0.8);
        border: 2px solid #4488ff;
        border-radius: 15px;
        padding: 20px 30px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        font-family: 'Courier New', monospace;
        color: #4488ff;
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
    slider.value = '30';
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
    speedDisplay.textContent = 'Speed: 0.03 | Direction: CW';
    speedDisplay.style.cssText = 'font-size: 11px; margin-top: 5px; color: #88aaff;';
    container.appendChild(speedDisplay);

    document.body.appendChild(container);

    // Slider event
    slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        rotationSpeed = Math.abs(value) / 1000;
        rotationDirection = value >= 0 ? 1 : -1;

        const dirText = value === 0 ? 'STOPPED' : (value > 0 ? 'CW' : 'CCW');
        speedDisplay.textContent = `Speed: ${rotationSpeed.toFixed(3)} | Direction: ${dirText}`;

        // Update API
        fetch('/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                speed: rotationSpeed,
                direction: rotationDirection === 1 ? 'cw' : 'ccw'
            })
        }).catch(() => {});
    });

    // Style the slider thumb
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

    // Rotate Earth based on state (frame-rate independent)
    earth.rotation.y += rotationSpeed * rotationDirection * delta;
    earthSolid.rotation.y = earth.rotation.y;

    // Slight tilt
    earth.rotation.x = 0.2;
    earthSolid.rotation.x = 0.2;

    // Animate space ship
    if (shipProgress < 1) {
        // Entry phase - flying in from top-left toward orbit entry point
        shipProgress += shipSpeed * delta;
        if (shipProgress > 1) shipProgress = 1;

        // Smooth easing
        const easeProgress = 1 - Math.pow(1 - shipProgress, 3);

        const newX = shipStartX + (shipTargetX - shipStartX) * easeProgress;
        const newY = shipStartY + (shipTargetY - shipStartY) * easeProgress;
        const newZ = shipStartZ + (shipTargetZ - shipStartZ) * easeProgress;

        spaceShip.position.set(newX, newY, newZ);

        // Calculate direction of travel for orientation
        // Ship should face where it's going (nose forward, thrusters toward viewer during approach)
        const velocity = new THREE.Vector3(
            shipTargetX - shipStartX,
            shipTargetY - shipStartY,
            shipTargetZ - shipStartZ
        ).normalize();

        const lookTarget = spaceShip.position.clone().add(velocity);
        spaceShip.lookAt(lookTarget);

        // Record when we enter orbit
        if (shipProgress >= 1) {
            orbitStartTime = elapsed;
        }
    } else {
        // Orbit phase
        const orbitElapsed = elapsed - orbitStartTime;
        const angle = entryStartAngle + orbitElapsed * orbitSpeed;

        spaceShip.position.x = Math.cos(angle) * orbitRadius;
        spaceShip.position.z = Math.sin(angle) * orbitRadius;
        spaceShip.position.y = orbitY;

        // Calculate tangent for forward-facing orientation
        const tangentX = -Math.sin(angle);
        const tangentZ = Math.cos(angle);

        const forwardPoint = new THREE.Vector3(
            spaceShip.position.x + tangentX,
            spaceShip.position.y,
            spaceShip.position.z + tangentZ
        );
        spaceShip.lookAt(forwardPoint);
    }

    // Animate thrust flames (flicker effect)
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

// Start animation
animate();
