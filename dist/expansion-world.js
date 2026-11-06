import { mountainGeometry, bambooLeafGeometry, flowTexture, mistLayer } from './scenic-details.js';

// Procedural Moonwood, Ember Pass and Stone King's arena. All gameplay clocks live in step().
export function createExpansionWorld(THREE, scene) {
  const kinds = ['moonwood', 'emberpass', 'stoneking'];
  const groups = Object.fromEntries(kinds.map(kind => {
    const group = new THREE.Group(); group.name = `Expansion · ${kind}`; group.visible = false; scene.add(group); return [kind, group];
  }));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  let seed = 90371, activeStage = null, generation = 0;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const state = Object.fromEntries(kinds.map(kind => [kind, { collected: new Set(), z: 90, complete: false }]));
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .88, flatShading: true, ...extra });
  const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  const M = {
    moonStone: material(0x788b9b), moonEdge: material(0x455d76), moonSoil: material(0x263e51), moonRock: material(0x31495e),
    moonFar: material(0x5c688b), moonLeaf: material(0x668a92, { side: THREE.DoubleSide }), moonLeafDark: material(0x3c6670, { side: THREE.DoubleSide }), moonBamboo: material(0x476e6e), moonNode: material(0x83a6a2),
    moonWater: material(0x4c8fba, { metalness: .27, roughness: .26 }), moonSilver: material(0x9dd9e5, { metalness: .3 }),
    violet: material(0x9975bd, { emissive: 0x51358d, emissiveIntensity: .8 }), cyan: material(0x87d6d9, { emissive: 0x3b8796, emissiveIntensity: .9 }),
    rune: basic(0xbcebe5), runeHalo: basic(0x85c5e7, .55), moon: basic(0xc6d5f2),
    emberStone: material(0x8c685b), emberEdge: material(0x55443f), emberRock: material(0x6b4840), emberFar: material(0xa27067),
    emberWood: material(0x80604b), emberMetal: material(0xbd8c5a, { metalness: .3 }), maple: material(0xd27645), mapleRed: material(0xaa4942),
    trunk: material(0x53413b), obsidian: material(0x2e3039, { metalness: .22, roughness: .56 }), basalt: material(0x565155),
    lava: basic(0xe97638), lavaHot: basic(0xffc468), warning: basic(0xffb04f, .65), impact: basic(0xffe0a2, .65),
    warmGlow: material(0xe99d55, { emissive: 0xdd5d25, emissiveIntensity: 1.4 }), ash: basic(0xffb482)
  };
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1), rock: new THREE.IcosahedronGeometry(1, 1),
    sphere: new THREE.IcosahedronGeometry(1, 2), cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.ConeGeometry(1, 1, 7), disc: new THREE.CylinderGeometry(1, 1, 1, 40),
    crystal: new THREE.OctahedronGeometry(1), leaf: bambooLeafGeometry(THREE),
    ridges: [0, 1, 2].map(variant => mountainGeometry(THREE, variant))
  };
  const batches = new Map(kinds.map(kind => [kind, new Map()]));
  const dummy = new THREE.Object3D();
  function put(kind, geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const key = geometry.uuid + ':' + mat.uuid, batch = batches.get(kind);
    if (!batch.has(key)) batch.set(key, { geometry, mat, matrices: [] });
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rx, ry, rz); dummy.updateMatrix();
    batch.get(key).matrices.push(dummy.matrix.clone());
  }
  function mesh(kind, geometry, mat, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, mat); object.position.set(x, y, z); object.receiveShadow = true; groups[kind].add(object); return object;
  }
  function pathX(kind, z) {
    const t = clamp((90 - z) / 72, 0, 1);
    return kind === 'emberpass' ? Math.sin(t * Math.PI * 2) * 3.8 - Math.sin(t * Math.PI * 3) * .7 : Math.sin(t * Math.PI * 2) * 4.2 + Math.sin(t * Math.PI) * .9;
  }
  function samplePath(kind, progress) {
    if (kind === 'stoneking') return new THREE.Vector3(0, 0, 12 - clamp(Number.isFinite(progress) ? progress : 0, 0, 1) * 16);
    const z = 90 - clamp(Number.isFinite(progress) ? progress : 0, 0, 1) * 72;
    return new THREE.Vector3(pathX(kind, z), 0, z);
  }
  function clampPosition(kind, position) {
    if (kind === 'stoneking') {
      if (!Number.isFinite(position.x)) position.x = 0;
      if (!Number.isFinite(position.z)) position.z = 0;
      const radius = Math.hypot(position.x, position.z);
      if (radius > 16.4) { position.x *= 16.4 / radius; position.z *= 16.4 / radius; }
      return position;
    }
    const minZ = kind === 'moonwood' && state.moonwood.collected.size < 3 ? 20 : 18;
    position.z = clamp(Number.isFinite(position.z) ? position.z : 90, minZ, 94);
    position.x = clamp(Number.isFinite(position.x) ? position.x : 0, pathX(kind, position.z) - 4, pathX(kind, position.z) + 4);
    return position;
  }
  function ribbon(kind, width, y, mat, offset = 0) {
    const vertices = [], indices = [], uv = [];
    for (let i = 0; i <= 152; i++) {
      const z = 94 - i * .5, x = pathX(kind, z) + offset;
      vertices.push(x - width, y, z, x + width, y, z);
      uv.push(0, i * .07, 1, i * .07);
      if (i < 152) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const object = mesh(kind, geometry, mat); object.name = `${kind} surface ${offset === 0 ? 'path' : 'stream'}`; return object;
  }
  const animated = [], particles = [];
  function particleField(kind, color, count, area, yBase, height, size) {
    const coordinates = new Float32Array(count * 3), seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const z = kind === 'stoneking' ? (random() - .5) * area : 18 + random() * 76;
      seeds.set([(kind === 'stoneking' ? 0 : pathX(kind, z)) + (random() - .5) * area, yBase + random() * height, z], i * 3);
    }
    coordinates.set(seeds);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(coordinates, 3)); geometry.computeBoundingSphere(); geometry.boundingSphere.radius += 2;
    const object = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, transparent: true, opacity: .82, depthWrite: false }));
    groups[kind].add(object); particles.push({ kind, object, seeds, coordinates, yBase, height });
  }
  function distantRidges(kind, mat, count, radius, zCenter) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2, height = 15 + random() * 25;
      const x = Math.sin(angle) * (radius + random() * 16), z = zCenter + Math.cos(angle) * (radius + random() * 12);
      put(kind, G.ridges[i % G.ridges.length], mat, x, -8, z, 10 + random() * 9, height, 9 + random() * 11, 0, random() * 6.28);
    }
  }
  function stoneLamp(kind, x, z, warm = false) {
    const edge = warm ? M.emberEdge : M.moonEdge;
    put(kind, G.box, edge, x, .14, z, .62, .28, .62);
    put(kind, G.cylinder, edge, x, .66, z, .13, .9, .13);
    put(kind, G.crystal, warm ? M.warmGlow : M.cyan, x, 1.25, z, .19, .33, .19);
    put(kind, G.cone, edge, x, 1.61, z, .43, .24, .43);
  }

  // Moonwood: a clear stone path beside an open creek, blue bamboo and luminescent undergrowth.
  // Lower valley soil and two separate banks ground the creek without covering its water.
  ribbon('moonwood', 27, -1.25, M.moonRock, -8);
  ribbon('moonwood', 1.4, -.5, M.moonSoil, -6.8);
  ribbon('moonwood', 5.2, -.5, M.moonSoil, -18.5);
  ribbon('moonwood', 6.1, -.15, M.moonSoil);
  ribbon('moonwood', 4.25, -.018, M.moonStone);
  const creekTexture = flowTexture(THREE);
  if (creekTexture) { M.moonWater.map = creekTexture; M.moonWater.color.set(0xc1dce7); }
  ribbon('moonwood', 2.6, -.8, M.moonWater, -10.7);
  put('moonwood', G.disc, M.moonWater, pathX('moonwood', 48) - 13.5, -.82, 48, 7.1, .08, 8.5);
  for (let z = 18.8; z <= 93; z += 1.6) {
    for (const side of [-1, 1]) put('moonwood', G.box, Math.round(z) % 3 ? M.moonStone : M.moonEdge, pathX('moonwood', z) + side * 1.53, -.055, z, 2.92, .09, 1.47);
  }
  for (let i = 0; i < 84; i++) {
    const z = 20 + random() * 72, side = i % 2 ? -1 : 1;
    const x = pathX('moonwood', z) + side * (side < 0 ? 22 + random() * 7 : 7.2 + random() * 10);
    const h = 6 + random() * 5;
    put('moonwood', G.rock, M.moonSoil, x, -.9, z, 2.1, 1.1, 2.1);
    put('moonwood', G.cylinder, M.moonBamboo, x, h / 2, z, .08, h, .08, 0, 0, (random() - .5) * .03);
    for (let y = 1.1; y < h; y += 1.3) put('moonwood', G.cylinder, M.moonNode, x, y, z, .1, .045, .1);
    for (let j = 0; j < 3; j++) {
      const a = random() * 6.28;
      const bx = x + Math.cos(a) * .45, bz = z + Math.sin(a) * .45, by = h * (.68 + j * .12);
      put('moonwood', G.cylinder, M.moonBamboo, bx, by, bz, .032, 1.5, .032, Math.PI / 2, 0, a);
      for (let blade = 0; blade < 7; blade++) {
        const angle = a + (blade - 3) * .27, length = .7 + (blade % 3) * .22;
        put('moonwood', G.leaf, blade % 2 ? M.moonLeaf : M.moonLeafDark, bx, by + (blade % 2) * .07, bz, length, 1, length, -.12, angle, -.18 + blade * .045);
      }
    }
  }
  // Reeds, pebbles and small silver ripples make both creek banks legible.
  for (let i = 0; i < 90; i++) {
    const z = 21 + random() * 70, side = i % 2 ? -1 : 1, x = pathX('moonwood', z) - 10.7 + side * (2.9 + random() * .8);
    put('moonwood', G.rock, i % 3 ? M.moonRock : M.moonEdge, x, -.53, z, .22 + random() * .4, .17 + random() * .2, .25 + random() * .4, 0, random() * 6);
    for (let blade = 0; blade < 3; blade++) put('moonwood', G.leaf, M.moonLeafDark, x + .12, -.43, z, .5, 1, .55, 0, blade * 2.1, 1.2);
  }
  for (let i = 0; i < 48; i++) {
    const z = 20 + random() * 71, side = i % 2 ? -1 : 1, x = pathX('moonwood', z) + side * (5.05 + random() * .5), s = .25 + random() * .25;
    put('moonwood', G.cylinder, M.moonSilver, x, s * .55, z, .065, s * 1.1, .065);
    put('moonwood', G.sphere, i % 3 ? M.cyan : M.violet, x, s * 1.25, z, s, s * .38, s);
  }
  for (const z of [89, 77, 63, 51, 39, 26, 19]) for (const side of [-1, 1]) stoneLamp('moonwood', pathX('moonwood', z) + side * 5.7, z);
  const moonGate = mesh('moonwood', new THREE.TorusGeometry(5.25, .23, 7, 42, Math.PI), M.moonSilver, pathX('moonwood', 23), .12, 23);
  moonGate.name = 'Moon gate arch';
  for (const side of [-1, 1]) put('moonwood', G.box, M.moonEdge, pathX('moonwood', 23) + side * 5.25, .1, 23, 1.2, .2, 1.5);
  const moonDisc = mesh('moonwood', new THREE.CircleGeometry(3, 40), M.moon, -18, 24, -15); moonDisc.name = 'Distant moon';
  distantRidges('moonwood', M.moonFar, 16, 61, 54);
  const moonMist = mistLayer(THREE, groups.moonwood, { color: 0xa0d8e7, opacity: .28,
    patches: [27, 43, 60, 78].map(z => [pathX('moonwood', z) - 11, -.28, z, 12, 24]) });
  particleField('moonwood', 0x9fe5d6, 100, 26, .8, 7, .085);

  const tokens = [72, 48, 28].map((z, i) => {
    const x = pathX('moonwood', z) + (i % 2 ? -2 : 2), root = new THREE.Group();
    root.name = `Moonwood spirit seal ${i + 1}`; root.position.set(x, 1.42, z); groups.moonwood.add(root);
    const crystal = new THREE.Mesh(G.crystal, M.rune); crystal.scale.set(.24, .62, .2); root.add(crystal);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.63, .022, 5, 28), M.runeHalo); root.add(halo);
    const marker = mesh('moonwood', new THREE.RingGeometry(.62, .72, 28), M.runeHalo, x, .025, z); marker.rotation.x = -Math.PI / 2;
    animated.push({ kind: 'moonwood', root, halo, baseY: 1.42, phase: i * 1.7 });
    return { id: `moon-${i + 1}`, x, z, root, marker, name: ['照溪灵符', '映竹灵符', '问月灵符'][i] };
  });

  // Ember Pass: a level, supported cliff boardwalk with a separate lava stream below its open side.
  ribbon('emberpass', 6, -.18, M.emberEdge);
  ribbon('emberpass', 4.3, -.045, M.emberWood);
  ribbon('emberpass', 4.3, -4.5, M.lava, 13);
  ribbon('emberpass', .42, -4.46, M.lavaHot, 12.2);
  for (let z = 18.5; z <= 94; z += .83) {
    put('emberpass', G.box, Math.round(z * 3) % 4 ? M.emberWood : M.emberStone, pathX('emberpass', z), -.055, z, 8.5, .1, .79);
  }
  for (let z = 20; z < 94; z += 8) {
    const x = pathX('emberpass', z);
    for (const side of [-1, 1]) {
      put('emberpass', G.box, M.emberStone, x + side * 5.05, -4.9, z, .58, 9.6, .62);
      put('emberpass', G.rock, M.emberRock, x + side * 5.05, -10.1, z, 3.6, 1.3, 3.6);
      stoneLamp('emberpass', x + side * 5.5, z, true);
    }
    put('emberpass', G.rock, M.emberRock, x - 14.8, -2, z, 6.6, 11 + random() * 6, 5.5, 0, random() * .7);
  }
  for (let i = 0; i < 17; i++) {
    const z = 21 + i * 4.1, x = pathX('emberpass', z) - 8 - random() * 2.2, h = 3.6 + random() * 1.4;
    put('emberpass', G.rock, M.emberRock, x, -1, z, 2.5, 1.2, 2.2);
    put('emberpass', G.cylinder, M.trunk, x, h / 2, z, .14, h, .14);
    for (let j = 0; j < 4; j++) put('emberpass', G.rock, j % 2 ? M.maple : M.mapleRed, x + Math.sin(j * 2.3) * 1.1, h + j * .2, z + Math.cos(j * 2.3) * 1.1, 1.6, .75, 1.4, 0, j);
  }
  distantRidges('emberpass', M.emberFar, 15, 65, 53);
  const emberMist = mistLayer(THREE, groups.emberpass, { color: 0xe0a095, opacity: .25,
    patches: [25, 48, 70, 88].map(z => [pathX('emberpass', z) + 23, -3.3, z, 26, 29]) });
  particleField('emberpass', 0xf5bf87, 65, 30, .5, 8, .075);

  const hazards = [71, 48, 28].map((z, i) => {
    const offset = [-1.45, 1.45, 0][i], x = pathX('emberpass', z) + offset;
    const root = new THREE.Group(); root.name = `Ember falling rock ${i + 1}`; root.visible = false; groups.emberpass.add(root);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1.85, 40), M.warning.clone()); fill.rotation.x = -Math.PI / 2; fill.position.set(x, .055, z); root.add(fill);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.77, 1.93, 40), basic(0xffd17a, .9)); ring.rotation.x = -Math.PI / 2; ring.position.set(x, .065, z); root.add(ring);
    const rock = new THREE.Mesh(G.rock, M.emberRock); rock.position.set(x, 10, z); rock.scale.set(1.2, 1.5, 1.1); rock.visible = false; rock.castShadow = true; root.add(rock);
    const impact = new THREE.Mesh(new THREE.RingGeometry(.7, 1, 32), M.impact.clone()); impact.rotation.x = -Math.PI / 2; impact.position.set(x, .075, z); impact.visible = false; root.add(impact);
    root.userData.hazard = { x, z, radius: 1.85, warningDuration: 1.5, fallDuration: .45, damage: 18, cooldown: 2.6 };
    return { id: `fall-${i + 1}`, x, z, offset, root, fill, ring, rock, impact, phase: 'idle', timer: 0, cooldown: 0 };
  });

  // The Stone King stands on an unobstructed basalt disk; lava and columns sit beyond the playable radius.
  put('stoneking', G.disc, M.obsidian, 0, -6, 0, 18.4, 11.4, 18.4);
  put('stoneking', G.disc, M.emberEdge, 0, -.35, 0, 17.8, .5, 17.8);
  put('stoneking', G.disc, M.basalt, 0, -.12, 0, 17.2, .24, 17.2);
  put('stoneking', G.disc, M.lava, 0, -3.4, 0, 36, .1, 36);
  const lavaRing = mesh('stoneking', new THREE.RingGeometry(18.5, 25, 72), M.lavaHot, 0, -3.32, 0); lavaRing.rotation.x = -Math.PI / 2;
  for (const r of [5.5, 10.7, 16.5]) { const ring = mesh('stoneking', new THREE.TorusGeometry(r, .033, 5, 72), M.emberMetal, 0, .015, 0); ring.rotation.x = -Math.PI / 2; }
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * 6.28, radius = 21.5 + (i % 3) * 2.4, x = Math.sin(a) * radius, z = Math.cos(a) * radius, h = 5 + (i % 4) * 1.8;
    put('stoneking', G.rock, M.emberRock, x, -4, z, 4.5, 1.6, 4.5);
    put('stoneking', G.crystal, M.obsidian, x, h / 2 - 2, z, 1.3, h / 2 + 1, 1.7, 0, a, .12 * Math.sin(i));
    put('stoneking', G.crystal, M.warmGlow, x * 1.04, .4, z * 1.04, .14, 1.6, .16, 0, a);
  }
  distantRidges('stoneking', M.emberRock, 15, 70, 0);
  particleField('stoneking', 0xe2b39b, 85, 48, .7, 13, .07);

  for (const kind of kinds) for (const { geometry, mat, matrices } of batches.get(kind).values()) {
    const object = new THREE.InstancedMesh(geometry, mat, matrices.length);
    matrices.forEach((matrix, i) => object.setMatrixAt(i, matrix)); object.instanceMatrix.needsUpdate = true; object.computeBoundingSphere();
    object.castShadow = !mat.isMeshBasicMaterial; object.receiveShadow = true; groups[kind].add(object);
  }
  function clearHazard(hazard) {
    hazard.phase = 'idle'; hazard.timer = 0; hazard.cooldown = 0; hazard.root.visible = false;
    hazard.rock.visible = false; hazard.rock.position.y = 10; hazard.impact.visible = false;
    hazard.fill.visible = true; hazard.ring.visible = true;
  }
  function clearEffects() {
    generation++; hazards.forEach(clearHazard);
  }
  function setStage(kind) {
    clearEffects(); activeStage = kinds.includes(kind) ? kind : null;
    for (const name of kinds) groups[name].visible = name === activeStage;
  }
  function reset(kind) {
    if (!state[kind]) return;
    generation++; state[kind].collected.clear(); state[kind].z = 90; state[kind].complete = false;
    if (kind === 'moonwood') for (const token of tokens) { token.root.visible = true; token.marker.visible = true; }
    if (kind === 'emberpass') hazards.forEach(clearHazard);
  }
  function targetFor(kind) {
    if (kind === 'moonwood') {
      const token = tokens.find(item => !state.moonwood.collected.has(item.id));
      return token ? { x: token.x, z: token.z, name: token.name } : { x: pathX(kind, 20), z: 20, name: '问月门 · 前往赤霞关' };
    }
    if (kind === 'emberpass') {
      const hazard = hazards.find(item => item.z >= 24 && state.emberpass.z > item.z - 3);
      return hazard ? { x: pathX(kind, hazard.z) + (hazard.offset <= 0 ? 2.9 : -2.9), z: hazard.z, name: `落石关 ${hazards.indexOf(hazard) + 1} · 沿亮侧绕行` } : { x: pathX(kind, 20), z: 20, name: '黑曜石门 · 前往石猿' };
    }
    return { x: 0, z: -4, name: '熔岩王座' };
  }
  function getState() {
    const kind = activeStage, data = state[kind];
    if (!data) return { kind: null, collected: 0, total: 0, collectedIds: [], complete: false, progress: 0, target: { x: 0, z: 0, name: '' }, tip: '' };
    let tip = '圆台边缘是熔岩，留意石猿的起手与落点。';
    if (kind === 'moonwood') tip = data.collected.size < 3 ? `循萤光收集灵符（${data.collected.size}/3），靠近光符即可拾取。` : '三符已齐，穿过前方月门。';
    if (kind === 'emberpass') {
      const warning = hazards.find(item => item.phase === 'warning' || item.phase === 'falling');
      tip = warning ? '金色圆圈即将落石：离开圆圈，或把握落地时机闪避。' : '看清落石预警，沿栈道另一侧绕行；落石后也有通过的空隙。';
    }
    return { kind, hazardActive: kind === 'emberpass' && hazards.some(item => item.phase === 'warning' || item.phase === 'falling'), collected: data.collected.size, total: kind === 'moonwood' ? 3 : 0, collectedIds: [...data.collected], complete: data.complete, progress: data.complete ? 1 : kind === 'stoneking' ? 0 : clamp((90 - data.z) / 72, 0, 1), target: targetFor(kind), tip };
  }
  function step(dt, context = {}) {
    const kind = activeStage, data = state[kind], position = context.hero?.position ?? context.hero;
    if (!data || !position || !Number.isFinite(position.x) || !Number.isFinite(position.z) || data.complete) return;
    const delta = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    if (delta <= 0) return;
    data.z = position.z;
    if (kind === 'moonwood') {
      for (const token of tokens) if (!data.collected.has(token.id) && Math.hypot(position.x - token.x, position.z - token.z) <= 1.7) {
        data.collected.add(token.id); token.root.visible = false; token.marker.visible = false;
      }
      data.complete = data.collected.size === 3 && position.z <= 20.5;
      return;
    }
    if (kind !== 'emberpass') return;
    if (position.z <= 20.5) { data.complete = true; hazards.forEach(clearHazard); return; }
    const callGeneration = generation;
    for (const hazard of hazards) {
      const distance = Math.hypot(position.x - hazard.x, position.z - hazard.z);
      if (hazard.phase === 'cooldown') {
        hazard.cooldown = Math.max(0, hazard.cooldown - delta);
        if (hazard.cooldown === 0) hazard.phase = 'idle';
        continue;
      }
      if (distance > 12.5) {
        if (hazard.phase !== 'idle') { clearHazard(hazard); hazard.phase = 'cooldown'; hazard.cooldown = 2.6; }
        continue;
      }
      if (hazard.phase === 'idle') {
        if (distance <= 10.5) { hazard.phase = 'warning'; hazard.timer = 0; hazard.root.visible = true; hazard.fill.visible = true; hazard.ring.visible = true; }
        continue;
      }
      hazard.timer += delta;
      if (hazard.phase === 'warning' && hazard.timer >= 1.5) {
        hazard.phase = 'falling'; hazard.timer = 0; hazard.rock.visible = true;
      } else if (hazard.phase === 'falling' && hazard.timer >= .45) {
        hazard.phase = 'impact'; hazard.timer = 0; hazard.fill.visible = false; hazard.ring.visible = false; hazard.rock.visible = false; hazard.impact.visible = true;
        if (distance <= 1.85 && typeof context.hurtHero === 'function') {
          // The damage callback may synchronously kill the hero, reset, or change scenes.
          context.hurtHero(18);
          if (generation !== callGeneration || activeStage !== kind) return;
          return;
        }
      } else if (hazard.phase === 'impact' && hazard.timer >= .35) {
        hazard.root.visible = false; hazard.impact.visible = false; hazard.phase = 'cooldown'; hazard.cooldown = 2.6; hazard.timer = 0;
      }
    }
  }
  function update(dt, time) {
    const t = Number.isFinite(time) ? time : 0;
    if (groups.moonwood.visible) { moonMist.update(t); if (creekTexture) creekTexture.offset.y = -t * .035; }
    if (groups.emberpass.visible) emberMist.update(t);
    for (const item of animated) if (groups[item.kind].visible) {
      item.root.position.y = item.baseY + Math.sin(t * 1.6 + item.phase) * .16; item.root.rotation.y = t * .6 + item.phase; item.halo.rotation.z = t * .4;
    }
    for (const field of particles) if (groups[field.kind].visible) {
      for (let i = 0; i < field.seeds.length; i += 3) {
        field.coordinates[i] = field.seeds[i] + Math.sin(t * .3 + i) * .7;
        field.coordinates[i + 1] = field.kind === 'moonwood' ? field.seeds[i + 1] + Math.sin(t * .8 + i) * .28 : field.yBase + ((field.seeds[i + 1] - t * .17) % field.height + field.height) % field.height;
        field.coordinates[i + 2] = field.seeds[i + 2] + Math.sin(t * .2 + i * .3) * .5;
      }
      field.object.geometry.attributes.position.needsUpdate = true;
    }
    if (groups.emberpass.visible) for (const hazard of hazards) {
      hazard.fill.material.opacity = .25 + Math.sin(t * 9) * .08 + (hazard.phase === 'falling' ? .25 : .05);
      if (hazard.phase === 'falling') { const f = clamp(hazard.timer / .45, 0, 1); hazard.rock.position.y = 10 - 9.3 * f * f; hazard.rock.rotation.set(f * .7, f, f * .4); }
      if (hazard.phase === 'impact') { const f = clamp(hazard.timer / .35, 0, 1); hazard.impact.scale.setScalar(1.85 + f * .7); hazard.impact.material.opacity = .65 * (1 - f); }
    }
  }
  return { groups, setStage, reset, clearEffects, samplePath, clampPosition, update, step, getState };
}
