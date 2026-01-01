# Asteroid Reticle Occlusion System

## Overview
The targeting reticle system now includes depth-aware occlusion detection. Reticles hide when asteroids are behind Earth, Moon, or the Ship, creating a more realistic and less cluttered HUD.

## Implementation

### Core Components

**Raycaster** (line 799)
```javascript
const occlusionRaycaster = new THREE.Raycaster();
let occludingObjects = []; // Populated with [earth, moon, spaceShip]
```
- Reused every frame for performance (avoids creating new instances)
- Populated after scene objects are created (line 712)

**Occlusion Detection** (lines 1467-1484)
For each visible asteroid:
1. Calculate ray direction from camera toward asteroid
2. Set raycaster origin and direction
3. Limit ray distance to asteroid distance (`raycaster.far`)
4. Check for intersections with occluding objects
5. Skip rendering reticle if occluded

### Algorithm

```
For each asteroid in screen space:
  1. Ray origin = camera position
  2. Ray direction = normalize(asteroid.position - camera.position)
  3. Ray max distance = distance(camera, asteroid)

  4. Intersections = raycaster.intersect([earth, moon, ship], recursive=true)

  5. If intersections.length > 0:
       Asteroid is occluded → Skip rendering reticle
     Else:
       Asteroid is visible → Render reticle with health bar
```

### Key Features

**Performance Optimized**
- Raycaster instance reused across all asteroids each frame
- Only checks 3 objects (earth, moon, ship) per asteroid
- Early exit when asteroid is occluded

**Depth Accurate**
- `raycaster.far` set to asteroid distance ensures only closer objects are checked
- Prevents false occlusions from objects beyond the asteroid

**Child Mesh Handling**
- `recursive: true` parameter ensures child meshes are checked
- Important for Ship (complex multi-mesh object) and asteroid groups

**Debug Logging**
- Samples 1% of occlusion events to verify system works
- Logs which object (Earth/Moon/Ship) is occluding
- Can be removed after testing confirmed

## Testing Checklist

- [ ] Asteroids behind Earth: reticles should hide
- [ ] Asteroids behind Moon: reticles should hide
- [ ] Asteroids behind Ship: reticles should hide
- [ ] Asteroids moving from visible to occluded: smooth hiding
- [ ] Asteroids moving from occluded to visible: smooth showing
- [ ] No performance impact (check FPS with many asteroids)
- [ ] Console shows occlusion events (debug logs)

## Edge Cases Handled

1. **Asteroids don't occlude each other**: Only Earth/Moon/Ship are checked, prevents visual clutter
2. **Partial occlusion**: Ray intersection is binary - if any part of occluding object blocks ray, reticle hides
3. **Ship close to camera**: Works correctly even when ship is very close in ship mode
4. **Very distant asteroids**: Far plane limiting ensures accurate depth testing

## Performance Characteristics

- **Raycaster creation**: Once at module initialization (negligible)
- **Per-frame cost**: O(n × 3) where n = visible asteroids
- **Typical load**: ~10-20 asteroids × 3 objects = 30-60 intersection tests per frame
- **Expected impact**: < 1ms per frame on modern hardware

## Completion Criteria

The occlusion system is complete when:
- ✅ Reticles hide when asteroids are behind Earth
- ✅ Reticles hide when asteroids are behind Moon
- ✅ Reticles hide when asteroids are behind Ship
- ✅ No false positives (visible asteroids hidden incorrectly)
- ✅ No false negatives (occluded asteroids shown incorrectly)
- ✅ Performance is acceptable (60 FPS maintained)
