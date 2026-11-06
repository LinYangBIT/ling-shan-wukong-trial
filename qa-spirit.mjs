// Run with: node --test qa-spirit.mjs
// Uses actual Three.js scene geometry; no browser, renderer, or private AI hooks.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from './dist/vendor/three.module.js';
import {createSpiritBoss} from './dist/spirit-boss.js';

const DT = 1 / 60;
const EPSILON = 1e-7;

function fixture(phase = 1) {
  const scene = new THREE.Scene();
  const boss = createSpiritBoss(THREE, scene);
  const hero = new THREE.Group();
  hero.position.set(0, 0, 8);
  const hits = [];
  const context = {
    hero, phase, frozen: 0,
    hurtHero(amount) { hits.push(amount); },
    face(object, target, dt = 1) {
      const angle = Math.atan2(target.x - object.position.x, target.z - object.position.z);
      object.rotation.y += Math.atan2(Math.sin(angle - object.rotation.y), Math.cos(angle - object.rotation.y)) * Math.min(1, dt * 12);
    },
    keepInArena(position, radius = 16.4) {
      const length = Math.hypot(position.x, position.z);
      if (length > radius) {position.x *= radius / length; position.z *= radius / length;}
    }
  };
  const effects = scene.getObjectByName('Spirit deer wind and telegraphs');
  assert.ok(effects, 'effects group is available in the scene');
  assert.equal(boss.root.visible, false, 'a newly created boss cannot appear in an earlier stage');
  boss.setVisible(true);
  boss.reset();
  let elapsed = 0;
  let state = boss.updateAI(0, context);
  return {
    scene, boss, hero, context, effects, hits,
    blades: () => effects.children.filter(child => child.name === 'Spirit wind blade'),
    state: () => state,
    elapsed: () => elapsed,
    step(dt = DT) {
      elapsed += dt;
      state = boss.updateAI(dt, context);
      boss.animate(dt, elapsed, {phase: context.phase, frozen: context.frozen > 0, moving: state.moving});
      return state;
    }
  };
}

function until(f, predicate, message, beforeStep = () => {}, limit = 15) {
  for (let i = 0; i < Math.ceil(limit / DT); i++) {
    beforeStep();
    const state = f.step();
    if (predicate(state)) return state;
  }
  assert.fail(`Timed out: ${message}; last state ${JSON.stringify(f.state())}`);
}

function advance(f, seconds, beforeStep = () => {}) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {beforeStep(); f.step();}
}

function startWind(f) {
  return until(f, s => s.state === 'strike' && s.attackType === 'wind', 'first wind volley');
}

function prepareCharge(f, direction = new THREE.Vector3(.6, 0, .8)) {
  // Follow just inside the close-range trigger during idle, then stand on its
  // locked target. This exercises the public combat loop without editing AI.
  return until(f, s => s.state === 'windup' && s.attackType === 'charge', 'charge warning', () => {
    if (f.state().state === 'idle') f.hero.position.copy(f.boss.root.position).addScaledVector(direction, 2.5);
  });
}

function near(actual, expected, message, tolerance = EPSILON) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}

function nearVector(actual, expected, message, tolerance = EPSILON) {
  assert.ok(actual.distanceTo(expected) <= tolerance, `${message}: ${actual.toArray()} vs ${expected.toArray()}`);
}

test('phase-one wind has a locked ground warning, three visible blades, and contact damage', () => {
  const f = fixture();
  until(f, s => s.state === 'windup', 'wind warning');
  assert.equal(f.state().attackType, 'wind');
  const ring = f.effects.children.find(child => child.geometry?.type === 'RingGeometry');
  assert.equal(ring.visible, true);
  nearVector(ring.position.clone().setY(0), f.hero.position, 'warning locks onto hero ground position');
  assert.equal(f.hits.length, 0, 'warning never inflicts damage');
  startWind(f);
  assert.equal(ring.visible, false, 'warning disappears at launch');
  assert.equal(f.blades().length, 3);
  until(f, () => f.hits.length > 0, 'wind contact');
  assert.deepEqual(f.hits, [13]);
});

test('a normal-speed side step after the wind warning avoids the entire volley', () => {
  const f = fixture();
  until(f, s => s.state === 'windup', 'wind warning');
  const ring = f.effects.children.find(child => child.geometry?.type === 'RingGeometry');
  const locked = ring.position.clone();
  const approach = f.hero.position.clone().sub(f.boss.root.position).setY(0).normalize();
  const sideways = new THREE.Vector3(approach.z, 0, -approach.x);
  until(f, s => s.state === 'strike', 'wind launch while sidestepping', () => {
    f.hero.position.addScaledVector(sideways, 4.1 * DT);
    nearVector(ring.position, locked, 'warning does not track a late sidestep');
  });
  advance(f, 3.6);
  assert.equal(f.hits.length, 0, 'walking sideways at the real hero speed avoids wind');
  assert.equal(f.blades().length, 0, 'missed blades expire instead of staying dangerous');
});

test('phase two launches five faster blades and applies its damage value', () => {
  const f = fixture(2);
  startWind(f);
  assert.equal(f.blades().length, 5);
  const blade = f.blades()[0];
  const before = blade.position.clone();
  f.step();
  near(blade.position.distanceTo(before), 8.3 * DT, 'phase-two projectile speed');
  until(f, () => f.hits.length > 0, 'phase-two wind contact');
  assert.deepEqual(f.hits, [16]);
});

test('charge warning corridor matches actual travel for oblique directions', async t => {
  for (const [x, z] of [[.6, .8], [-.8, .6], [.8, -.6], [-.6, -.8]]) {
    await t.test(`heading ${x}, ${z}`, () => {
      const f = fixture();
      prepareCharge(f, new THREE.Vector3(x, 0, z));
      const start = f.boss.root.position.clone();
      const corridor = f.effects.children.find(child => child.isMesh && child.geometry?.type === 'PlaneGeometry');
      const outline = f.effects.children.find(child => child.isLineSegments);
      assert.equal(corridor.visible, true);
      assert.equal(outline.visible, true);
      f.scene.updateMatrixWorld(true);
      const endA = corridor.localToWorld(new THREE.Vector3(0, -.5, 0)).setY(0);
      const endB = corridor.localToWorld(new THREE.Vector3(0, .5, 0)).setY(0);
      const far = endA.distanceTo(start) > endB.distanceTo(start) ? endA : endB;
      const close = far === endA ? endB : endA;
      nearVector(close, start, 'the corridor starts at the deer');
      const axis = far.clone().sub(close).normalize();
      const toHero = f.hero.position.clone().sub(start).normalize();
      assert.ok(axis.dot(toHero) > .9999, 'warning is aligned with its locked target');
      until(f, s => s.state === 'strike', 'charge launch');
      assert.equal(corridor.visible, false);
      until(f, s => s.state === 'recover', 'charge recovery', () => {
        const offset = f.boss.root.position.clone().sub(start);
        near(offset.clone().cross(axis).length(), 0, 'travel follows the advertised corridor');
      });
      nearVector(f.boss.root.position, far, 'charge finishes at the advertised endpoint');
      assert.deepEqual(f.hits, [23], 'a stationary hero receives one charge hit');
      assert.ok(f.state().timer >= 2.39, 'charge leaves a long melee punish window');
    });
  }
});

test('leaving the locked charge corridor prevents contact damage', () => {
  const f = fixture();
  prepareCharge(f, new THREE.Vector3(0, 0, 1));
  const lockedTarget = f.hero.position.clone();
  until(f, s => s.state === 'strike', 'charge launch while sidestepping', () => {
    f.hero.position.x += 4.1 * DT;
  });
  assert.ok(f.hero.position.distanceTo(lockedTarget) > 5, 'hero has left the corridor before launch');
  until(f, s => s.state === 'recover', 'charge recovery');
  assert.deepEqual(f.hits, []);
});

test('freeze stops wind timers, movement, projectile travel, expiry, and damage until thaw', () => {
  const f = fixture();
  startWind(f);
  const positions = f.blades().map(blade => blade.position.clone());
  const origin = f.boss.root.position.clone();
  const timer = f.state().timer;
  f.context.frozen = 5;
  advance(f, 4);
  near(f.state().timer, timer, 'AI timer stays frozen');
  nearVector(f.boss.root.position, origin, 'boss position stays frozen');
  assert.equal(f.blades().length, 3, 'projectile lifetimes also remain frozen');
  f.blades().forEach((blade, index) => nearVector(blade.position, positions[index], 'projectile stays frozen'));
  assert.deepEqual(f.hits, []);
  assert.match(f.state().tip, /定 身/);
  f.context.frozen = 0;
  until(f, () => f.hits.length > 0, 'wind resumes after thaw');
  assert.deepEqual(f.hits, [13]);
});

test('freeze stops an active charge and resumes it without teleporting', () => {
  const f = fixture();
  prepareCharge(f);
  until(f, s => s.state === 'strike', 'charge launch');
  f.step();
  const origin = f.boss.root.position.clone();
  const timer = f.state().timer;
  f.context.frozen = 2;
  advance(f, 2);
  nearVector(f.boss.root.position, origin, 'charge position stays frozen');
  near(f.state().timer, timer, 'charge timer stays frozen');
  assert.deepEqual(f.hits, []);
  f.context.frozen = 0;
  f.step();
  near(f.boss.root.position.distanceTo(origin), 13 * DT, 'thaw takes exactly one charge step');
  until(f, s => s.state === 'recover', 'charge recovery after thaw');
  assert.deepEqual(f.hits, [23]);
});

test('wind hit callback can synchronously clear effects without remaining damage or AI movement', () => {
  const f = fixture(2);
  startWind(f);
  let clearedAt;
  f.context.hurtHero = amount => {
    f.hits.push(amount);
    clearedAt = f.boss.root.position.clone();
    f.boss.clearEffects();
  };
  until(f, () => f.hits.length > 0, 'synchronous wind cleanup');
  assert.deepEqual(f.hits, [16]);
  assert.equal(f.blades().length, 0);
  assert.equal(f.state().state, 'idle');
  near(f.state().timer, 1.3, 'cleanup timer is not consumed by the interrupted frame');
  nearVector(f.boss.root.position, clearedAt, 'AI does not move after synchronous cleanup');
  assert.equal(f.effects.children.some(child => child.visible), false, 'all telegraphs are hidden');
  advance(f, 1.2);
  assert.deepEqual(f.hits, [16], 'cleared blades cannot deal delayed damage');
});

test('charge hit callback can synchronously clear its pending strike', () => {
  const f = fixture();
  prepareCharge(f);
  let clearedAt;
  f.context.hurtHero = amount => {
    f.hits.push(amount);
    clearedAt = f.boss.root.position.clone();
    f.boss.clearEffects();
  };
  until(f, () => f.hits.length > 0, 'synchronous charge cleanup');
  assert.deepEqual(f.hits, [23]);
  assert.equal(f.state().state, 'idle');
  near(f.state().timer, 1.3, 'charge cleanup retains fresh idle timer');
  nearVector(f.boss.root.position, clearedAt, 'the cleared charge stops at the callback position');
  advance(f, 1.2);
  assert.deepEqual(f.hits, [23]);
});

test('hide and reset remove hazards and start a fresh encounter', () => {
  const f = fixture();
  startWind(f);
  assert.equal(f.blades().length, 3);
  const position = f.boss.root.position.clone();
  f.boss.setVisible(false);
  advance(f, 10);
  assert.equal(f.boss.root.visible, false);
  assert.equal(f.effects.visible, false);
  assert.equal(f.blades().length, 0);
  assert.deepEqual(f.hits, []);
  nearVector(f.boss.root.position, position, 'a hidden boss cannot move');
  f.boss.setVisible(true);
  f.boss.reset();
  f.step(0);
  assert.equal(f.state().state, 'idle');
  near(f.state().timer, 1.8, 'reset restores encounter opening delay');
  assert.equal(f.state().attackType, 'wind');
  nearVector(f.boss.root.position, position, 'reset preserves caller-owned placement');
  startWind(f);
  assert.equal(f.blades().length, 3, 'fresh encounter has only its new volley');
});

test('a mixed two-phase fight keeps transforms and ribbon geometry finite and inside the arena', () => {
  const f = fixture();
  let meshCount = 0;
  f.boss.root.traverse(object => {if (object.isMesh) meshCount++;});
  assert.ok(meshCount < 100, `model has ${meshCount} meshes`);
  const seen = new Set();
  for (let i = 0; i < 3600; i++) {
    const time = i * DT;
    f.context.phase = time < 25 ? 1 : 2;
    f.context.frozen = time >= 18 && time < 21 ? 1 : 0;
    f.hero.position.set(Math.sin(time * .22) * 11, 0, Math.cos(time * .22) * 11);
    const state = f.step();
    if (state.state === 'strike') seen.add(state.attackType);
    assert.ok(Math.hypot(f.boss.root.position.x, f.boss.root.position.z) <= 15.3 + EPSILON);
    assert.ok(Number.isFinite(state.timer));
    if (i % 60 === 0) {
      f.scene.updateMatrixWorld(true);
      f.scene.traverse(object => {
        assert.ok(object.matrixWorld.elements.every(Number.isFinite), `${object.name || object.type} has finite transforms`);
        const position = object.geometry?.attributes.position;
        if (position) assert.ok(position.array.every(Number.isFinite), 'mesh vertices remain finite');
      });
    }
  }
  assert.deepEqual([...seen].sort(), ['charge', 'wind']);
  f.boss.animate(DT, 60, {dead: true, phase: 2});
  assert.equal(f.blades().length, 0, 'death clears active projectiles');
  f.scene.updateMatrixWorld(true);
  f.scene.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite), 'death pose remains finite'));
});
