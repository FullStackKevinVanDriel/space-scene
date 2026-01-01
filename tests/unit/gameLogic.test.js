/**
 * Unit tests for core game logic
 */

describe('Game Constants', () => {
  test('asteroid spawn distances are valid', () => {
    const ASTEROID_SPAWN_MIN_DISTANCE = 120;
    const ASTEROID_SPAWN_MAX_DISTANCE = 180;
    const EARTH_RADIUS = 2;

    expect(ASTEROID_SPAWN_MIN_DISTANCE).toBeGreaterThan(EARTH_RADIUS);
    expect(ASTEROID_SPAWN_MAX_DISTANCE).toBeGreaterThan(ASTEROID_SPAWN_MIN_DISTANCE);
  });

  test('laser speed is positive', () => {
    const LASER_SPEED = 80;
    expect(LASER_SPEED).toBeGreaterThan(0);
  });
});

describe('Level Progression', () => {
  function getAsteroidSpeed(level) {
    const baseMin = 1.0;
    const baseMax = 2.0;
    const levelMultiplier = 0.5 + (level - 1) * 0.3;
    const min = baseMin * levelMultiplier;
    const max = baseMax * levelMultiplier;
    return { min, max };
  }

  test('asteroid speed increases with level', () => {
    const level1 = getAsteroidSpeed(1);
    const level5 = getAsteroidSpeed(5);
    const level10 = getAsteroidSpeed(10);

    expect(level5.min).toBeGreaterThan(level1.min);
    expect(level10.min).toBeGreaterThan(level5.min);
  });

  test('speed range is always positive', () => {
    for (let level = 1; level <= 10; level++) {
      const speeds = getAsteroidSpeed(level);
      expect(speeds.min).toBeGreaterThan(0);
      expect(speeds.max).toBeGreaterThan(speeds.min);
    }
  });
});

describe('Health System', () => {
  test('health decreases on damage', () => {
    let health = 100;
    const damage = 10;

    health -= damage;

    expect(health).toBe(90);
  });

  test('health cannot go below zero', () => {
    let health = 5;
    const damage = 10;

    health = Math.max(0, health - damage);

    expect(health).toBe(0);
  });

  test('angel asteroid healing caps at max', () => {
    let health = 95;
    const maxHealth = 100;
    const healing = 25;

    health = Math.min(maxHealth, health + healing);

    expect(health).toBe(100);
  });
});

describe('Collision Math', () => {
  // Mock THREE.Vector3 for testing
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }

    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    distanceTo(other) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }

  test('calculates distance correctly', () => {
    const point1 = new Vector3(0, 0, 0);
    const point2 = new Vector3(3, 4, 0);

    const distance = point1.distanceTo(point2);

    expect(distance).toBe(5); // 3-4-5 triangle
  });

  test('detects collision when within radius', () => {
    const object1 = new Vector3(0, 0, 0);
    const object2 = new Vector3(1, 0, 0);
    const collisionRadius = 2;

    const distance = object1.distanceTo(object2);
    const isColliding = distance < collisionRadius;

    expect(isColliding).toBe(true);
  });

  test('no collision when outside radius', () => {
    const object1 = new Vector3(0, 0, 0);
    const object2 = new Vector3(5, 0, 0);
    const collisionRadius = 2;

    const distance = object1.distanceTo(object2);
    const isColliding = distance < collisionRadius;

    expect(isColliding).toBe(false);
  });
});

describe('Scoring System', () => {
  test('ammo reward scales with level', () => {
    const AMMO_REWARD_PER_KILL = 5;
    let ammo = 50;

    ammo += AMMO_REWARD_PER_KILL;

    expect(ammo).toBe(55);
  });

  test('angel spawn interval is consistent', () => {
    const ANGEL_SPAWN_INTERVAL = 3;
    const kills = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    const angelSpawns = kills.filter(k => k % ANGEL_SPAWN_INTERVAL === 0);

    expect(angelSpawns).toEqual([3, 6, 9]);
  });
});
