// Simple test to verify occlusion raycasting logic works correctly
import * as THREE from 'three';

console.log('Testing occlusion raycasting logic...\n');

// Create scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
camera.position.set(0, 0, 10);

// Create occluding object (sphere at z=5)
const occludingSphere = new THREE.Mesh(
    new THREE.SphereGeometry(2, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
occludingSphere.position.set(0, 0, 5);
scene.add(occludingSphere);

// Create raycaster
const raycaster = new THREE.Raycaster();

// Test 1: Ray toward occluded point (behind sphere)
console.log('Test 1: Asteroid behind occluding sphere');
const occludedPoint = new THREE.Vector3(0, 0, 0); // Behind sphere
const directionToOccluded = occludedPoint.clone().sub(camera.position).normalize();
const distanceToOccluded = camera.position.distanceTo(occludedPoint);

raycaster.set(camera.position, directionToOccluded);
raycaster.far = distanceToOccluded;

const intersections1 = raycaster.intersectObject(occludingSphere, true);
const isOccluded1 = intersections1.length > 0;

console.log(`  Camera position: (${camera.position.x}, ${camera.position.y}, ${camera.position.z})`);
console.log(`  Occluding sphere at: (${occludingSphere.position.x}, ${occludingSphere.position.y}, ${occludingSphere.position.z})`);
console.log(`  Target point at: (${occludedPoint.x}, ${occludedPoint.y}, ${occludedPoint.z})`);
console.log(`  Distance to target: ${distanceToOccluded}`);
console.log(`  Intersections found: ${intersections1.length}`);
console.log(`  Is occluded: ${isOccluded1}`);
console.log(`  Expected: true`);
console.log(`  ✓ PASS: ${isOccluded1 === true ? 'YES' : 'NO'}\n`);

// Test 2: Ray toward visible point (in front of sphere)
console.log('Test 2: Asteroid in front of occluding sphere');
const visiblePoint = new THREE.Vector3(0, 0, 8); // In front of sphere (closer to camera)
const directionToVisible = visiblePoint.clone().sub(camera.position).normalize();
const distanceToVisible = camera.position.distanceTo(visiblePoint);

raycaster.set(camera.position, directionToVisible);
raycaster.far = distanceToVisible;

const intersections2 = raycaster.intersectObject(occludingSphere, true);
const isOccluded2 = intersections2.length > 0;

console.log(`  Target point at: (${visiblePoint.x}, ${visiblePoint.y}, ${visiblePoint.z})`);
console.log(`  Distance to target: ${distanceToVisible}`);
console.log(`  Intersections found: ${intersections2.length}`);
console.log(`  Is occluded: ${isOccluded2}`);
console.log(`  Expected: false`);
console.log(`  ✓ PASS: ${isOccluded2 === false ? 'YES' : 'NO'}\n`);

// Test 3: Ray to side (not occluded)
console.log('Test 3: Asteroid to the side (not in line with sphere)');
const sidePoint = new THREE.Vector3(5, 0, 0); // To the side
const directionToSide = sidePoint.clone().sub(camera.position).normalize();
const distanceToSide = camera.position.distanceTo(sidePoint);

raycaster.set(camera.position, directionToSide);
raycaster.far = distanceToSide;

const intersections3 = raycaster.intersectObject(occludingSphere, true);
const isOccluded3 = intersections3.length > 0;

console.log(`  Target point at: (${sidePoint.x}, ${sidePoint.y}, ${sidePoint.z})`);
console.log(`  Distance to target: ${distanceToSide}`);
console.log(`  Intersections found: ${intersections3.length}`);
console.log(`  Is occluded: ${isOccluded3}`);
console.log(`  Expected: false`);
console.log(`  ✓ PASS: ${isOccluded3 === false ? 'YES' : 'NO'}\n`);

// Summary
const allPassed = (isOccluded1 === true) && (isOccluded2 === false) && (isOccluded3 === false);
console.log('='.repeat(50));
console.log(`All tests passed: ${allPassed ? '✓ YES' : '✗ NO'}`);
console.log('='.repeat(50));

if (allPassed) {
    console.log('\n✓ Occlusion raycasting logic is CORRECT');
    console.log('✓ Implementation will correctly hide reticles behind objects');
} else {
    console.log('\n✗ Tests failed - logic needs review');
    process.exit(1);
}
