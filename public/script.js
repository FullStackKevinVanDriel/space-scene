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

// Rotation state from API
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
        // Random positions in a sphere around the scene
        starPositions[i] = (Math.random() - 0.5) * 200;     // x
        starPositions[i + 1] = (Math.random() - 0.5) * 200; // y
        starPositions[i + 2] = (Math.random() - 0.5) * 200; // z
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

// Create Millennium Falcon-style space ship
function createSpaceShip() {
    const shipGroup = new THREE.Group();

    const grayMaterial = new THREE.MeshBasicMaterial({ color: 0x888888 });
    const darkGrayMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
    const lightGrayMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });

    // Main disc body (Millennium Falcon style)
    const discGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
    const disc = new THREE.Mesh(discGeometry, grayMaterial);
    disc.rotation.x = Math.PI / 2;
    shipGroup.add(disc);

    // Front mandibles (the forked front)
    const mandibleGeometry = new THREE.BoxGeometry(0.15, 0.12, 0.6);
    const leftMandible = new THREE.Mesh(mandibleGeometry, darkGrayMaterial);
    leftMandible.position.set(-0.25, 0, -0.9);
    shipGroup.add(leftMandible);

    const rightMandible = new THREE.Mesh(mandibleGeometry, darkGrayMaterial);
    rightMandible.position.set(0.25, 0, -0.9);
    shipGroup.add(rightMandible);

    // Cockpit (offset to the right like the Falcon)
    const cockpitGeometry = new THREE.SphereGeometry(0.25, 12, 12);
    const cockpit = new THREE.Mesh(cockpitGeometry, lightGrayMaterial);
    cockpit.position.set(0.5, 0.15, -0.4);
    cockpit.scale.set(1, 0.6, 1.2);
    shipGroup.add(cockpit);

    // Rear section (engine block)
    const rearGeometry = new THREE.BoxGeometry(0.6, 0.25, 0.3);
    const rear = new THREE.Mesh(rearGeometry, darkGrayMaterial);
    rear.position.set(0, 0, 0.7);
    shipGroup.add(rear);

    // Top details (sensor dish, etc)
    const dishGeometry = new THREE.CylinderGeometry(0.15, 0.2, 0.08, 12);
    const dish = new THREE.Mesh(dishGeometry, lightGrayMaterial);
    dish.position.set(-0.3, 0.2, 0);
    shipGroup.add(dish);

    // Eyeballs! (on top of the cockpit area)
    const eyeGeometry = new THREE.SphereGeometry(0.12, 8, 8);
    const eyeWhiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

    // Left eye
    const leftEye = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial);
    leftEye.position.set(-0.12, 0.3, -0.5);
    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(-0.12, 0.3, -0.62);
    shipGroup.add(leftEye);
    shipGroup.add(leftPupil);

    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial);
    rightEye.position.set(0.12, 0.3, -0.5);
    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    rightPupil.position.set(0.12, 0.3, -0.62);
    shipGroup.add(rightEye);
    shipGroup.add(rightPupil);

    // TOP HAT!
    const hatBrimGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.03, 16);
    const hatMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const hatBrim = new THREE.Mesh(hatBrimGeometry, hatMaterial);
    hatBrim.position.set(0, 0.42, -0.3);
    shipGroup.add(hatBrim);

    const hatTopGeometry = new THREE.CylinderGeometry(0.15, 0.17, 0.35, 16);
    const hatTop = new THREE.Mesh(hatTopGeometry, hatMaterial);
    hatTop.position.set(0, 0.62, -0.3);
    shipGroup.add(hatTop);

    // Hat band (classy touch)
    const hatBandGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16);
    const hatBandMaterial = new THREE.MeshBasicMaterial({ color: 0x8B0000 });
    const hatBand = new THREE.Mesh(hatBandGeometry, hatBandMaterial);
    hatBand.position.set(0, 0.48, -0.3);
    shipGroup.add(hatBand);

    // Main thrust (rear) - yellow flames
    const thrustGeometry = new THREE.ConeGeometry(0.12, 0.5, 8);
    const thrustMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd00 });

    const thrust1 = new THREE.Mesh(thrustGeometry, thrustMaterial);
    thrust1.rotation.x = -Math.PI / 2;
    thrust1.position.set(-0.15, 0, 1.0);
    thrust1.name = 'mainThrust';
    shipGroup.add(thrust1);

    const thrust2 = new THREE.Mesh(thrustGeometry, thrustMaterial);
    thrust2.rotation.x = -Math.PI / 2;
    thrust2.position.set(0.15, 0, 1.0);
    thrust2.name = 'mainThrust2';
    shipGroup.add(thrust2);

    // Corrective thrusters (front, smaller)
    const smallThrustGeometry = new THREE.ConeGeometry(0.04, 0.12, 6);
    const smallThrustMaterial = new THREE.MeshBasicMaterial({ color: 0x44aaff });

    const leftFrontThrust = new THREE.Mesh(smallThrustGeometry, smallThrustMaterial);
    leftFrontThrust.rotation.x = Math.PI / 2;
    leftFrontThrust.position.set(-0.25, 0, -1.15);
    leftFrontThrust.name = 'leftThrust';
    shipGroup.add(leftFrontThrust);

    const rightFrontThrust = new THREE.Mesh(smallThrustGeometry, smallThrustMaterial);
    rightFrontThrust.rotation.x = Math.PI / 2;
    rightFrontThrust.position.set(0.25, 0, -1.15);
    rightFrontThrust.name = 'rightThrust';
    shipGroup.add(rightFrontThrust);

    return shipGroup;
}

const spaceShip = createSpaceShip();
scene.add(spaceShip);

// Initial position for space ship (top-left, flying in)
let shipStartX = -15;
let shipStartY = 10;
let shipStartZ = -5;
spaceShip.position.set(shipStartX, shipStartY, shipStartZ);

// Target position near Earth
const shipTargetX = 4;
const shipTargetY = 2;
const shipTargetZ = 0;

// Ship animation progress
let shipProgress = 0;
const shipSpeed = 0.15;

// Position camera
camera.position.z = 8;
camera.position.y = 2;
camera.lookAt(0, 0, 0); // Look at Earth center

// Poll API for rotation state
async function fetchRotationState() {
    try {
        const response = await fetch('/api/state');
        if (response.ok) {
            const data = await response.json();
            if (data.speed !== undefined) {
                rotationSpeed = data.speed;
            }
            if (data.direction !== undefined) {
                // Convert "cw"/"ccw" to 1/-1 for multiplication
                rotationDirection = data.direction === 'cw' ? 1 : -1;
            }
        }
    } catch (error) {
        console.log('API not available, using default rotation values');
    }
}

// Initial fetch and set up polling every 3 seconds
fetchRotationState();
setInterval(fetchRotationState, 3000);

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

    // Rotate Earth based on API state (frame-rate independent)
    earth.rotation.y += rotationSpeed * rotationDirection * delta;
    earthSolid.rotation.y = earth.rotation.y;

    // Slight tilt rotation
    earth.rotation.x = 0.2;
    earthSolid.rotation.x = 0.2;

    // Animate space ship flying in from top-left
    if (shipProgress < 1) {
        shipProgress += shipSpeed * delta;
        if (shipProgress > 1) shipProgress = 1;

        // Smooth easing
        const easeProgress = 1 - Math.pow(1 - shipProgress, 3);

        const newX = shipStartX + (shipTargetX - shipStartX) * easeProgress;
        const newY = shipStartY + (shipTargetY - shipStartY) * easeProgress;
        const newZ = shipStartZ + (shipTargetZ - shipStartZ) * easeProgress;

        // Calculate velocity direction for orientation
        const velocity = new THREE.Vector3(
            newX - spaceShip.position.x,
            newY - spaceShip.position.y,
            newZ - spaceShip.position.z
        );

        spaceShip.position.set(newX, newY, newZ);

        // Point ship in direction of travel (forward)
        if (velocity.length() > 0.001) {
            const targetPos = spaceShip.position.clone().add(velocity.normalize());
            spaceShip.lookAt(targetPos);
        }
    } else {
        // Once arrived, orbit around Earth
        const orbitTime = clock.getElapsedTime();
        const orbitRadius = 4;
        const orbitSpeed = 0.3;
        const orbitY = 2;

        // Current position on orbit
        const angle = orbitTime * orbitSpeed;
        spaceShip.position.x = Math.cos(angle) * orbitRadius;
        spaceShip.position.z = Math.sin(angle) * orbitRadius;
        spaceShip.position.y = orbitY;

        // Calculate tangent direction (derivative of circle position)
        // Reversed to make ship go forward
        const tangentX = Math.sin(angle);
        const tangentZ = -Math.cos(angle);

        // Point ship along tangent (forward direction of travel)
        const forwardPoint = new THREE.Vector3(
            spaceShip.position.x + tangentX,
            spaceShip.position.y,
            spaceShip.position.z + tangentZ
        );
        spaceShip.lookAt(forwardPoint);
    }

    // Animate thrust flames (flicker effect)
    const mainThrust = spaceShip.getObjectByName('mainThrust');
    const mainThrust2 = spaceShip.getObjectByName('mainThrust2');
    const leftThrust = spaceShip.getObjectByName('leftThrust');
    const rightThrust = spaceShip.getObjectByName('rightThrust');

    if (mainThrust) {
        const flicker = 0.8 + Math.random() * 0.4;
        mainThrust.scale.set(flicker, 0.8 + Math.random() * 0.5, flicker);
    }
    if (mainThrust2) {
        const flicker2 = 0.8 + Math.random() * 0.4;
        mainThrust2.scale.set(flicker2, 0.8 + Math.random() * 0.5, flicker2);
    }
    if (leftThrust && rightThrust) {
        const smallFlicker = 0.7 + Math.random() * 0.6;
        leftThrust.scale.set(smallFlicker, smallFlicker, smallFlicker);
        rightThrust.scale.set(smallFlicker, smallFlicker, smallFlicker);
    }

    // Subtle starfield rotation for depth effect
    starfield.rotation.y += 0.0001;

    renderer.render(scene, camera);
}

// Start animation
animate();
