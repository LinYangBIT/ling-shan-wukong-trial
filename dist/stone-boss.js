// Original obsidian ape. The encounter owns its hazards; placement belongs to main.
export function createStoneBoss(THREE, scene) {
  const root = new THREE.Group();
  root.name = '熔岩石猿'; root.position.set(0, 0, -5); root.visible = false;
  scene.add(root);
  const effects = new THREE.Group();
  effects.name = 'Stone ape hazards'; effects.visible = false; scene.add(effects);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: .88, metalness: .16, flatShading: true, ...extra});
  const rock = mat(0x252b30), edge = mat(0x485153), faceRock = mat(0x171b20);
  const lava = mat(0xff8532, {emissive: 0xff3e0c, emissiveIntensity: 1.9, roughness: .42});
  const core = mat(0xffdf88, {emissive: 0xff781b, emissiveIntensity: 2.8});
  const ore = mat(0xa96735, {metalness: .5, roughness: .52});
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const add = (parent, geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const stone = (parent, material, x, y, z, sx, sy, sz) => add(parent, rockGeometry, material, x, y, z, sx, sy, sz);
  const joint = (parent, x, y, z) => {const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group); return group;};
  const seam = (parent, a, b, radius = .035, material = lava) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const mesh = add(parent, new THREE.CylinderGeometry(radius, radius, direction.length(), 5), material);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(up, direction.normalize()); return mesh;
  };
  const torso = joint(root, 0, 1.6, 0);
  stone(torso, rock, 0, .45, 0, 1.15, 1.12, .7);
  stone(torso, edge, 0, -.18, -.02, .76, .68, .62);
  stone(torso, faceRock, 0, .1, .58, .61, .63, .19);
  const heart = add(torso, new THREE.OctahedronGeometry(.31), core, 0, .48, .72, 1, 1.3, .5);
  const armorPlates = [];
  for (const side of [-1, 1]) {
    const plate = stone(torso, edge, side * .59, .68, .46, .56, .43, .38);
    plate.rotation.z = side * -.18; armorPlates.push(plate);
    seam(torso, [side * .13, .78, .7], [side * .47, 1.02, .55]);
    seam(torso, [side * .47, 1.02, .55], [side * .83, .78, .6]);
    seam(torso, [side * .18, .24, .69], [side * .53, -.08, .58]);
    seam(torso, [side * .53, -.08, .58], [side * .67, -.38, .44]);
  }
  const head = joint(torso, 0, 1.37, .03);
  stone(head, rock, 0, .2, 0, .55, .63, .48);
  stone(head, faceRock, 0, -.01, .39, .47, .42, .28);
  stone(head, edge, 0, -.18, .56, .43, .19, .24);
  stone(head, rock, 0, .06, .62, .22, .13, .12);
  add(head, blockGeometry, faceRock, 0, -.2, .77, .43, .04, .018);
  for (const side of [-1, 1]) {
    const brow = stone(head, edge, side * .26, .31, .4, .31, .15, .21); brow.rotation.z = side * -.16;
    stone(head, core, side * .235, .2, .54, .09, .035, .04);
    stone(head, rock, side * .56, .14, -.03, .16, .24, .18);
    seam(head, [side * .12, .5, .39], [side * .3, .73, .17], .024);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = joint(torso, side * 1.2, .82, 0);
    const shoulder = stone(arm, edge, side * .15, 0, 0, .68, .62, .69);
    shoulder.rotation.z = side * .3; armorPlates.push(shoulder);
    stone(arm, rock, side * .27, -.56, .02, .48, .7, .47);
    const fist = joint(arm, side * .34, -1.15, .12);
    stone(fist, rock, 0, -.15, .1, .61, .52, .63);
    stone(fist, edge, 0, -.02, .53, .55, .26, .2);
    for (let i = 0; i < 3; i++) seam(fist, [-.3 + i * .3, .15, .57], [-.3 + i * .3, -.25, .59], .03);
    seam(arm, [side * .02, .25, .56], [side * .27, -.27, .44]);
    seam(arm, [side * .27, -.27, .44], [side * .4, -.7, .41]);
    arms.push({arm, fist, side});
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = joint(root, side * .56, 1.43, -.03);
    stone(leg, rock, 0, -.34, 0, .43, .6, .44);
    stone(leg, edge, 0, -.84, .08, .35, .47, .38);
    stone(leg, rock, 0, -1.2, .3, .48, .23, .63);
    seam(leg, [side * .1, -.56, .36], [side * -.04, -1.03, .4], .032);
    legs.push({leg, side});
  }
  const armorCrown = stone(torso, ore, 0, 1.02, -.61, .76, .27, .2);
  armorPlates.push(armorCrown);
  root.userData.rig = {torso, head, leftArm: arms[0].arm, rightArm: arms[1].arm, leftLeg: legs[0].leg, rightLeg: legs[1].leg};
  root.userData.encounter = 'stone'; root.userData.combatRadius = 1.45; root.userData.hitHeight = 2.4;

  const warningMaterial = new THREE.MeshBasicMaterial({color: 0xffb964, transparent: true, opacity: .76, side: THREE.DoubleSide, depthWrite: false});
  const fillMaterial = new THREE.MeshBasicMaterial({color: 0xf26523, transparent: true, opacity: .11, side: THREE.DoubleSide, depthWrite: false});
  const waveMaterial = new THREE.MeshBasicMaterial({color: 0xffa44d, transparent: true, opacity: .85, depthWrite: false});
  const warningGeometry = new THREE.RingGeometry(.93, 1, 64);
  const circleGeometry = new THREE.CircleGeometry(1, 48);
  const waveGeometry = new THREE.TorusGeometry(1, .038, 5, 64);
  const warning = add(effects, warningGeometry, warningMaterial);
  warning.name = 'Stone slam boundary'; warning.rotation.x = -Math.PI / 2; warning.visible = false;
  const warningFill = add(effects, circleGeometry, fillMaterial);
  warningFill.rotation.x = -Math.PI / 2; warningFill.visible = false;
  const waves = [], meteors = [];
  const direction = new THREE.Vector3();
  let visible = false, state = 'idle', timer = 1.8, attackType = 'slam', moving = false;
  let armor = 3, vulnerableRemaining = 0, attackNumber = 0, queuedMeteors = 0, spawnTimer = 0;
  let effectGeneration = 0, windupDuration = 1.45, visualTime = 0, walkTime = 0;

  const broken = () => armor === 0;
  function getState() {
    const tip = state === 'windup' ? attackType === 'slam' ? '双拳震地 · 远离石猿或迎浪闪避' : '陨石落印 · 立刻离开橙色圆圈'
      : state === 'strike' && attackType === 'meteor' ? '连星坠地 · 持续走位'
      : state === 'recover' ? broken() ? '石甲崩裂 · 趁势重击' : '石猿回气 · 重棍破甲'
      : broken() ? '破甲易伤 · 近身出棍' : '重铠护体 · 重棍可破甲';
    return {state, timer, attackType, moving, tip, armor, maxArmor: 3, broken: broken(), vulnerableRemaining,
      pendingHazards: waves.length + meteors.filter(meteor => !meteor.resolved).length, queuedMeteors};
  }
  function clearEffects() {
    effectGeneration++;
    for (const wave of waves) effects.remove(wave.mesh);
    for (const meteor of meteors) effects.remove(meteor.group);
    waves.length = meteors.length = 0;
    warning.visible = warningFill.visible = false;
    queuedMeteors = 0; spawnTimer = 0; state = 'idle'; timer = 1.3; moving = false;
  }
  function reset() {
    clearEffects(); armor = 3; vulnerableRemaining = 0; attackNumber = 0;
    attackType = 'slam'; timer = 1.8; visualTime = walkTime = 0;
    torso.position.set(0, 1.6, 0); torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    for (const {arm} of arms) arm.rotation.set(0, 0, 0);
    for (const {leg} of legs) leg.rotation.set(0, 0, 0);
  }
  function setVisible(value) {visible = Boolean(value); root.visible = effects.visible = visible; if (!visible) clearEffects();}
  function resolveHit(amount, {heavy = false} = {}) {
    if (!Number.isFinite(amount) || amount <= 0 || !visible) return {damage: 0, armor, maxArmor: 3, broken: broken(), tip: ''};
    let tip = '';
    if (armor > 0 && heavy) {
      armor--;
      tip = armor > 0 ? `重棍裂甲 · 还剩 ${armor} 层` : '石甲崩裂 · 七息易伤';
      if (armor === 0) {
        clearEffects(); vulnerableRemaining = 7; state = 'recover'; timer = 2;
      }
    }
    const damage = amount * (broken() ? 1.25 : heavy ? 1 : .35);
    if (!tip && !broken() && !heavy) tip = '石甲卸力 · 用重棍破甲';
    return {damage, armor, maxArmor: 3, broken: broken(), tip};
  }
  function spawnWave(phase) {
    const mesh = add(effects, waveGeometry, waveMaterial);
    mesh.name = 'Stone shockwave'; mesh.position.copy(root.position); mesh.position.y = .23;
    mesh.rotation.x = -Math.PI / 2; mesh.scale.setScalar(.5); mesh.castShadow = false;
    waves.push({mesh, radius: .5, maxRadius: 11.2, speed: phase === 2 ? 11.2 : 9.5, hit: false, damage: phase === 2 ? 29 : 24});
  }
  function spawnMeteor(context) {
    const group = new THREE.Group(); group.name = 'Stone meteor warning';
    group.position.copy(context.hero.position).setY(0); effects.add(group);
    const radius = context.phase === 2 ? 1.85 : 1.65;
    const ring = add(group, warningGeometry, warningMaterial, 0, .17, 0, radius, radius, radius); ring.rotation.x = -Math.PI / 2;
    const fill = add(group, circleGeometry, fillMaterial, 0, .16, 0, radius, radius, radius); fill.rotation.x = -Math.PI / 2;
    const boulder = stone(group, rock, 0, 6.5, 0, .7, .85, .7); boulder.visible = false;
    const hot = stone(boulder, lava, .15, -.2, .45, .37, .59, .2);
    hot.castShadow = false;
    const impact = add(group, waveGeometry, waveMaterial, 0, .22, 0); impact.rotation.x = -Math.PI / 2; impact.visible = false;
    meteors.push({group, ring, fill, boulder, impact, radius, life: 1.3, resolved: false, damage: context.phase === 2 ? 25 : 21});
  }
  function updateHazards(dt, context, generation) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i], previous = wave.radius;
      wave.radius = Math.min(wave.maxRadius, wave.radius + dt * wave.speed);
      wave.mesh.scale.setScalar(wave.radius);
      const distance = Math.hypot(context.hero.position.x - wave.mesh.position.x, context.hero.position.z - wave.mesh.position.z);
      if (!wave.hit && distance >= previous - .65 && distance <= wave.radius + .65 && distance <= wave.maxRadius) {
        wave.hit = true; context.hurtHero(wave.damage);
        if (!visible || generation !== effectGeneration) return false;
      }
      if (wave.radius >= wave.maxRadius) {effects.remove(wave.mesh); waves.splice(i, 1);}
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const meteor = meteors[i]; meteor.life -= dt;
      if (!meteor.resolved) {
        const progress = 1 - Math.max(0, meteor.life) / 1.3;
        meteor.ring.scale.setScalar(meteor.radius * (1.2 - progress * .2));
        meteor.boulder.visible = meteor.life < .28;
        meteor.boulder.position.y = Math.max(.3, meteor.life / .28 * 6.5);
        meteor.boulder.rotation.y += dt * 2;
        if (meteor.life <= 0) {
          meteor.resolved = true; meteor.life = .45;
          meteor.ring.visible = meteor.fill.visible = meteor.boulder.visible = false; meteor.impact.visible = true;
          const distance = Math.hypot(context.hero.position.x - meteor.group.position.x, context.hero.position.z - meteor.group.position.z);
          if (distance < meteor.radius + .35) {
            context.hurtHero(meteor.damage);
            if (!visible || generation !== effectGeneration) return false;
          }
        }
      } else {
        meteor.impact.scale.setScalar(meteor.radius * (1 + (.45 - meteor.life) * 1.3));
        if (meteor.life <= 0) {effects.remove(meteor.group); meteors.splice(i, 1);}
      }
    }
    return true;
  }
  function beginAttack(context, distance) {
    attackNumber++;
    attackType = distance > 8 || attackNumber % 2 === 0 ? 'meteor' : 'slam';
    state = 'windup'; moving = false;
    timer = windupDuration = attackType === 'slam' ? (context.phase === 2 ? 1.25 : 1.45) : 1.3;
    if (attackType === 'slam') {
      for (const object of [warning, warningFill]) {
        object.position.copy(root.position); object.position.y = object === warning ? .16 : .15;
        object.scale.setScalar(11.2); object.visible = true;
      }
    } else {
      spawnMeteor(context); queuedMeteors = context.phase === 2 ? 2 : 1; spawnTimer = .65;
    }
  }
  function updateAI(delta, context) {
    const dt = Math.min(.1, Math.max(0, delta)), generation = effectGeneration;
    moving = false;
    if (!visible) return getState();
    if (context.frozen > 0) return {...getState(), tip: '定 身 · 重棍破甲'};
    if (vulnerableRemaining > 0) {
      vulnerableRemaining = Math.max(0, vulnerableRemaining - dt);
      if (vulnerableRemaining === 0) armor = 3;
    }
    if (!updateHazards(dt, context, generation)) return getState();
    if ((state === 'windup' || state === 'strike') && queuedMeteors > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {spawnMeteor(context); queuedMeteors--; spawnTimer += .65;}
    }
    timer -= dt;
    direction.copy(context.hero.position).sub(root.position).setY(0);
    const distance = direction.length();
    if (state === 'idle') {
      context.face(root, context.hero.position, dt * .55);
      if (distance > 4.7) {
        root.position.addScaledVector(direction.normalize(), dt * (context.phase === 2 ? 1.7 : 1.3)); moving = true;
      }
      if (timer <= 0) beginAttack(context, distance);
    } else if (state === 'windup') {
      context.face(root, context.hero.position, dt * .35);
      if (timer <= 0) {
        warning.visible = warningFill.visible = false;
        state = 'strike';
        if (attackType === 'slam') {spawnWave(context.phase); timer = 1.25;}
        else timer = context.phase === 2 ? 1.75 : 1.1;
      }
    } else if (state === 'strike' && timer <= 0) {
      state = 'recover'; timer = attackType === 'slam' ? 2.6 : 2.35;
    } else if (state === 'recover' && timer <= 0) {
      state = 'idle'; timer = context.phase === 2 ? .8 : 1.2;
    }
    context.keepInArena(root.position, 14.8);
    return getState();
  }
  function animate(dt, time, pose = {}) {
    if (!visible) return;
    if (pose.dead && (waves.length || meteors.length || queuedMeteors || state !== 'idle')) clearEffects();
    if (!pose.frozen) visualTime += Math.min(.1, Math.max(0, dt));
    const t = visualTime, walking = !pose.frozen && !pose.dead && Boolean(pose.moving ?? moving);
    if (walking) walkTime += dt * 5.5;
    const hit = Math.max(0, Number.isFinite(pose.hit) ? pose.hit : 0);
    const charging = state === 'windup', slamming = state === 'strike' && attackType === 'slam';
    torso.position.y = pose.dead ? .8 : 1.6 + (walking ? Math.abs(Math.sin(walkTime)) * .08 : Math.sin(t * 1.4) * .035);
    torso.rotation.x = pose.dead ? 1.05 : slamming ? .28 : charging && attackType === 'slam' ? -.1 : broken() && state === 'recover' ? .24 : .03;
    torso.rotation.z = pose.dead ? .24 : hit * .09;
    head.rotation.x = pose.dead ? .3 : broken() && state === 'recover' ? .25 : -.04;
    for (const {arm, side} of arms) {
      arm.rotation.x = pose.dead ? -.5 : charging ? (attackType === 'slam' ? -2.25 : -1.4) : slamming ? -.32 : walking ? Math.sin(walkTime + (side < 0 ? Math.PI : 0)) * .22 : .08;
      arm.rotation.z = side * (charging ? .25 : .12);
    }
    for (const {leg, side} of legs) leg.rotation.x = pose.dead ? -.6 : walking ? Math.sin(walkTime + (side < 0 ? Math.PI : 0)) * .28 : -.025;
    const exposed = broken();
    for (let i = 0; i < armorPlates.length; i++) armorPlates[i].visible = !exposed || i % 2 === 0;
    heart.rotation.y = t * .3;
    heart.scale.set(exposed ? 1.25 : 1, exposed ? 1.6 : 1.3, .5);
    lava.emissiveIntensity = pose.frozen ? .65 : (pose.phase === 2 ? 2.3 : 1.7) + Math.sin(t * 3) * .18;
    core.emissiveIntensity = exposed ? 4 : 2.6;
    rock.emissive.setHex(pose.frozen ? 0x245b84 : hit > .1 ? 0x6b260c : 0x000000);
    rock.emissiveIntensity = pose.frozen ? .55 : hit * .5;
  }
  return {root, setVisible, reset, clearEffects, updateAI, animate, resolveHit, getState};
}
