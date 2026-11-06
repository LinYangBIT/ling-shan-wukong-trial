// Run with: node --test qa-stone.mjs
// Exercises actual Three.js objects and the public encounter contract, without GL.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from './dist/vendor/three.module.js';
import {createStoneBoss} from './dist/stone-boss.js';

const DT = 1 / 60, EPSILON = 1e-7;
function near(a, b, label, tolerance = EPSILON) {assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);}
function nearVector(a, b, label) {assert.ok(a.distanceTo(b) < EPSILON, `${label}: ${a.toArray()} vs ${b.toArray()}`);}

function fixture({phase = 1, far = false} = {}) {
  const scene = new THREE.Scene(), boss = createStoneBoss(THREE, scene), hero = new THREE.Group();
  hero.position.set(0, 0, far ? 12 : 1);
  const hits = [], hitTimes = [], effects = scene.getObjectByName('Stone ape hazards');
  let elapsed = 0;
  const context = {
    hero, phase, frozen: 0,
    hurtHero(amount) {hits.push(amount); hitTimes.push(elapsed);},
    face(object, target, dt = 1) {
      const angle = Math.atan2(target.x - object.position.x, target.z - object.position.z);
      object.rotation.y += Math.atan2(Math.sin(angle - object.rotation.y), Math.cos(angle - object.rotation.y)) * Math.min(1, dt * 12);
    },
    keepInArena(position, radius = 16.4) {
      const length = Math.hypot(position.x, position.z);
      if (length > radius) {position.x *= radius / length; position.z *= radius / length;}
    }
  };
  assert.equal(boss.root.visible, false);
  nearVector(boss.root.position, new THREE.Vector3(0, 0, -5), 'default arena placement');
  boss.setVisible(true); boss.reset();
  return {
    scene, boss, hero, context, hits, hitTimes, effects,
    elapsed: () => elapsed,
    state: () => boss.getState(),
    waves: () => effects.children.filter(child => child.name === 'Stone shockwave'),
    meteors: () => effects.children.filter(child => child.name === 'Stone meteor warning'),
    step(dt = DT) {
      elapsed += dt;
      const state = boss.updateAI(dt, context);
      boss.animate(dt, elapsed, {moving: state.moving, phase: context.phase, frozen: context.frozen > 0});
      return state;
    }
  };
}

function until(f, predicate, label, before = () => {}, limit = 15) {
  for (let i = 0; i < Math.ceil(limit / DT); i++) {
    before();
    if (predicate(f.step())) return f.state();
  }
  assert.fail(`Timed out: ${label}; ${JSON.stringify(f.state())}`);
}
function advance(f, seconds, before = () => {}) {for (let i = 0; i < Math.ceil(seconds / DT); i++) {before(); f.step();}}
function breakArmor(f) {for (let i = 0; i < 3; i++) f.boss.resolveHit(100, {heavy: true});}

test('three true heavy hits break armor; all ordinary combo hits retain the reduction', () => {
  const f = fixture();
  for (let i = 0; i < 6; i++) {
    const hit = f.boss.resolveHit(100, {heavy: false});
    assert.equal(hit.damage, 35); assert.equal(hit.armor, 3); assert.equal(hit.broken, false);
  }
  let hit = f.boss.resolveHit(100, {heavy: true});
  assert.equal(hit.damage, 100); assert.equal(hit.armor, 2); assert.equal(hit.maxArmor, 3);
  hit = f.boss.resolveHit(100, {heavy: true});
  assert.equal(hit.damage, 100); assert.equal(hit.armor, 1);
  hit = f.boss.resolveHit(100, {heavy: true});
  assert.equal(hit.damage, 125); assert.equal(hit.armor, 0); assert.equal(hit.broken, true);
  assert.equal(f.state().state, 'recover'); near(f.state().timer, 2, 'break stun');
  near(f.state().vulnerableRemaining, 7, 'vulnerability duration');
  assert.equal(f.boss.resolveHit(100, {heavy: false}).damage, 125);
  assert.equal(f.boss.resolveHit(100, {heavy: true}).damage, 125);
  near(f.state().vulnerableRemaining, 7, 'hits do not extend vulnerability');
});

test('break stun ends at two seconds; armor restores after seven active seconds', () => {
  const f = fixture(); breakArmor(f);
  advance(f, 1.9);
  assert.equal(f.state().state, 'recover'); assert.equal(f.state().broken, true);
  advance(f, .2);
  assert.equal(f.state().state, 'idle');
  advance(f, 4.8);
  assert.equal(f.state().armor, 0);
  advance(f, .2);
  assert.equal(f.state().armor, 3); assert.equal(f.state().broken, false);
  near(f.state().vulnerableRemaining, 0, 'vulnerability fully expires');
  assert.equal(f.boss.resolveHit(100, {heavy: false}).damage, 35);
});

test('freeze pauses both armor vulnerability and break stun', () => {
  const f = fixture(); breakArmor(f);
  f.context.frozen = 1;
  advance(f, 8);
  near(f.state().timer, 2, 'frozen break stun');
  near(f.state().vulnerableRemaining, 7, 'frozen vulnerability');
  assert.equal(f.state().armor, 0); assert.deepEqual(f.hits, []);
  f.context.frozen = 0; advance(f, 7.1);
  assert.equal(f.state().armor, 3);
});

test('slam advertises its range and its expanding ring hits only once', () => {
  const f = fixture();
  until(f, s => s.state === 'windup', 'slam warning');
  assert.equal(f.state().attackType, 'slam');
  const warning = f.effects.getObjectByName('Stone slam boundary');
  assert.equal(warning.visible, true); near(warning.scale.x, 11.2, 'advertised range');
  assert.deepEqual(f.hits, []);
  until(f, s => s.state === 'strike', 'slam launch');
  assert.equal(warning.visible, false); assert.equal(f.waves().length, 1);
  const center = f.waves()[0].position.clone().setY(0);
  until(f, () => f.hits.length > 0, 'slam contact');
  const wave = f.waves()[0];
  nearVector(wave.position.clone().setY(0), center, 'slam stays at its cast center');
  // Track the expanding annulus to challenge its per-wave hit gate.
  until(f, s => s.state === 'recover', 'slam recovery', () => {
    const active = f.waves()[0];
    if (active) f.hero.position.copy(center).add(new THREE.Vector3(active.scale.x, 0, 0));
  });
  assert.deepEqual(f.hits, [24]);
  assert.ok(f.state().timer >= 2.59, 'slam leaves a visible melee recovery window');
});

test('running out of slam range during the warning avoids its wave', () => {
  const f = fixture();
  until(f, s => s.state === 'windup', 'slam warning');
  const escape = f.hero.position.clone().sub(f.boss.root.position).setY(0).normalize();
  until(f, s => s.state === 'recover', 'slam recovery after escape', () => {
    f.hero.position.addScaledVector(escape, 4.1 * DT); f.context.keepInArena(f.hero.position);
  });
  assert.deepEqual(f.hits, []);
});

test('each meteor has at least 1.3 seconds of locked ground warning and hits once', () => {
  const f = fixture({far: true});
  until(f, s => s.state === 'windup', 'meteor warning');
  assert.equal(f.state().attackType, 'meteor'); assert.equal(f.meteors().length, 1);
  const warningAt = f.elapsed(), target = f.meteors()[0].position.clone();
  nearVector(target, f.hero.position, 'meteor locks its ground target');
  advance(f, 1.2);
  assert.deepEqual(f.hits, [], 'meteors never hit before warning duration');
  assert.equal(f.meteors().length, 2, 'second warning is queued while the first remains visible');
  until(f, s => s.state === 'recover', 'meteor recovery');
  assert.deepEqual(f.hits, [21, 21]);
  assert.ok(f.hitTimes[0] - warningAt >= 1.3 - EPSILON);
  assert.ok(f.hitTimes[1] - f.hitTimes[0] >= .65 - DT - EPSILON);
  assert.equal(f.state().pendingHazards, 0); assert.equal(f.state().queuedMeteors, 0);
  assert.ok(f.state().timer >= 2.34);
});

test('continuous normal-speed movement avoids both successive meteor targets', () => {
  const f = fixture({far: true});
  until(f, s => s.state === 'windup', 'meteor warning');
  const first = f.meteors()[0], locked = first.position.clone();
  until(f, s => s.state === 'recover', 'meteor recovery while running', () => {
    f.hero.position.x += 4.1 * DT; f.context.keepInArena(f.hero.position);
    nearVector(first.position, locked, 'a warned meteor cannot track the moving hero');
  });
  assert.deepEqual(f.hits, []);
});

test('phase two adds a third meteor with its stronger damage', () => {
  const f = fixture({phase: 2, far: true});
  until(f, s => s.state === 'windup', 'phase-two meteor warning');
  assert.equal(f.state().queuedMeteors, 2);
  until(f, s => s.state === 'recover', 'phase-two meteor recovery');
  assert.deepEqual(f.hits, [25, 25, 25]);
  assert.equal(f.state().pendingHazards, 0); assert.equal(f.state().queuedMeteors, 0);
});

test('freeze stops an expanding slam ring and resumes without a large step', () => {
  const f = fixture();
  until(f, s => s.state === 'strike', 'slam launch');
  const wave = f.waves()[0], radius = wave.scale.x, timer = f.state().timer, position = f.boss.root.position.clone();
  f.context.frozen = 1; advance(f, 4);
  near(wave.scale.x, radius, 'ring does not expand while frozen');
  near(f.state().timer, timer, 'strike timer does not elapse');
  nearVector(f.boss.root.position, position, 'boss cannot move while frozen');
  assert.equal(f.waves().length, 1); assert.deepEqual(f.hits, []);
  f.context.frozen = 0; f.step();
  near(wave.scale.x - radius, 9.5 * DT, 'thaw advances one ordinary wave step');
  until(f, s => s.state === 'recover', 'slam completion');
  assert.deepEqual(f.hits, [24]);
});

test('freeze stops meteor countdowns, falling meshes, and the queued extra rounds', () => {
  const f = fixture({far: true});
  until(f, s => s.state === 'windup', 'meteor warning');
  const initialTimer = f.state().timer;
  f.context.frozen = 1; advance(f, 4);
  near(f.state().timer, initialTimer, 'meteor cast timer remains frozen');
  assert.equal(f.meteors().length, 1); assert.equal(f.state().queuedMeteors, 1);
  assert.deepEqual(f.hits, []);
  f.context.frozen = 0; advance(f, 1.2); assert.deepEqual(f.hits, []);
  until(f, s => s.state === 'recover', 'thawed meteor recovery');
  assert.deepEqual(f.hits, [21, 21]);
});

test('breaking armor interrupts active and queued meteors immediately', () => {
  const f = fixture({far: true});
  until(f, s => s.state === 'windup', 'meteor warning');
  assert.equal(f.state().pendingHazards, 1); assert.equal(f.state().queuedMeteors, 1);
  breakArmor(f);
  assert.equal(f.state().state, 'recover'); assert.equal(f.state().timer, 2);
  assert.equal(f.state().pendingHazards, 0); assert.equal(f.state().queuedMeteors, 0);
  assert.equal(f.meteors().length, 0);
  advance(f, 1.9); assert.deepEqual(f.hits, []);
});

test('synchronous clearEffects in slam and meteor hit callbacks cancels the rest of that frame', async t => {
  for (const attackType of ['slam', 'meteor']) await t.test(attackType, () => {
    const f = fixture({far: attackType === 'meteor'});
    let clearedAt;
    f.context.hurtHero = amount => {
      f.hits.push(amount); clearedAt = f.boss.root.position.clone(); f.boss.clearEffects();
    };
    until(f, () => f.hits.length > 0, `${attackType} contact cleanup`);
    assert.equal(f.hits.length, 1); assert.equal(f.state().state, 'idle');
    near(f.state().timer, 1.3, 'the interrupted frame cannot consume fresh idle time');
    nearVector(f.boss.root.position, clearedAt, 'no AI movement after the callback');
    assert.equal(f.state().pendingHazards, 0); assert.equal(f.state().queuedMeteors, 0);
    assert.equal(f.waves().length, 0); assert.equal(f.meteors().length, 0);
    assert.equal(f.effects.children.some(child => child.visible), false);
    advance(f, 1.2); assert.equal(f.hits.length, 1, 'cleared attacks cannot deal delayed damage');
  });
});

test('hidden bosses cannot hurt, move, or accept attacks; reset restores full armor', () => {
  const f = fixture({far: true});
  until(f, s => s.state === 'windup', 'meteor warning');
  f.boss.resolveHit(100, {heavy: true});
  const position = f.boss.root.position.clone();
  f.boss.setVisible(false); advance(f, 10);
  assert.equal(f.boss.root.visible, false); assert.equal(f.effects.visible, false);
  assert.equal(f.state().pendingHazards, 0); assert.equal(f.state().queuedMeteors, 0);
  assert.equal(f.boss.resolveHit(100, {heavy: true}).damage, 0);
  nearVector(f.boss.root.position, position, 'hidden position is stable');
  assert.deepEqual(f.hits, []);
  f.boss.setVisible(true); f.boss.reset();
  assert.equal(f.state().armor, 3); assert.equal(f.state().broken, false);
  assert.equal(f.state().state, 'idle'); near(f.state().timer, 1.8, 'fresh opening delay');
  nearVector(f.boss.root.position, position, 'reset preserves caller placement');
});

test('long two-phase simulation and death keep model transforms and vertices finite', () => {
  const f = fixture();
  let meshes = 0; f.boss.root.traverse(object => {if (object.isMesh) meshes++;});
  assert.ok(meshes < 100, `ape uses ${meshes} model meshes`);
  const seen = new Set();
  for (let i = 0; i < 3600; i++) {
    const time = i * DT;
    f.hero.position.set(Math.sin(time * .2) * 8, 0, Math.cos(time * .2) * 8);
    f.context.phase = time < 25 ? 1 : 2;
    f.context.frozen = time >= 20 && time < 23 ? 1 : 0;
    const state = f.step(); if (state.state === 'strike') seen.add(state.attackType);
    assert.ok(Math.hypot(f.boss.root.position.x, f.boss.root.position.z) <= 14.8 + EPSILON);
    assert.ok(Number.isFinite(state.timer)); assert.ok(Number.isFinite(state.vulnerableRemaining));
    if (i % 60 === 0) {
      f.scene.updateMatrixWorld(true);
      f.scene.traverse(object => {
        assert.ok(object.matrixWorld.elements.every(Number.isFinite), 'world transform is finite');
        const position = object.geometry?.attributes.position;
        if (position) assert.ok(position.array.every(Number.isFinite), 'geometry vertices are finite');
      });
    }
  }
  assert.deepEqual([...seen].sort(), ['meteor', 'slam']);
  f.boss.animate(DT, 60, {dead: true, phase: 2});
  assert.equal(f.state().pendingHazards, 0); assert.equal(f.state().queuedMeteors, 0);
  f.scene.updateMatrixWorld(true);
  f.scene.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite), 'death pose remains finite'));
});
