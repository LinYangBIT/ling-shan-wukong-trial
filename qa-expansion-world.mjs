import assert from 'node:assert/strict';
import * as THREE from './dist/vendor/three.module.js';
import { createExpansionWorld } from './dist/expansion-world.js';

const world = createExpansionWorld(THREE, new THREE.Scene());
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
const hero = new THREE.Object3D();
const tick = (seconds, hurtHero = () => {}, dt = 1 / 60) => {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += dt) world.step(Math.min(dt, seconds - elapsed), { hero, hurtHero });
};
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} must equal ${b}`);
const staticMeshes = kind => {
  const result = [];
  world.groups[kind].traverse(object => {
    if (!object.isMesh || object.material.transparent) return;
    for (let parent = object; parent; parent = parent.parent) if (parent.userData.hazard) return;
    result.push(object);
  });
  world.groups[kind].updateMatrixWorld(true); return result;
};
const ray = new THREE.Raycaster();
const castDown = (objects, x, y, z, far) => {
  ray.set(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0)); ray.near = 0; ray.far = far; return ray.intersectObjects(objects, false);
};
const hazards = world.groups.emberpass.children.filter(object => object.userData.hazard);

check('Initially hidden; setStage selects one scene and unknown kind hides all', () => {
  assert.ok(Object.values(world.groups).every(group => !group.visible));
  for (const kind of Object.keys(world.groups)) {
    world.setStage(kind);
    assert.deepEqual(Object.entries(world.groups).filter(([, group]) => group.visible).map(([name]) => name), [kind]);
  }
  world.setStage(null); assert.ok(Object.values(world.groups).every(group => !group.visible));
  assert.equal(world.getState().progress, 0);
});
check('Two gently curved routes cover z90 to z18 with finite, level samples', () => {
  for (const kind of ['moonwood', 'emberpass']) {
    near(world.samplePath(kind, 0).z, 90); near(world.samplePath(kind, 1).z, 18);
    let previous = world.samplePath(kind, 0);
    for (let i = 0; i <= 720; i++) {
      const position = world.samplePath(kind, i / 720);
      assert.ok(position.toArray().every(Number.isFinite)); assert.equal(position.y, 0);
      if (i) assert.ok(Math.abs(position.x - previous.x) < .06, 'Path derivative stays gentle');
      previous = position;
    }
  }
});
check('Route ribbons have upward-facing triangles and no missing walkable ground', () => {
  for (const kind of ['moonwood', 'emberpass']) {
    const meshes = staticMeshes(kind);
    const surfaces = world.groups[kind].children.filter(object => object.name.startsWith(`${kind} surface`));
    for (const surface of surfaces) {
      const normals = surface.geometry.attributes.normal;
      for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > .99);
    }
    for (let i = 0; i <= 288; i++) {
      const position = world.samplePath(kind, i / 288);
      for (const dx of [-3.95, 0, 3.95]) {
        assert.ok(castDown(meshes, position.x + dx, .22, position.z, .6).length, `${kind} missing floor at ${position.z}`);
        assert.equal(castDown(meshes, position.x + dx, 2.2, position.z, 1.95).length, 0, `${kind} has a low obstacle at ${position.z}`);
      }
    }
  }
});
check('Creek and lava stream remain exposed beside their paths', () => {
  for (const [kind, offset, expectedY] of [['moonwood', -10.7, -.8], ['emberpass', 13, -4.5]]) {
    const meshes = staticMeshes(kind); let visible = 0;
    for (let z = 21; z <= 89; z += 2) {
      const position = world.samplePath(kind, (90 - z) / 72), hit = castDown(meshes, position.x + offset, 25, z, 40)[0];
      if (hit && Math.abs(hit.point.y - expectedY) < .09) visible++;
    }
    assert.ok(visible >= 29, `${kind} stream is obstructed (${visible}/35)`);
  }
});
check('Moon arch feet rest on a supporting surface, outside the walkable corridor', () => {
  const surfaces = world.groups.moonwood.children.filter(object => object.name === 'moonwood surface path');
  const position = world.samplePath('moonwood', (90 - 23) / 72);
  for (const side of [-1, 1]) assert.ok(castDown(surfaces, position.x + side * 5.25, .2, 23, .6).length);
});
check('Stone arena supports all points inside radius16.4 and keeps low obstacles outside it', () => {
  const meshes = staticMeshes('stoneking');
  for (let r = 0; r <= 16.4; r += 2.05) for (let i = 0; i < 32; i++) {
    const x = Math.sin((i + .123) / 32 * Math.PI * 2) * r, z = Math.cos((i + .123) / 32 * Math.PI * 2) * r;
    assert.ok(castDown(meshes, x, .2, z, .5).length);
    assert.equal(castDown(meshes, x, 2.2, z, 1.95).length, 0);
  }
  const position = new THREE.Vector3(100, 3, -80); world.clampPosition('stoneking', position); near(Math.hypot(position.x, position.z), 16.4); assert.equal(position.y, 3);
});
check('All static instance bounds contain every transformed instance', () => {
  const matrix = new THREE.Matrix4();
  for (const group of Object.values(world.groups)) group.traverse(object => {
    if (!object.isInstancedMesh) return;
    assert.ok(object.boundingSphere && Number.isFinite(object.boundingSphere.radius)); object.geometry.computeBoundingSphere();
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix); const sphere = object.geometry.boundingSphere.clone().applyMatrix4(matrix);
      assert.ok(sphere.center.distanceTo(object.boundingSphere.center) + sphere.radius <= object.boundingSphere.radius + 1e-5);
    }
  });
});
check('Moon exit stays locked, and incomplete travel alone cannot finish the scene', () => {
  world.reset('moonwood'); world.setStage('moonwood'); hero.position.set(0, 0, 18); world.clampPosition('moonwood', hero.position); assert.equal(hero.position.z, 20);
  tick(.05); assert.equal(world.getState().complete, false); assert.equal(world.getState().collected, 0);
});
check('Each seal requires proximity, collects once, and leads to the next target', () => {
  world.reset('moonwood'); world.setStage('moonwood');
  for (let i = 0; i < 3; i++) {
    const target = world.getState().target;
    hero.position.set(target.x + 1.71, 0, target.z); tick(.05); assert.equal(world.getState().collected, i);
    hero.position.set(target.x + 1.69, 0, target.z); tick(.05); assert.equal(world.getState().collected, i + 1);
    tick(.5); assert.equal(world.getState().collected, i + 1);
  }
  assert.equal(new Set(world.getState().collectedIds).size, 3); assert.equal(world.getState().complete, false);
  hero.position.copy(world.samplePath('moonwood', 1)); world.clampPosition('moonwood', hero.position); assert.equal(hero.position.z, 18);
  tick(.05); assert.equal(world.getState().complete, true); assert.equal(world.getState().progress, 1);
});
check('Changing stages and clearing effects preserve seal collection; reset restores it', () => {
  const collected = world.getState().collectedIds;
  world.setStage('emberpass'); world.setStage('moonwood'); world.clearEffects(); assert.deepEqual(world.getState().collectedIds, collected);
  world.reset('moonwood'); assert.equal(world.getState().collected, 0); assert.equal(world.getState().complete, false); assert.equal(world.getState().progress, 0);
  assert.ok(world.groups.moonwood.children.filter(object => object.name.startsWith('Moonwood spirit seal')).every(object => object.visible));
});
check('Visual updates alone cannot collect seals or advance their progress', () => {
  const target = world.getState().target; hero.position.set(target.x, 0, target.z);
  const before = world.getState(); for (let i = 0; i < 300; i++) world.update(.1, i * .1); assert.deepEqual(world.getState(), before);
});
check('Distant falling rocks never activate', () => {
  world.reset('emberpass'); world.setStage('emberpass'); hero.position.copy(world.samplePath('emberpass', 0)); let damage = 0;
  tick(20, amount => { damage += amount; }); assert.equal(damage, 0); assert.ok(hazards.every(object => !object.visible));
});
check('A nearby rock gives at least1.2 seconds of warning then exactly18 damage', () => {
  world.reset('emberpass'); const first = hazards[0].userData.hazard; hero.position.set(first.x, 0, first.z); const hits = [];
  tick(.02, amount => hits.push(amount)); assert.equal(hazards[0].visible, true);
  tick(1.4, amount => hits.push(amount)); assert.equal(hits.length, 0);
  tick(.9, amount => hits.push(amount)); assert.deepEqual(hits, [18]);
  tick(1.9, amount => hits.push(amount)); assert.deepEqual(hits, [18]);
  tick(3.5, amount => hits.push(amount)); assert.deepEqual(hits, [18, 18]);
});
check('Pausing step while visual time advances freezes an active falling rock', () => {
  world.reset('emberpass'); const first = hazards[0].userData.hazard; hero.position.set(first.x, 0, first.z); let damage = 0;
  tick(.8, amount => { damage += amount; });
  const before = world.getState(); for (let i = 0; i < 180; i++) world.update(1, i * 12);
  assert.deepEqual(world.getState(), before); assert.equal(damage, 0);
  tick(.7, amount => { damage += amount; }); assert.equal(damage, 0);
  tick(.7, amount => { damage += amount; }); assert.equal(damage, 18);
});
check('Safe-side bypasses avoid every danger circle', () => {
  for (const danger of hazards) {
    world.reset('emberpass'); const { x, z } = danger.userData.hazard;
    const center = world.samplePath('emberpass', (90 - z) / 72).x;
    hero.position.set(center + (x <= center ? 3.3 : -3.3), 0, z); let damage = 0;
    tick(8, amount => { damage += amount; }); assert.equal(damage, 0);
  }
});
check('Leaving the danger area cancels queued falling damage', () => {
  world.reset('emberpass'); const first = hazards[0].userData.hazard; hero.position.set(first.x, 0, first.z); let damage = 0;
  tick(1, amount => { damage += amount; }); hero.position.copy(world.samplePath('emberpass', 0)); tick(.1); assert.equal(hazards[0].visible, false);
  tick(5, amount => { damage += amount; }); assert.equal(damage, 0);
});
check('clearEffects preserves stage and progress while cancelling pending damage', () => {
  world.reset('emberpass'); const first = hazards[0].userData.hazard; hero.position.set(first.x, 0, first.z); tick(1.8);
  const before = world.getState(); world.clearEffects(); assert.equal(world.groups.emberpass.visible, true); assert.equal(world.getState().progress, before.progress);
  assert.ok(hazards.every(object => !object.visible)); let damage = 0; tick(1.4, amount => { damage += amount; }); assert.equal(damage, 0);
});
check('Synchronous death callback can clear effects or switch scenes without hidden damage', () => {
  for (const action of [() => world.clearEffects(), () => world.setStage('stoneking'), () => world.reset('emberpass')]) {
    world.reset('emberpass'); world.setStage('emberpass'); const first = hazards[0].userData.hazard; hero.position.set(first.x, 0, first.z); let calls = 0;
    tick(2.1, () => { calls++; action(); }); assert.equal(calls, 1);
    assert.ok(hazards.every(object => !object.visible) || world.getState().kind === 'emberpass');
  }
});
check('Ember exit completes the route and clears all hazards', () => {
  world.reset('emberpass'); world.setStage('emberpass'); hero.position.copy(world.samplePath('emberpass', 1)); tick(.05);
  const result = world.getState(); assert.equal(result.complete, true); assert.equal(result.progress, 1); assert.ok(hazards.every(object => !object.visible));
});
check('Invalid or zero delta cannot move gameplay clocks', () => {
  world.reset('emberpass'); world.setStage('emberpass'); const before = world.getState();
  for (const dt of [0, -1, NaN, Infinity]) world.step(dt, { hero }); assert.deepEqual(world.getState(), before);
});

console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
