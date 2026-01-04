/**
 * Physics Web Worker Integration Module
 *
 * This file provides the PhysicsWorker manager for the Space Scene game.
 * It offloads collision detection and physics calculations to a separate thread.
 *
 * INTEGRATION INSTRUCTIONS:
 * 1. Include this file in index.html AFTER script.js loads:
 *    <script src="physics-worker-integration.js"></script>
 *
 * 2. Or, copy the PhysicsWorker object into script.js after the SPATIAL_PARTITIONING section
 *
 * 3. Add these calls to integrate with existing code:
 *    - In createAsteroid(): Add `PhysicsWorker.registerAsteroid(asteroidGroup);` before return
 *    - In spawnAngelAsteroid(): Add `PhysicsWorker.registerAsteroid(angelGroup);` before return
 *    - In fireLasers(): Add `PhysicsWorker.registerBolt(bolt);` after adding bolt to laserBolts
 *    - In createExplosion(): Add `PhysicsWorker.registerExplosion(explosionGroup);` before return
 *    - In animate(): Add `PhysicsWorker.update(delta, moon.position);` at the start of gameActive block
 *    - Wrap the existing asteroid/bolt physics loops with: `if (!PhysicsWorker.enabled || !PhysicsWorker.ready) { ... }`
 */

'use strict';

// === PHYSICS WEB WORKER ===
// Offloads collision detection and physics calculations to a separate thread
const PhysicsWorker = {
    worker: null,
    ready: false,
    enabled: true,
    pendingCallbacks: new Map(),
    lastPhysicsResult: null,
    entityIdCounter: 0,
    asteroidIdMap: new Map(), // THREE.Object3D uuid -> worker entity id
    boltIdMap: new Map(),     // THREE.Object3D uuid -> worker entity id
    explosionIdMap: new Map(), // THREE.Object3D uuid -> worker entity id

    // Initialize the physics worker
    init() {
        if (!window.Worker) {
            console.warn('Web Workers not supported, running physics on main thread');
            this.enabled = false;
            return;
        }

        try {
            this.worker = new Worker('worker.js');
            this.worker.onmessage = (e) => this.handleMessage(e);
            this.worker.onerror = (e) => {
                console.error('Physics worker error:', e);
                this.enabled = false;
            };
        } catch (err) {
            console.warn('Failed to initialize physics worker:', err);
            this.enabled = false;
        }
    },

    // Handle messages from the worker
    handleMessage(e) {
        const { type } = e.data;

        switch (type) {
            case 'ready':
                this.ready = true;
                console.log('Physics worker ready');
                // Initialize worker with configuration
                this.worker.postMessage({
                    type: 'init',
                    data: {
                        config: {
                            earthRadius: typeof EARTH_RADIUS !== 'undefined' ? EARTH_RADIUS : 2,
                            moonRadius: typeof MOON_RADIUS !== 'undefined' ? MOON_RADIUS : 0.5,
                            laserMaxDistance: typeof LASER_MAX_DISTANCE !== 'undefined' ? LASER_MAX_DISTANCE : 200
                        }
                    }
                });
                break;

            case 'initialized':
                console.log('Physics worker initialized');
                break;

            case 'physicsUpdate':
                this.lastPhysicsResult = e.data;
                this.processPhysicsResults(e.data);
                break;

            case 'syncComplete':
                console.log('Physics state synchronized');
                break;
        }
    },

    // Process physics results and apply to Three.js objects
    processPhysicsResults(results) {
        // Process asteroid updates
        if (results.asteroids) {
            // Handle collisions first
            for (const collision of results.asteroids.collisions) {
                this.handleAsteroidCollision(collision);
            }

            // Apply position updates to Three.js objects
            for (const update of results.asteroids.updates) {
                const uuid = this.getUuidFromWorkerId(update.id, this.asteroidIdMap);
                if (uuid) {
                    const asteroid = this.findAsteroidByUuid(uuid);
                    if (asteroid) {
                        asteroid.position.set(update.position.x, update.position.y, update.position.z);
                        asteroid.rotation.set(update.rotation.x, update.rotation.y, update.rotation.z);
                    }
                }
            }

            // Remove destroyed asteroids from tracking
            for (const removedId of results.asteroids.removed) {
                const uuid = this.getUuidFromWorkerId(removedId, this.asteroidIdMap);
                if (uuid) {
                    this.asteroidIdMap.forEach((wid, u) => {
                        if (wid === removedId) this.asteroidIdMap.delete(u);
                    });
                }
            }
        }

        // Process bolt updates
        if (results.bolts) {
            // Handle collisions first
            for (const collision of results.bolts.collisions) {
                this.handleBoltCollision(collision);
            }

            // Apply position updates
            for (const update of results.bolts.updates) {
                const uuid = this.getUuidFromWorkerId(update.id, this.boltIdMap);
                if (uuid) {
                    const bolt = this.findBoltByUuid(uuid);
                    if (bolt) {
                        bolt.position.set(update.position.x, update.position.y, update.position.z);
                        bolt.userData.distanceTraveled = update.distanceTraveled;
                    }
                }
            }

            // Remove expired bolts
            for (const removedId of results.bolts.removed) {
                const uuid = this.getUuidFromWorkerId(removedId, this.boltIdMap);
                if (uuid) {
                    const bolt = this.findBoltByUuid(uuid);
                    if (bolt) {
                        scene.remove(bolt);
                        const idx = laserBolts.indexOf(bolt);
                        if (idx !== -1) laserBolts.splice(idx, 1);
                    }
                    this.boltIdMap.forEach((wid, u) => {
                        if (wid === removedId) this.boltIdMap.delete(u);
                    });
                }
            }
        }

        // Process explosion updates
        if (results.explosions) {
            for (const update of results.explosions.updates) {
                const uuid = this.getUuidFromWorkerId(update.id, this.explosionIdMap);
                if (uuid) {
                    const explosion = this.findExplosionByUuid(uuid);
                    if (explosion) {
                        // Update particle positions
                        for (let i = 0; i < update.particles.length && i < explosion.children.length; i++) {
                            const child = explosion.children[i];
                            const pUpdate = update.particles[i];
                            if (child && pUpdate && child.userData.velocity) {
                                child.position.set(pUpdate.position.x, pUpdate.position.y, pUpdate.position.z);
                                if (pUpdate.rotation && child.rotation) {
                                    child.rotation.set(pUpdate.rotation.x, pUpdate.rotation.y, pUpdate.rotation.z);
                                }
                                if (child.material && child.material.opacity !== undefined) {
                                    child.material.opacity = pUpdate.opacity;
                                }
                                if (pUpdate.scale && child.scale) {
                                    child.scale.set(pUpdate.scale, pUpdate.scale, pUpdate.scale);
                                }
                            }
                        }
                        // Update flash intensity
                        if (explosion.userData.flash) {
                            explosion.userData.flash.intensity = update.flashIntensity;
                        }
                    }
                }
            }

            // Remove expired explosions
            for (const expiredId of results.explosions.expired) {
                const uuid = this.getUuidFromWorkerId(expiredId, this.explosionIdMap);
                if (uuid) {
                    const explosion = this.findExplosionByUuid(uuid);
                    if (explosion) {
                        scene.remove(explosion);
                        const idx = explosions.indexOf(explosion);
                        if (idx !== -1) explosions.splice(idx, 1);
                    }
                    this.explosionIdMap.forEach((wid, u) => {
                        if (wid === expiredId) this.explosionIdMap.delete(u);
                    });
                }
            }
        }
    },

    // Handle asteroid collision events
    handleAsteroidCollision(collision) {
        const uuid = this.getUuidFromWorkerId(collision.asteroidId, this.asteroidIdMap);
        const asteroid = uuid ? this.findAsteroidByUuid(uuid) : null;

        if (collision.type === 'asteroid_earth') {
            if (collision.isAngel) {
                // Angel hit Earth - restore health to both
                earthHealth = Math.min(maxEarthHealth, earthHealth + 25);
                moonHealth = Math.min(maxMoonHealth, moonHealth + 25);
                updateHealthDisplay();
                updateMoonHealthDisplay();
                createAngelExplosion(new THREE.Vector3(collision.position.x, collision.position.y, collision.position.z));
                showNotification('+25 HEALTH (EARTH & MOON)!', '#88ffaa');
            } else {
                // Regular asteroid hit Earth
                const damage = Math.ceil(collision.size * 5);
                earthHealth -= damage;
                updateHealthDisplay();
                createExplosion(new THREE.Vector3(collision.position.x, collision.position.y, collision.position.z), collision.size);
            }

            // Remove asteroid from scene and array
            if (asteroid) {
                scene.remove(asteroid);
                const idx = asteroids.indexOf(asteroid);
                if (idx !== -1) asteroids.splice(idx, 1);
                window._asteroidOcclusionState?.delete(asteroid.uuid);
            }

            // Check game over
            if (earthHealth <= 0) {
                earthHealth = 0;
                gameActive = false;
                showGameOver();
            }
        } else if (collision.type === 'asteroid_moon') {
            if (collision.isAngel) {
                // Angel hit Moon - restore health to both
                earthHealth = Math.min(maxEarthHealth, earthHealth + 25);
                moonHealth = Math.min(maxMoonHealth, moonHealth + 25);
                updateHealthDisplay();
                updateMoonHealthDisplay();
                createAngelExplosion(new THREE.Vector3(collision.position.x, collision.position.y, collision.position.z));
                showNotification('+25 HEALTH (EARTH & MOON)!', '#88ffaa');
            } else {
                // Regular asteroid hit Moon
                const damage = Math.ceil(collision.size * 5);
                moonHealth -= damage;
                updateMoonHealthDisplay();
                createExplosion(new THREE.Vector3(collision.position.x, collision.position.y, collision.position.z), collision.size);
            }

            // Remove asteroid from scene and array
            if (asteroid) {
                scene.remove(asteroid);
                const idx = asteroids.indexOf(asteroid);
                if (idx !== -1) asteroids.splice(idx, 1);
                window._asteroidOcclusionState?.delete(asteroid.uuid);
            }

            // Check if Moon destroyed
            if (moonHealth <= 0) {
                moonHealth = 0;
                earthHealth = 0;
                gameActive = false;
                showGameOver();
            }
        }
    },

    // Handle bolt collision events
    handleBoltCollision(collision) {
        const boltUuid = this.getUuidFromWorkerId(collision.boltId, this.boltIdMap);
        const bolt = boltUuid ? this.findBoltByUuid(boltUuid) : null;

        if (collision.type === 'bolt_asteroid') {
            const asteroidUuid = this.getUuidFromWorkerId(collision.asteroidId, this.asteroidIdMap);
            const asteroid = asteroidUuid ? this.findAsteroidByUuid(asteroidUuid) : null;

            // Visual flash on asteroid
            if (asteroid && asteroid.children[0]) {
                const originalEmissive = asteroid.children[0].material.emissive.getHex();
                asteroid.children[0].material.emissive.setHex(0xffff00);
                setTimeout(() => {
                    if (asteroid.parent) {
                        asteroid.children[0].material.emissive.setHex(originalEmissive);
                    }
                }, 100);
            }

            // Create hit spark
            createHitSpark(new THREE.Vector3(collision.position.x, collision.position.y, collision.position.z), asteroid);

            if (collision.destroyed) {
                if (collision.isAngel) {
                    // Angel destroyed - restore health to both
                    earthHealth = Math.min(maxEarthHealth, earthHealth + 25);
                    moonHealth = Math.min(maxMoonHealth, moonHealth + 25);
                    updateHealthDisplay();
                    updateMoonHealthDisplay();
                    createAngelExplosion(new THREE.Vector3(collision.asteroidPosition.x, collision.asteroidPosition.y, collision.asteroidPosition.z));
                } else {
                    // Regular asteroid destroyed - scoring
                    const multiplier = calculateScoreMultiplier(collision.asteroidDistance);
                    const basePoints = Math.ceil(collision.size * 10);
                    const earnedPoints = Math.ceil(basePoints * multiplier);
                    score += earnedPoints;
                    updateScoreDisplay();
                    updateMultiplierDisplay(multiplier);

                    if (multiplier >= 1.5) {
                        showScorePopup(earnedPoints, multiplier, new THREE.Vector3(collision.asteroidPosition.x, collision.asteroidPosition.y, collision.asteroidPosition.z));
                    }

                    laserAmmo += AMMO_REWARD_PER_KILL;
                    updateAmmoDisplay();

                    asteroidsDestroyed++;
                    updateKillCountDisplay();

                    levelAsteroidsRemaining--;

                    if (asteroidsDestroyed % ANGEL_SPAWN_INTERVAL === 0 && (earthHealth < maxEarthHealth || moonHealth < maxMoonHealth)) {
                        spawnAngelAsteroid();
                    }

                    createExplosion(new THREE.Vector3(collision.asteroidPosition.x, collision.asteroidPosition.y, collision.asteroidPosition.z), collision.size);
                    checkLevelComplete();
                }

                // Remove asteroid from scene and array
                if (asteroid) {
                    scene.remove(asteroid);
                    const idx = asteroids.indexOf(asteroid);
                    if (idx !== -1) asteroids.splice(idx, 1);
                    window._asteroidOcclusionState?.delete(asteroid.uuid);
                }
            }

            // Remove bolt
            if (bolt) {
                scene.remove(bolt);
                const idx = laserBolts.indexOf(bolt);
                if (idx !== -1) laserBolts.splice(idx, 1);
            }
        } else if (collision.type === 'bolt_earth') {
            // Laser hit Earth (friendly fire)
            const damage = 2;
            earthHealth -= damage;
            updateHealthDisplay();
            createExplosion(new THREE.Vector3(collision.position.x, collision.position.y, collision.position.z), 0.3);

            if (bolt) {
                scene.remove(bolt);
                const idx = laserBolts.indexOf(bolt);
                if (idx !== -1) laserBolts.splice(idx, 1);
            }

            if (earthHealth <= 0) {
                earthHealth = 0;
                gameActive = false;
                showGameOver();
            }
        } else if (collision.type === 'bolt_moon') {
            // Laser hit Moon (friendly fire)
            const damage = 2;
            moonHealth -= damage;
            updateMoonHealthDisplay();
            createExplosion(new THREE.Vector3(collision.position.x, collision.position.y, collision.position.z), 0.3);

            if (bolt) {
                scene.remove(bolt);
                const idx = laserBolts.indexOf(bolt);
                if (idx !== -1) laserBolts.splice(idx, 1);
            }

            if (moonHealth <= 0) {
                moonHealth = 0;
                earthHealth = 0;
                gameActive = false;
                showGameOver();
            }
        }
    },

    // Generate unique ID for entities
    generateId() {
        return ++this.entityIdCounter;
    },

    // Get UUID from worker ID
    getUuidFromWorkerId(workerId, map) {
        for (const [uuid, wid] of map) {
            if (wid === workerId) return uuid;
        }
        return null;
    },

    // Find asteroid by UUID
    findAsteroidByUuid(uuid) {
        return asteroids.find(a => a.uuid === uuid);
    },

    // Find bolt by UUID
    findBoltByUuid(uuid) {
        return laserBolts.find(b => b.uuid === uuid);
    },

    // Find explosion by UUID
    findExplosionByUuid(uuid) {
        return explosions.find(e => e.uuid === uuid);
    },

    // Register a new asteroid with the worker
    registerAsteroid(asteroid) {
        if (!this.enabled || !this.ready) return;

        const id = this.generateId();
        this.asteroidIdMap.set(asteroid.uuid, id);

        this.worker.postMessage({
            type: 'addAsteroid',
            data: {
                id,
                position: { x: asteroid.position.x, y: asteroid.position.y, z: asteroid.position.z },
                velocity: { x: asteroid.userData.velocity.x, y: asteroid.userData.velocity.y, z: asteroid.userData.velocity.z },
                rotation: { x: asteroid.rotation.x, y: asteroid.rotation.y, z: asteroid.rotation.z },
                rotationSpeed: { x: asteroid.userData.rotationSpeed.x, y: asteroid.userData.rotationSpeed.y, z: asteroid.userData.rotationSpeed.z },
                size: asteroid.userData.size,
                health: asteroid.userData.health,
                maxHealth: asteroid.userData.maxHealth,
                isAngel: asteroid.userData.isAngel || false
            }
        });
    },

    // Register a new bolt with the worker
    registerBolt(bolt) {
        if (!this.enabled || !this.ready) return;

        const id = this.generateId();
        this.boltIdMap.set(bolt.uuid, id);

        this.worker.postMessage({
            type: 'addBolt',
            data: {
                id,
                position: { x: bolt.position.x, y: bolt.position.y, z: bolt.position.z },
                velocity: { x: bolt.userData.velocity.x, y: bolt.userData.velocity.y, z: bolt.userData.velocity.z },
                distanceTraveled: bolt.userData.distanceTraveled
            }
        });
    },

    // Register a new explosion with the worker
    registerExplosion(explosion) {
        if (!this.enabled || !this.ready) return;

        const id = this.generateId();
        this.explosionIdMap.set(explosion.uuid, id);

        const particles = [];
        explosion.children.forEach(child => {
            if (child.userData.velocity) {
                particles.push({
                    position: { x: child.position.x, y: child.position.y, z: child.position.z },
                    velocity: { x: child.userData.velocity.x, y: child.userData.velocity.y, z: child.userData.velocity.z },
                    rotation: child.userData.rotationSpeed ? { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z } : null,
                    rotationSpeed: child.userData.rotationSpeed ? { x: child.userData.rotationSpeed.x, y: child.userData.rotationSpeed.y, z: child.userData.rotationSpeed.z } : null,
                    initialScale: child.userData.initialScale
                });
            }
        });

        this.worker.postMessage({
            type: 'addExplosion',
            data: {
                id,
                createdAt: explosion.userData.createdAt,
                duration: explosion.userData.duration,
                particles
            }
        });
    },

    // Send physics update request
    update(delta, moonPosition) {
        if (!this.enabled || !this.ready) return;

        this.worker.postMessage({
            type: 'update',
            data: {
                delta,
                currentTime: Date.now(),
                moonPosition: { x: moonPosition.x, y: moonPosition.y, z: moonPosition.z }
            }
        });
    },

    // Synchronize full state (for recovery or initial load)
    syncState() {
        if (!this.enabled || !this.ready) return;

        const asteroidData = asteroids.map(a => {
            const id = this.asteroidIdMap.get(a.uuid) || this.generateId();
            this.asteroidIdMap.set(a.uuid, id);
            return {
                id,
                position: { x: a.position.x, y: a.position.y, z: a.position.z },
                velocity: { x: a.userData.velocity.x, y: a.userData.velocity.y, z: a.userData.velocity.z },
                rotation: { x: a.rotation.x, y: a.rotation.y, z: a.rotation.z },
                rotationSpeed: { x: a.userData.rotationSpeed.x, y: a.userData.rotationSpeed.y, z: a.userData.rotationSpeed.z },
                size: a.userData.size,
                health: a.userData.health,
                maxHealth: a.userData.maxHealth,
                isAngel: a.userData.isAngel || false
            };
        });

        const boltData = laserBolts.map(b => {
            const id = this.boltIdMap.get(b.uuid) || this.generateId();
            this.boltIdMap.set(b.uuid, id);
            return {
                id,
                position: { x: b.position.x, y: b.position.y, z: b.position.z },
                velocity: { x: b.userData.velocity.x, y: b.userData.velocity.y, z: b.userData.velocity.z },
                distanceTraveled: b.userData.distanceTraveled
            };
        });

        this.worker.postMessage({
            type: 'syncState',
            data: { asteroids: asteroidData, bolts: boltData, explosions: [] }
        });
    }
};

// Initialize physics worker when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PhysicsWorker.init());
} else {
    PhysicsWorker.init();
}

// Export for use in other scripts
window.PhysicsWorker = PhysicsWorker;
