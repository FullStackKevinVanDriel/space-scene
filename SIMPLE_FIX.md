# Simple Particle Fix

The particles are there but not visible. Here's what needs to change in `public/script.js`:

## 1. Line ~2133 - Make particles larger:
```javascript
const particleGeometry = new THREE.SphereGeometry(0.25, 12, 12);
```

## 2. Lines ~2136-2144 - Use solid material:
```javascript
const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true
});
```

## 3. Line ~2314 - Make particles bigger:
```javascript
const baseSize = (type === 'spark' || type === 'ember') ? 0.5 : (1.4 + Math.random() * 1.4);
```

## 4. Line ~2344 - Slow down velocities:
```javascript
const velocityMult = (type === 'spark' ? 2 : 4) * velocityScale;
```

## 5. Lines ~2788-2793 - Slow spark ring:
```javascript
velocityScale: 0.2,
particleCountOverride: 800,
sizeScale: 1.5,
durationOverride: 15000,
```

These changes will make large, bright white particles that move slowly outward from Earth impacts.
