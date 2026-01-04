/**
 * Physics Web Worker for Space Scene Game
 *
 * Offloads collision detection and physics calculations from the main thread.
 * Uses transferable ArrayBuffers for efficient data transfer.
 *
 * Message Protocol:
 * - init: Initialize physics world with configuration
 * - update: Process physics tick with entity data
 * - addAsteroid/removeAsteroid: Dynamic entity management
 * - addBolt/removeBolt: Laser bolt management
 */

'use strict';

// Physics constants (mirrored from main thread)
const EARTH_RADIUS = 2;
const MOON_RADIUS = 0.5;
const LASER_MAX_DISTANCE = 200;

// Entity storage (ID-keyed for fast lookup)
const asteroids = new Map();
const bolts = new Map();
const explosions = new Map();

// Reusable vector operations (no THREE.js in worker)
const vec3 = {
    create: () => ({ x: 0, y: 0, z: 0 }),
    set: (v, x, y, z) => { v.x = x; v.y = y; v.z = z; return v; },
    copy: (out, a) => { out.x = a.x; out.y = a.y; out.z = a.z; return out; },
    add: (out, a, b) => { out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z; return out; },
    sub: (out, a, b) => { out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out; },
    scale: (out, a, s) => { out.x = a.x * s; out.y = a.y * s; out.z = a.z * s; return out; },
    length: (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),
    normalize: (out, v) => {
        const len = vec3.length(v);
        if (len > 0) {
            const invLen = 1 / len;
            out.x = v.x * invLen;
            out.y = v.y * invLen;
            out.z = v.z * invLen;
        }
        return out;
    },
    distance: (a, b) => {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
};

// Temp vectors for calculations (avoid allocations)
const _tempVec1 = vec3.create();
const _tempVec2 = vec3.create();
const _tempVec3 = vec3.create();

// Current moon position (updated each frame)
let moonPosition = vec3.create();

// Configuration
let config = {
    earthRadius: EARTH_RADIUS,
    moonRadius: MOON_RADIUS,
    laserMaxDistance: LASER_MAX_DISTANCE
};

/**
 * Process asteroid physics for one frame
 * Returns collision events and updated positions
 */
function updateAsteroids(delta) {
    const collisions = [];
    const updates = [];
    const toRemove = [];

    for (const [id, asteroid] of asteroids) {
        // Recalculate direction toward Earth (origin 0,0,0)
        vec3.set(_tempVec1, -asteroid.position.x, -asteroid.position.y, -asteroid.position.z);
        vec3.normalize(_tempVec1, _tempVec1);

        // Preserve original speed
        const speed = vec3.length(asteroid.velocity);
        vec3.scale(asteroid.velocity, _tempVec1, speed);

        // Move asteroid
        vec3.scale(_tempVec2, asteroid.velocity, delta);
        vec3.add(asteroid.position, asteroid.position, _tempVec2);

        // Update rotation
        asteroid.rotation.x += asteroid.rotationSpeed.x * delta;
        asteroid.rotation.y += asteroid.rotationSpeed.y * delta;
        asteroid.rotation.z += asteroid.rotationSpeed.z * delta;

        // Check collision with Earth
        const distanceToEarth = vec3.length(asteroid.position);
        const earthHitRadius = config.earthRadius + asteroid.size * 0.5;

        if (distanceToEarth < earthHitRadius) {
            collisions.push({
                type: 'asteroid_earth',
                asteroidId: id,
                isAngel: asteroid.isAngel,
                size: asteroid.size,
                position: { ...asteroid.position }
            });
            toRemove.push(id);
            continue;
        }

        // Check collision with Moon
        const distanceToMoon = vec3.distance(asteroid.position, moonPosition);
        const moonHitRadius = config.moonRadius + asteroid.size * 0.5;

        if (distanceToMoon < moonHitRadius) {
            collisions.push({
                type: 'asteroid_moon',
                asteroidId: id,
                isAngel: asteroid.isAngel,
                size: asteroid.size,
                position: { ...asteroid.position }
            });
            toRemove.push(id);
            continue;
        }

        // Add to updates
        updates.push({
            id,
            position: { ...asteroid.position },
            rotation: { ...asteroid.rotation }
        });
    }

    // Remove collided asteroids
    for (const id of toRemove) {
        asteroids.delete(id);
    }

    return { collisions, updates, removed: toRemove };
}

/**
 * Process laser bolt physics for one frame
 * Returns collision events and updated positions
 */
function updateBolts(delta) {
    const collisions = [];
    const updates = [];
    const toRemove = [];

    for (const [id, bolt] of bolts) {
        // Move bolt
        vec3.scale(_tempVec1, bolt.velocity, delta);
        vec3.add(bolt.position, bolt.position, _tempVec1);
        bolt.distanceTraveled += vec3.length(_tempVec1);

        let hitSomething = false;

        // Check collision with asteroids
        for (const [asteroidId, asteroid] of asteroids) {
            const distance = vec3.distance(bolt.position, asteroid.position);
            const hitRadius = asteroid.size + 0.5;

            if (distance < hitRadius) {
                // Damage asteroid
                asteroid.health--;

                collisions.push({
                    type: 'bolt_asteroid',
                    boltId: id,
                    asteroidId,
                    destroyed: asteroid.health <= 0,
                    isAngel: asteroid.isAngel,
                    size: asteroid.size,
                    asteroidDistance: vec3.length(asteroid.position),
                    position: { ...bolt.position },
                    asteroidPosition: { ...asteroid.position }
                });

                if (asteroid.health <= 0) {
                    asteroids.delete(asteroidId);
                }

                hitSomething = true;
                toRemove.push(id);
                break;
            }
        }

        // Check collision with Earth (friendly fire)
        if (!hitSomething) {
            const distanceToEarth = vec3.length(bolt.position);
            if (distanceToEarth < config.earthRadius + 0.3) {
                collisions.push({
                    type: 'bolt_earth',
                    boltId: id,
                    position: { ...bolt.position }
                });
                hitSomething = true;
                toRemove.push(id);
            }
        }

        // Check collision with Moon (friendly fire)
        if (!hitSomething) {
            const distanceToMoon = vec3.distance(bolt.position, moonPosition);
            if (distanceToMoon < config.moonRadius + 0.3) {
                collisions.push({
                    type: 'bolt_moon',
                    boltId: id,
                    position: { ...bolt.position }
                });
                hitSomething = true;
                toRemove.push(id);
            }
        }

        // Remove if traveled too far
        if (!hitSomething && bolt.distanceTraveled > config.laserMaxDistance) {
            toRemove.push(id);
        }

        // Add to updates if still active
        if (!hitSomething && bolt.distanceTraveled <= config.laserMaxDistance) {
            updates.push({
                id,
                position: { ...bolt.position },
                distanceTraveled: bolt.distanceTraveled
            });
        }
    }

    // Remove expired/hit bolts
    for (const id of toRemove) {
        bolts.delete(id);
    }

    return { collisions, updates, removed: toRemove };
}

/**
 * Process explosion particle physics
 * Returns updated positions and expired explosions
 */
function updateExplosions(delta, currentTime) {
    const updates = [];
    const expired = [];

    for (const [id, explosion] of explosions) {
        const age = currentTime - explosion.createdAt;
        const progress = age / explosion.duration;

        if (progress >= 1) {
            expired.push(id);
            explosions.delete(id);
            continue;
        }

        // Update particle positions
        const particleUpdates = [];
        for (let i = 0; i < explosion.particles.length; i++) {
            const particle = explosion.particles[i];

            // Apply velocity
            vec3.scale(_tempVec1, particle.velocity, delta);
            vec3.add(particle.position, particle.position, _tempVec1);

            // Update rotation if present
            if (particle.rotationSpeed) {
                particle.rotation.x += particle.rotationSpeed.x * delta;
                particle.rotation.y += particle.rotationSpeed.y * delta;
                particle.rotation.z += particle.rotationSpeed.z * delta;
            }

            particleUpdates.push({
                position: { ...particle.position },
                rotation: particle.rotation ? { ...particle.rotation } : null,
                scale: particle.initialScale * (1 + progress * 3),
                opacity: 1 - progress
            });
        }

        updates.push({
            id,
            progress,
            flashIntensity: 3 * (1 - progress),
            particles: particleUpdates
        });
    }

    return { updates, expired };
}

/**
 * Main physics update - processes all entities
 */
function runPhysicsStep(delta, currentTime) {
    const asteroidResults = updateAsteroids(delta);
    const boltResults = updateBolts(delta);
    const explosionResults = updateExplosions(delta, currentTime);

    return {
        type: 'physicsUpdate',
        asteroids: asteroidResults,
        bolts: boltResults,
        explosions: explosionResults,
        stats: {
            asteroidCount: asteroids.size,
            boltCount: bolts.size,
            explosionCount: explosions.size
        }
    };
}

/**
 * Add asteroid to physics simulation
 */
function addAsteroid(data) {
    asteroids.set(data.id, {
        position: { x: data.position.x, y: data.position.y, z: data.position.z },
        velocity: { x: data.velocity.x, y: data.velocity.y, z: data.velocity.z },
        rotation: { x: data.rotation.x, y: data.rotation.y, z: data.rotation.z },
        rotationSpeed: { x: data.rotationSpeed.x, y: data.rotationSpeed.y, z: data.rotationSpeed.z },
        size: data.size,
        health: data.health,
        maxHealth: data.maxHealth,
        isAngel: data.isAngel || false
    });
}

/**
 * Add laser bolt to physics simulation
 */
function addBolt(data) {
    bolts.set(data.id, {
        position: { x: data.position.x, y: data.position.y, z: data.position.z },
        velocity: { x: data.velocity.x, y: data.velocity.y, z: data.velocity.z },
        distanceTraveled: data.distanceTraveled || 0
    });
}

/**
 * Add explosion to physics simulation
 */
function addExplosion(data) {
    const particles = data.particles.map(p => ({
        position: { x: p.position.x, y: p.position.y, z: p.position.z },
        velocity: { x: p.velocity.x, y: p.velocity.y, z: p.velocity.z },
        rotation: p.rotation ? { x: p.rotation.x, y: p.rotation.y, z: p.rotation.z } : null,
        rotationSpeed: p.rotationSpeed ? { x: p.rotationSpeed.x, y: p.rotationSpeed.y, z: p.rotationSpeed.z } : null,
        initialScale: p.initialScale
    }));

    explosions.set(data.id, {
        createdAt: data.createdAt,
        duration: data.duration,
        particles
    });
}

/**
 * Handle incoming messages from main thread
 */
self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'init':
            // Initialize physics world with configuration
            if (data.config) {
                config = { ...config, ...data.config };
            }
            self.postMessage({ type: 'initialized', success: true });
            break;

        case 'update':
            // Update moon position for collision detection
            if (data.moonPosition) {
                moonPosition.x = data.moonPosition.x;
                moonPosition.y = data.moonPosition.y;
                moonPosition.z = data.moonPosition.z;
            }

            // Run physics step
            const result = runPhysicsStep(data.delta, data.currentTime);
            self.postMessage(result);
            break;

        case 'addAsteroid':
            addAsteroid(data);
            break;

        case 'removeAsteroid':
            asteroids.delete(data.id);
            break;

        case 'addBolt':
            addBolt(data);
            break;

        case 'removeBolt':
            bolts.delete(data.id);
            break;

        case 'addExplosion':
            addExplosion(data);
            break;

        case 'removeExplosion':
            explosions.delete(data.id);
            break;

        case 'syncState':
            // Full state sync (used for initial load or recovery)
            asteroids.clear();
            bolts.clear();
            explosions.clear();

            if (data.asteroids) {
                for (const asteroid of data.asteroids) {
                    addAsteroid(asteroid);
                }
            }
            if (data.bolts) {
                for (const bolt of data.bolts) {
                    addBolt(bolt);
                }
            }
            if (data.explosions) {
                for (const explosion of data.explosions) {
                    addExplosion(explosion);
                }
            }
            self.postMessage({ type: 'syncComplete', success: true });
            break;

        case 'getStats':
            self.postMessage({
                type: 'stats',
                asteroidCount: asteroids.size,
                boltCount: bolts.size,
                explosionCount: explosions.size
            });
            break;

        default:
            console.warn('Unknown message type:', type);
    }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
