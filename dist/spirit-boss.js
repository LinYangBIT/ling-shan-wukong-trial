// Original procedural spirit deer and its ranged encounter. Front is local +Z.
export function createSpiritBoss(THREE, scene) {
  const root = new THREE.Group();
  root.name = '青岚灵鹿';
  root.visible = false;
  scene.add(root);
  const effects = new THREE.Group();
  effects.name = 'Spirit deer wind and telegraphs';
  effects.visible = false;
  scene.add(effects);
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: .45, metalness: .12, ...extra});
  const jade = material(0xc7e9d7, {emissive: 0x173f36, emissiveIntensity: .18});
  const pale = material(0xe6f3e5, {roughness: .67});
  const teal = material(0x438a7b, {roughness: .34, metalness: .32});
  const gold = material(0xc9b77b, {roughness: .32, metalness: .65});
  const dark = material(0x173c36);
  const glow = material(0x97f9cd, {emissive: 0x48dca5, emissiveIntensity: 1.75});
  const ribbonMaterial = material(0x65cbb1, {side: THREE.DoubleSide, transparent: true, opacity: .8, emissive: 0x1e6d55, emissiveIntensity: .35});
  const sphereGeometry = new THREE.SphereGeometry(1, 16, 10);
  const unitUp = new THREE.Vector3(0, 1, 0);
  const mesh = (parent, geometry, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z); object.scale.set(sx, sy, sz);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  };
  const ellipsoid = (parent, mat, x, y, z, sx, sy, sz) => mesh(parent, sphereGeometry, mat, x, y, z, sx, sy, sz);
  const joint = (parent, x, y, z) => {const group = new THREE.Group();group.position.set(x, y, z);parent.add(group);return group;};
  const branch = (parent, mat, start, end, radius = .06, tipRadius = radius * .65) => {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), direction = b.clone().sub(a);
    const item = mesh(parent, new THREE.CylinderGeometry(tipRadius, radius, direction.length(), 7), mat);
    item.position.copy(a).add(b).multiplyScalar(.5);
    item.quaternion.setFromUnitVectors(unitUp, direction.normalize());return item;
  };
  const body = joint(root, 0, 1.95, 0);
  ellipsoid(body, jade, 0, 0, -.05, .65, .62, 1.22);
  ellipsoid(body, pale, 0, -.13, .5, .52, .58, .62);
  ellipsoid(body, jade, 0, -.04, -.82, .57, .57, .6);
  const neck = joint(body, 0, .18, .82);
  const neckShape = ellipsoid(neck, pale, 0, .56, .13, .34, .78, .37);neckShape.rotation.x = .24;
  const mane = ellipsoid(neck, teal, 0, .43, -.13, .29, .65, .18);mane.rotation.x = .24;
  const head = joint(neck, 0, 1.13, .32);
  ellipsoid(head, pale, 0, .03, .03, .29, .32, .42);
  ellipsoid(head, jade, 0, -.09, .4, .21, .19, .4);
  ellipsoid(head, dark, 0, -.07, .73, .16, .09, .055);
  for (const side of [-1, 1]) {
    const ear = ellipsoid(head, jade, side * .39, .19, -.06, .14, .34, .11);ear.rotation.z = -side * .95;
    const innerEar = ellipsoid(head, teal, side * .4, .2, .025, .072, .24, .035);innerEar.rotation.z = -side * .95;
    ellipsoid(head, dark, side * .249, .075, .255, .055, .049, .07);
    ellipsoid(head, glow, side * .28, .08, .275, .025, .027, .045);
    const a = side;
    branch(head, gold, [a * .17, .25, -.1], [a * .32, .65, -.27], .09);
    branch(head, glow, [a * .32, .65, -.27], [a * .48, 1.18, -.36], .072, .045);
    branch(head, glow, [a * .48, 1.18, -.36], [a * .83, 1.51, -.43], .048, .012);
    branch(head, glow, [a * .4, .92, -.31], [a * .81, 1.03, -.16], .052, .025);
    branch(head, glow, [a * .81, 1.03, -.16], [a * 1.01, 1.35, -.1], .025, .008);
    branch(head, glow, [a * .49, 1.18, -.36], [a * .38, 1.61, -.17], .035, .008);
    branch(head, glow, [a * .32, .65, -.27], [a * .28, .98, .17], .045, .009);
    const ornament = mesh(head, new THREE.OctahedronGeometry(.09), gold, a * .8, .84, -.15);ornament.scale.y = 1.8;
  }
  const collar = mesh(neck, new THREE.TorusGeometry(.35, .045, 7, 24), gold, 0, .22, .1);collar.rotation.x = Math.PI / 2 - .24;
  ellipsoid(neck, glow, 0, .08, .43, .11, .16, .065);
  for (const side of [-1, 1]) {
    const saddle = ellipsoid(body, teal, side * .48, .27, -.16, .2, .29, .76);saddle.rotation.z = side * .25;
    for (let i = 0; i < 4; i++) ellipsoid(body, pale, side * .61, .12 + .12 * (i % 2), -.68 + i * .36, .035, .065, .095);
  }
  const tail = joint(body, 0, .22, -1.07);
  const tailShape = ellipsoid(tail, pale, 0, .05, -.25, .16, .2, .37);tailShape.rotation.x = .2;
  const legs = [];
  for (const z of [-.76, .72]) for (const side of [-1, 1]) {
    const leg = joint(root, side * .43, 1.86, z);
    ellipsoid(leg, jade, 0, -.33, 0, .19, .49, .22);
    const knee = joint(leg, 0, -.78, z < 0 ? -.05 : .035);
    ellipsoid(knee, teal, 0, -.03, .01, .13, .14, .14);
    branch(knee, pale, [0, -.08, 0], [0, -.8, .05], .095, .065);
    ellipsoid(knee, dark, 0, -.87, .09, .13, .12, .19);
    legs.push({leg, knee, phase: (side > 0 ? 0 : Math.PI) + (z < 0 ? Math.PI : 0)});
  }
  const ribbons = [];
  for (const side of [-1, 1]) {
    const ribbon = mesh(body, new THREE.PlaneGeometry(.2, 2.6, 1, 18), ribbonMaterial, side * .55, .1, -.15);
    ribbon.geometry.rotateX(-Math.PI / 2);ribbon.geometry.translate(0, 0, -1.3);
    ribbons.push({ribbon, original: ribbon.geometry.attributes.position.array.slice(), side});
  }
  root.userData.rig = {torso: body, head, neck, tail, legs};
  root.userData.combatRadius = 1.2;root.userData.hitHeight = 2.25;root.userData.encounter = 'spirit';
  const warningMaterial = new THREE.MeshBasicMaterial({color: 0xffc472, transparent: true, opacity: .65, depthWrite: false, side: THREE.DoubleSide});
  const warningFillMaterial = new THREE.MeshBasicMaterial({color: 0xef9c54, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide});
  const targetRing = mesh(effects, new THREE.RingGeometry(.9, 1.04, 48), warningMaterial);targetRing.rotation.x = -Math.PI / 2;targetRing.visible = false;
  const targetDot = mesh(effects, new THREE.CircleGeometry(.87, 40), warningFillMaterial);targetDot.rotation.x = -Math.PI / 2;targetDot.visible = false;
  const corridor = mesh(effects, new THREE.PlaneGeometry(2.6, 1), warningFillMaterial.clone());corridor.rotation.x = -Math.PI / 2;corridor.visible = false;
  const corridorOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.6, 1)),new THREE.LineBasicMaterial({color: 0xffda98, transparent: true, opacity: .85, depthWrite: false}));
  corridorOutline.rotation.x = -Math.PI / 2;corridorOutline.visible = false;effects.add(corridorOutline);
  const windGeometry = new THREE.TorusGeometry(.71, .075, 6, 18, Math.PI * 1.4);
  const windMaterial = new THREE.MeshBasicMaterial({color: 0xb4ffdc, transparent: true, opacity: .9, depthWrite: false});
  const windCoreGeometry = new THREE.SphereGeometry(.15, 8, 6);
  const projectiles = [];
  const toHero = new THREE.Vector3(), travel = new THREE.Vector3(), aim = new THREE.Vector3();
  const lockedTarget = new THREE.Vector3(), chargeDirection = new THREE.Vector3();
  const chargeStart = new THREE.Vector3(), chargeEnd = new THREE.Vector3(), previousPosition = new THREE.Vector3();
  let aiState = 'idle', timer = 1.8, attackType = 'wind', attackNumber = 0;
  let windupDuration = 1.4, chargeDistance = 0, chargeTravel = 0, chargeHit = false;
  let isMoving = false, visible = false, visualTime = 0, walkTime = 0, lastPhase = 1, effectGeneration = 0;
  function hideWarning() {targetRing.visible = targetDot.visible = corridor.visible = corridorOutline.visible = false;}
  function clearEffects() {
    effectGeneration++;
    for (const projectile of projectiles) effects.remove(projectile.mesh);
    projectiles.length = 0;hideWarning();
    aiState = 'idle'; timer = 1.3; chargeHit = true; chargeTravel = 0; isMoving = false;
  }
  function reset() {
    clearEffects();attackNumber = 0; attackType = 'wind'; timer = 1.8; visualTime = walkTime = 0;lastPhase = 1;
    body.position.set(0, 1.95, 0); body.rotation.set(0, 0, 0);head.rotation.set(0, 0, 0); neck.rotation.set(0, 0, 0);
    for (const {leg, knee} of legs) { leg.rotation.set(0, 0, 0); knee.rotation.set(0, 0, 0); }
  }
  function setVisible(value) {visible = Boolean(value);root.visible = effects.visible = visible;if (!visible) clearEffects();}
  function snapshot(frozen = false) {
    const tip = frozen ? '定 身 · 趁势近身' : aiState === 'windup'
      ? attackType === 'charge' ? '踏云冲锋 · 离开金色路径' : '青岚风刃 · 离开瞄准圈，侧向闪避'
      : aiState === 'recover' ? '灵鹿回气 · 近身出棍' : '';
    return {state: aiState, timer, attackType, moving: isMoving, tip};
  }
  function segmentDistanceSq(point, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, lengthSq = dx * dx + dz * dz;
    const t = lengthSq ? THREE.MathUtils.clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq, 0, 1) : 0;
    const px = point.x - (a.x + dx * t), pz = point.z - (a.z + dz * t);return px * px + pz * pz;
  }
  function emitWind(phase) {
    aim.copy(lockedTarget).sub(root.position).setY(0);
    if (aim.lengthSq() < .01) aim.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    aim.normalize();
    const count = phase === 2 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const direction = aim.clone().applyAxisAngle(unitUp, (i - (count - 1) / 2) * .24);
      const blade = new THREE.Group();blade.name='Spirit wind blade';
      blade.position.copy(root.position).addScaledVector(direction, 1.25);blade.position.y = .92;blade.rotation.y = Math.atan2(direction.x, direction.z);
      const arc = mesh(blade, windGeometry, windMaterial);arc.rotation.z = -.7;
      const core = mesh(blade, windCoreGeometry, glow, 0, 0, 0, .8, 1.8, .8);core.castShadow = false;arc.castShadow = false;effects.add(blade);
      projectiles.push({mesh: blade, direction, life: 3.5, speed: phase === 2 ? 8.3 : 7.4, previous: blade.position.clone(), arc});
    }
  }
  function updateProjectiles(dt, context) {
    const generation=effectGeneration;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];projectile.previous.copy(projectile.mesh.position);
      projectile.mesh.position.addScaledVector(projectile.direction, projectile.speed * dt);projectile.life -= dt;projectile.arc.rotation.z += dt * 2.2;
      const hit = segmentDistanceSq(context.hero.position, projectile.previous, projectile.mesh.position) < .85 * .85;
      if (hit || projectile.life <= 0 || Math.hypot(projectile.mesh.position.x, projectile.mesh.position.z) > 22) {
        effects.remove(projectile.mesh);projectiles.splice(i, 1);
        if (hit) {context.hurtHero(lastPhase === 2 ? 16 : 13);if (!visible || generation!==effectGeneration || projectiles.length === 0) break;}
      }
    }
  }
  function beginAttack(context) {
    attackNumber++;const distance = toHero.length();attackType = attackNumber % 3 === 0 || distance < 3.4 ? 'charge' : 'wind';
    aiState = 'windup';timer = windupDuration = attackType === 'charge' ? 1.45 : (context.phase === 2 ? 1.15 : 1.4);
    lockedTarget.copy(context.hero.position).setY(0);hideWarning();
    if (attackType === 'wind') {
      targetRing.position.set(lockedTarget.x, .16, lockedTarget.z);targetDot.position.set(lockedTarget.x, .15, lockedTarget.z);targetRing.visible = targetDot.visible = true;
    } else {
      chargeStart.copy(root.position).setY(0);chargeDirection.copy(lockedTarget).sub(chargeStart).setY(0);
      if (chargeDirection.lengthSq() < .01) chargeDirection.set(0, 0, 1);
      chargeDirection.normalize();chargeEnd.copy(chargeStart).addScaledVector(chargeDirection, Math.min(22, Math.max(9, distance + 4)));
      context.keepInArena(chargeEnd, 15.3);chargeDirection.copy(chargeEnd).sub(chargeStart);chargeDistance = chargeDirection.length();chargeDirection.normalize();chargeTravel = 0; chargeHit = false;
      for (const object of [corridor, corridorOutline]) {
        object.position.copy(chargeStart).add(chargeEnd).multiplyScalar(.5);object.position.y = object === corridor ? .155 : .17;
        object.rotation.set(-Math.PI / 2, 0, Math.atan2(chargeDirection.x, chargeDirection.z));object.scale.set(1, chargeDistance, 1);object.visible = true;
      }
    }
  }
  function updateAI(delta, context) {
    const dt = Math.min(.1, Math.max(0, delta)),generation=effectGeneration;isMoving = false;
    if (!visible) return snapshot();if (context.frozen > 0) return snapshot(true);
    lastPhase = context.phase === 2 ? 2 : 1;updateProjectiles(dt, context);
    if (!visible || generation!==effectGeneration) return snapshot();
    timer -= dt;toHero.copy(context.hero.position).sub(root.position).setY(0);const distance = toHero.length();
    if (aiState === 'idle') {
      context.face(root, context.hero.position, dt * .8);const retreat = distance < 5.2 ? -1 : distance > 9.3 ? 1 : 0;
      if (distance > .05) {
        travel.copy(toHero).multiplyScalar(1 / distance);const side = attackNumber % 2 ? 1 : -1,tx = travel.x;
        travel.set(travel.x * retreat + travel.z * side * .38, 0, travel.z * retreat - tx * side * .38);
        root.position.addScaledVector(travel, dt * (lastPhase === 2 ? 2.4 : 1.9));isMoving = true;
      }
      if (timer <= 0) beginAttack(context);
    } else if (aiState === 'windup') {
      context.face(root, attackType === 'charge' ? chargeEnd : lockedTarget, dt * .9);const progress = 1 - Math.max(0, timer) / windupDuration;
      warningMaterial.opacity = .5 + progress * .35;warningFillMaterial.opacity = .12 + progress * .14;corridor.material.opacity = .11 + progress * .17;targetRing.scale.setScalar(1.35 - progress * .35);
      if (timer <= 0) {hideWarning();aiState = 'strike';timer = attackType === 'charge' ? chargeDistance / (lastPhase === 2 ? 15 : 13) : .25;if (attackType === 'wind') emitWind(lastPhase);}
    } else if (aiState === 'strike') {
      if (attackType === 'charge') {
        const step = Math.min(Math.max(0, chargeDistance - chargeTravel), dt * (lastPhase === 2 ? 15 : 13));
        previousPosition.copy(root.position);root.position.addScaledVector(chargeDirection, step);chargeTravel += step;isMoving = true;
        if (!chargeHit && segmentDistanceSq(context.hero.position, previousPosition, root.position) < 1.55 * 1.55) {
          chargeHit = true;context.hurtHero(lastPhase === 2 ? 26 : 23);if (!visible || generation!==effectGeneration) return snapshot();
        }
      }
      if (timer <= 0) {aiState = 'recover';timer = attackType === 'charge' ? 2.4 : (lastPhase === 2 ? 1.65 : 1.95);isMoving = false;}
    } else if (aiState === 'recover' && timer <= 0) {aiState = 'idle';timer = lastPhase === 2 ? .9 : 1.35;}
    context.keepInArena(root.position, 15.3);return snapshot();
  }
  function animate(dt, time, state = {}) {
    if (!visible) return;const frozen = Boolean(state.frozen),dead = Boolean(state.dead);
    if (dead && (projectiles.length || aiState !== 'idle')) clearEffects();
    if (!frozen) visualTime += Math.min(.1, Math.max(0, dt));
    const t = visualTime,moving = !frozen && !dead && Boolean(state.moving ?? isMoving);
    if (moving) walkTime += dt * (aiState === 'strike' ? 15 : 7.5);
    const hit = Math.max(0, state.hit || 0);
    body.position.y = dead ? .75 : 1.95 + (moving ? Math.abs(Math.sin(walkTime)) * .075 : Math.sin(t * 2) * .035);
    body.rotation.z = dead ? 1.18 : Math.sin(t * 1.6) * .025 + hit * .13;
    body.rotation.x = dead ? -.18 : aiState === 'windup' && attackType === 'charge' ? .14 : aiState === 'recover' ? .04 : 0;
    neck.rotation.x = dead ? .4 : aiState === 'windup' ? (attackType === 'charge' ? .48 : -.17) : aiState === 'recover' ? .17 : Math.sin(t * 1.1) * .04;
    head.rotation.y = Math.sin(t * .75) * .045;head.rotation.z = hit * -.12;tail.rotation.y = Math.sin(t * 2.4) * .3;
    for (const {leg, knee, phase} of legs) {
      leg.rotation.x = dead ? -.7 : moving ? Math.sin(walkTime + phase) * .47 : Math.sin(t * 1.2 + phase) * .015;
      knee.rotation.x = dead ? .9 : moving ? Math.max(0, Math.sin(walkTime + phase - .4)) * .52 : .03;
    }
    for (const {ribbon, original, side} of ribbons) {
      const position = ribbon.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const base = i * 3, along = Math.abs(original[base + 2]) / 2.6;
        position.setXYZ(i, original[base] + Math.sin(t * 3.1 + along * 5 + side) * along * .2,
          original[base + 1] + Math.sin(t * 3.8 + along * 6) * along * .16 + .2 * along, original[base + 2]);
      }
      position.needsUpdate = true;
    }
    glow.emissiveIntensity = frozen ? .5 : (state.phase === 2 ? 2.35 : 1.65) + Math.sin(t * 2.2) * .25;
    jade.emissive.setHex(frozen ? 0x437fbd : hit > .1 ? 0x6c8354 : 0x173f36);jade.emissiveIntensity = frozen ? .65 : .18 + hit * .7;
  }
  return {root, animate, reset, updateAI, clearEffects, setVisible};
}
