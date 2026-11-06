import { bambooLeafGeometry, mistLayer } from './scenic-details.js';

// A quiet mountain approach to the existing courtyard, built entirely from local geometry.
// Gameplay stays on y = 0; the valley, water and bridges provide visual elevation.
export function createJourneyWorld(THREE, scene) {
  const group = new THREE.Group();
  group.name = '灵山 · 云径入山';
  scene.add(group);
  let seed = 7319;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const nodes = [[164, 0], [153, 2], [141, 7], [127, -2], [112, -12], [97, -5], [81, 10], [66, 13], [49, 4], [35, 0], [20, 0]];
  function pathX(z) {
    z = clamp(Number.isFinite(z) ? z : 160, 20, 164);
    let i = 0;
    while (i < nodes.length - 2 && z < nodes[i + 1][0]) i++;
    const t = (nodes[i][0] - z) / (nodes[i][0] - nodes[i + 1][0]);
    const a = nodes[Math.max(0, i - 1)][1], b = nodes[i][1];
    const c = nodes[i + 1][1], d = nodes[Math.min(nodes.length - 1, i + 2)][1];
    return .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  }
  function samplePath(progress) {
    const z = 160 - clamp(Number.isFinite(progress) ? progress : 0, 0, 1) * 138;
    return new THREE.Vector3(pathX(z), 0, z);
  }
  function clampPosition(position) {
    position.z = clamp(Number.isFinite(position.z) ? position.z : 160, 20, 164);
    position.x = clamp(Number.isFinite(position.x) ? position.x : 0, pathX(position.z) - 4.1, pathX(position.z) + 4.1);
    return position;
  }
  const landmarks = [
    { name: '入山台', z: 158, description: '石灯照古道，在桃花与山风间习得棍法。' },
    { name: '桃花坡', z: 140, description: '花落肩头，青山一路相送。' },
    { name: '听瀑桥', z: 112, description: '飞瀑落入碧潭，木桥横过云水。' },
    { name: '竹影径', z: 79, description: '穿过清风竹海，循石灯继续前行。' },
    { name: '望云亭', z: 51, description: '群峰浮于云海，远处古寺钟声渐近。' },
    { name: '试炼山门', z: 25, description: '山路尽处，白鬃妖将正候来人。' }
  ];
  const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .94, flatShading: true, ...extra });
  const M = {
    trail: standard(0xd5ccab), stone: standard(0x8caaa0), paleStone: standard(0xc1c6b0),
    earth: standard(0x779780), moss: standard(0x54886c), darkMoss: standard(0x386d59),
    wood: standard(0x6b4f3d), paleWood: standard(0xbba078), bamboo: standard(0x557b47),
    bambooNode: standard(0xb0b574), leaf: standard(0x638f65), darkLeaf: standard(0x3c735d),
    bambooLeaf: standard(0x749b68, { side: THREE.DoubleSide }), bambooShade: standard(0x3c735d, { side: THREE.DoubleSide }),
    flower: standard(0xe5acb7), lightFlower: standard(0xf4c7c7), flowerCenter: standard(0xc9879c),
    nearMountain: standard(0x597e70), middleMountain: standard(0x729d8f), farMountain: standard(0x9db9ac),
    roof: standard(0x426e68), red: standard(0x8f6550), gold: standard(0xd0b67d, { metalness: .15 }),
    lantern: standard(0xffdca1, { emissive: 0xffbb66, emissiveIntensity: 1.3 }),
    water: standard(0x6cb6b3, { metalness: .22, roughness: .27, transparent: true, opacity: .84 }),
    cloud: new THREE.MeshBasicMaterial({ color: 0xe0ece3, transparent: true, opacity: .64, depthWrite: false }),
    foam: new THREE.MeshBasicMaterial({ color: 0xe6f9ed, transparent: true, opacity: .63, depthWrite: false }),
    birds: new THREE.MeshBasicMaterial({ color: 0x496f67, side: THREE.DoubleSide })
  };
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1), rock: new THREE.IcosahedronGeometry(1, 1),
    round: new THREE.IcosahedronGeometry(1, 2), cylinder: new THREE.CylinderGeometry(1, 1, 1, 7),
    cone: new THREE.ConeGeometry(1, 1, 7), roof: new THREE.ConeGeometry(1, 1, 4),
    leaf: bambooLeafGeometry(THREE), disc: new THREE.CylinderGeometry(1, 1, 1, 32)
  };
  // All repeated objects share geometry and material, with one instanced draw per pair.
  const batches = new Map();
  const dummy = new THREE.Object3D();
  function put(geometry, material, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    let materials = batches.get(geometry);
    if (!materials) batches.set(geometry, materials = new Map());
    let instances = materials.get(material);
    if (!instances) materials.set(material, instances = []);
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rx, ry, rz);
    dummy.updateMatrix(); instances.push(dummy.matrix.clone());
  }
  function beam(material, ax, ay, az, bx, by, bz, radius = .1) {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz), direction = b.clone().sub(a);
    let materials = batches.get(G.cylinder);
    if (!materials) batches.set(G.cylinder, materials = new Map());
    let instances = materials.get(material);
    if (!instances) materials.set(material, instances = []);
    dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.scale.set(radius, direction.length(), radius);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    dummy.updateMatrix(); instances.push(dummy.matrix.clone());
  }
  function ribbon(width, material, y, uneven = false) {
    const positions = [], indices = [], uv = [];
    for (let i = 0; i <= 180; i++) {
      const z = 164 - i * .8, x = pathX(z);
      const w = width + (uneven ? Math.sin(i * .17) * 2 + Math.cos(i * .36) : 0);
      positions.push(x - w, y, z, x + w, y, z); uv.push(0, i * .25, 1, i * .25);
      // Leave the pool open beneath the bridge; the deck overlaps both banks.
      if (i < 180 && !(z <= 120 && z > 104)) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; group.add(mesh);
    return mesh;
  }
  ribbon(12, M.earth, -.18, true);
  ribbon(5.3, M.moss, -.07);
  ribbon(4.35, M.trail, -.015);
  // Slightly sunken, broad paving stones give footsteps texture without changing collision height.
  for (let z = 23; z < 164; z += 1.5) {
    if (z > 103 && z < 121) continue;
    for (const side of [-1, 1]) {
      put(G.box, random() > .3 ? M.paleStone : M.stone, pathX(z) + side * 1.55, -.045, z, 2.9, .08, 1.36, 0, (random() - .5) * .035);
      if (Math.round(z) % 3 === 0) put(G.rock, M.moss, pathX(z) + side * 4.75, -.08, z, .65, .18, .5);
    }
  }
  put(G.disc, M.paleStone, 0, -.1, 158, 6.7, .18, 8.3);
  put(G.disc, M.trail, 0, -.008, 158, 5.9, .025, 7.6);

  // Mountains are sculpted, tapering ridges instead of cones; each ridge has a different silhouette.
  function mountain(x, z, width, height, depth, material) {
    const vertices = [], indices = [], rings = 5, sides = 9;
    const turn = random() * 6.28, lean = (random() - .5) * width * .42;
    const jagged = Array.from({ length: sides }, () => .78 + random() * .33);
    for (let ring = 0; ring < rings; ring++) {
      const t = ring / (rings - 1), taper = Math.pow(1 - t, .64) * .94 + .045;
      for (let j = 0; j < sides; j++) {
        const angle = j / sides * Math.PI * 2 + turn;
        vertices.push(x + Math.cos(angle) * width * taper * jagged[j] + lean * t, -8 + height * t + Math.sin(j * 2.1 + ring) * height * .035 * (1 - t), z + Math.sin(angle) * depth * taper * jagged[j]);
        if (ring < rings - 1) { const a = ring * sides + j, b = ring * sides + (j + 1) % sides; indices.push(a, a + sides, b, b, a + sides, b + sides); }
      }
    }
    const top = vertices.length / 3;
    vertices.push(x + lean, height - 7.1, z);
    for (let j = 0; j < sides; j++) indices.push(top, (rings - 1) * sides + (j + 1) % sides, (rings - 1) * sides + j);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; group.add(mesh);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) mountain(side * (70 + random() * 32), 25 + i * 27, 20 + random() * 15, 36 + random() * 45, 21 + random() * 11, M.farMountain);
    for (let i = 0; i < 7; i++) mountain(side * (40 + random() * 22), 31 + i * 24, 15 + random() * 9, 20 + random() * 28, 15 + random() * 10, M.middleMountain);
    for (let i = 0; i < 15; i++) {
      const z = 31 + i * 9;
      let x = pathX(z) + side * (10 + random() * 6);
      if (side < 0 && z >= 100 && z <= 124) x -= 20; // Keep the pool clear of the roadside ridge.
      put(G.rock, random() > .5 ? M.moss : M.nearMountain, x, -.8, z, 3 + random() * 3.2, 1.2 + random() * 3.1, 3 + random() * 2, 0, random() * 6);
      put(G.rock, M.darkMoss, x + side * 3, -5, z, 7, 5, 7, 0, random() * 6);
    }
  }
  const cloudSea = new THREE.Group(); cloudSea.name = 'Floating valley clouds'; group.add(cloudSea);
  const cloudMatrices = [];
  for (let i = 0; i < 48; i++) {
    const z = 17 + random() * 158, side = i % 2 ? -1 : 1;
    dummy.position.set(pathX(z) + side * (20 + random() * 45), -4 - random() * 4, z);
    dummy.scale.set(12 + random() * 15, 1.5 + random() * 1.6, 7 + random() * 11); dummy.rotation.set(0, random() * 6.28, 0); dummy.updateMatrix(); cloudMatrices.push(dummy.matrix.clone());
  }
  const clouds = new THREE.InstancedMesh(G.round, M.cloud, cloudMatrices.length);
  cloudMatrices.forEach((matrix, i) => clouds.setMatrixAt(i, matrix)); clouds.instanceMatrix.needsUpdate = true; cloudSea.add(clouds);
  const valleyMist = mistLayer(THREE, group, { color: 0xe0eee6, opacity: .3,
    patches: [34, 65, 93, 128, 155].flatMap(z => [-1, 1].map(side => [pathX(z) + side * 26, -1.8, z, 34, 26])) });

  function flowerTree(x, z, scale = 1) {
    const h = 4.3 * scale;
    beam(M.wood, x, -.15, z, x + .25 * scale, h, z - .15, .23 * scale);
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * 6.28 + .3, dx = Math.cos(angle) * 1.8 * scale, dz = Math.sin(angle) * 1.7 * scale;
      const y = h + (i % 2) * .6 * scale;
      beam(M.wood, x, h * .55, z, x + dx, y, z + dz, .09 * scale);
      put(G.rock, i % 2 ? M.lightFlower : M.flower, x + dx, y + .3 * scale, z + dz, 1.5 * scale, .95 * scale, 1.3 * scale, 0, angle);
      put(G.rock, M.flowerCenter, x + dx * .4, y - .35 * scale, z + dz * .4, .8 * scale, .7 * scale, .9 * scale);
    }
    put(G.rock, M.lightFlower, x, h + 1.05 * scale, z, 1.8 * scale, 1.1 * scale, 1.65 * scale);
  }
  for (let i = 0; i < 18; i++) {
    const z = 126 + random() * 37, side = i % 2 ? -1 : 1;
    flowerTree(pathX(z) + side * (7.3 + random() * 5.5), z, .68 + random() * .42);
  }
  for (const [side, z] of [[-1, 96], [1, 54], [-1, 43], [1, 30]]) flowerTree(pathX(z) + side * 8, z, 1.05);
  // Bamboo clumps have open lower trunks and a high canopy, keeping the road readable.
  for (let i = 0; i < 80; i++) {
    const z = 59 + random() * 38, side = i % 2 ? -1 : 1, x = pathX(z) + side * (7 + random() * 11);
    const h = 5.7 + random() * 4.5, lean = (random() - .5) * .8;
    beam(M.bamboo, x, -.2, z, x + lean, h, z + .2, .075 + random() * .04);
    for (let y = 1; y < h; y += 1.1) put(G.cylinder, M.bambooNode, x + lean * y / h, y, z + .2 * y / h, .095, .055, .095);
    for (let k = 0; k < 3; k++) {
      const angle = random() * 6.28, y = h * (.64 + k * .14), dx = Math.cos(angle) * 1.3, dz = Math.sin(angle) * 1.3;
      beam(M.bamboo, x, y, z, x + dx, y + .3, z + dz, .032);
      for (let blade = 0; blade < 7; blade++) {
        const length = .72 + (blade % 3) * .24;
        put(G.leaf, blade % 2 ? M.bambooLeaf : M.bambooShade, x + dx * .65, y + .3, z + dz * .65,
          length, 1, length, -.12, angle + (blade - 3) * .27, -.18 + blade * .045);
      }
    }
  }
  // Small grasses and wildflowers follow the verge, outside the walkable corridor.
  for (let i = 0; i < 145; i++) {
    const z = 26 + random() * 136;
    if (z > 102 && z < 122) continue;
    const side = i % 2 ? -1 : 1, x = pathX(z) + side * (5.2 + random() * 1.6);
    for (let blade = 0; blade < 3; blade++) put(G.leaf, M.bambooShade, x, -.03, z, .4, .8, .45, .2, blade * 2.1, 1.1);
    if (i % 4 === 0) put(G.rock, i % 3 ? M.lightFlower : M.gold, x + .1, .29, z, .09, .06, .09);
  }
  // Pines on the outer ridges add scale and frame views into the valley.
  for (let i = 0; i < 48; i++) {
    const z = 26 + random() * 132, side = i % 2 ? -1 : 1, x = pathX(z) + side * (18 + random() * 22), h = 4 + random() * 6;
    put(G.cylinder, M.wood, x, h * .3 - 1, z, .14, h * .8, .14);
    for (let k = 0; k < 3; k++) put(G.cone, k % 2 ? M.darkLeaf : M.leaf, x, h * (.45 + k * .2) - 1, z, h * (.28 - k * .045), h * .45, h * (.28 - k * .045));
  }

  // A turquoise pool sits below the walkway; the wooden bridge remains level with gameplay.
  put(G.disc, M.water, -22, -1.22, 112, 15, .08, 10);
  put(G.rock, M.nearMountain, -36, 9, 112, 8, 18, 8, 0, -.25);
  put(G.rock, M.moss, -36, 24, 112, 7, 1.6, 6);
  const waterfallTextureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let waterfallTexture = null;
  if (waterfallTextureCanvas) {
    waterfallTextureCanvas.width = 128; waterfallTextureCanvas.height = 256;
    const ctx = waterfallTextureCanvas.getContext('2d');
    ctx.fillStyle = '#c5f0e8'; ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 45; i++) { ctx.fillStyle = `rgba(255,255,255,${.15 + random() * .4})`; ctx.fillRect(random() * 128, random() * 256, 1 + random() * 4, 30 + random() * 100); }
    waterfallTexture = new THREE.CanvasTexture(waterfallTextureCanvas); waterfallTexture.wrapS = waterfallTexture.wrapT = THREE.RepeatWrapping; waterfallTexture.repeat.set(1, 3); waterfallTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const fallMaterial = new THREE.MeshBasicMaterial({ color: 0xc1f0e7, map: waterfallTexture, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false });
  const waterfall = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 25), fallMaterial); waterfall.position.set(-27.5, 11.1, 112); waterfall.rotation.y = Math.PI / 2; group.add(waterfall);
  const fallingMist = new THREE.Mesh(G.round, M.foam); fallingMist.position.set(-26.8, -.6, 112); fallingMist.scale.set(3, .9, 3.7); group.add(fallingMist);
  const rippleGeometry = new THREE.TorusGeometry(1, .018, 4, 32), ripples = [];
  for (let i = 0; i < 4; i++) {
    const material = M.foam.clone(), ripple = new THREE.Mesh(rippleGeometry, material); ripple.rotation.x = -Math.PI / 2; ripple.position.set(-25.5, -1.16, 112); group.add(ripple); ripples.push(ripple);
  }
  for (let z = 103.5; z <= 120.5; z += .72) {
    put(G.box, Math.round(z * 3) % 3 ? M.wood : M.paleWood, pathX(z), -.035, z, 8.6, .14, .66, 0, 0, 0);
    for (const side of [-1, 1]) put(G.box, M.paleWood, pathX(z) + side * 3.9, .045, z, .055, .012, .54);
  }
  for (let z = 103.5; z < 120; z += 2.1) {
    const next = Math.min(z + 2.1, 120.5);
    for (const side of [-1, 1]) {
      put(G.cylinder, M.wood, pathX(z) + side * 4.5, .65, z, .11, 1.6, .11);
      put(G.rock, M.gold, pathX(z) + side * 4.5, 1.47, z, .16, .13, .16);
      for (const y of [.62, 1.2]) beam(M.paleWood, pathX(z) + side * 4.5, y, z, pathX(next) + side * 4.5, y, next, .065);
    }
  }

  function lantern(x, z) {
    put(G.box, M.stone, x, .16, z, .8, .32, .8);
    put(G.cylinder, M.paleStone, x, .72, z, .18, 1.05, .18);
    put(G.box, M.stone, x, 1.25, z, .68, .12, .68);
    put(G.box, M.lantern, x, 1.5, z, .38, .42, .38);
    for (const dx of [-.26, .26]) for (const dz of [-.26, .26]) put(G.box, M.stone, x + dx, 1.51, z + dz, .07, .52, .07);
    put(G.roof, M.roof, x, 1.9, z, .67, .4, .67, 0, Math.PI / 4);
    put(G.rock, M.gold, x, 2.16, z, .09, .15, .09);
  }
  for (const z of [159, 147, 133, 122, 102, 88, 74, 61, 47, 34, 24]) {
    for (const side of [-1, 1]) lantern(pathX(z) + side * 5.65, z);
  }
  // Open viewing pavilion on a side terrace, visible long before the bend reaches it.
  const pavilionX = pathX(52) + 11, pavilionZ = 52;
  put(G.disc, M.stone, pavilionX, -.12, pavilionZ, 5.7, .4, 5.7);
  put(G.disc, M.paleStone, pavilionX, .12, pavilionZ, 4.6, .2, 4.6);
  for (const dx of [-2.8, 2.8]) for (const dz of [-2.8, 2.8]) {
    put(G.cylinder, M.red, pavilionX + dx, 2.2, pavilionZ + dz, .18, 4.2, .18);
    put(G.cylinder, M.gold, pavilionX + dx, .5, pavilionZ + dz, .21, .12, .21);
  }
  for (const dz of [-2.8, 2.8]) put(G.box, M.red, pavilionX, 4.2, pavilionZ + dz, 6.3, .3, .28);
  for (const dx of [-2.8, 2.8]) put(G.box, M.red, pavilionX + dx, 4.2, pavilionZ, .28, .3, 6.3);
  put(G.roof, M.roof, pavilionX, 4.9, pavilionZ, 6.1, 1.6, 6.1, 0, Math.PI / 4);
  put(G.roof, M.roof, pavilionX, 5.9, pavilionZ, 4.1, 1.2, 4.1, 0, Math.PI / 4);
  put(G.rock, M.gold, pavilionX, 6.67, pavilionZ, .2, .4, .2);
  for (const side of [-1, 1]) {
    put(G.box, M.wood, pavilionX + side * 2.5, .65, pavilionZ, .6, .2, 4.5);
    put(G.box, M.red, pavilionX + side * 2.9, 1.15, pavilionZ, .12, .12, 5.3);
  }
  // Light ceremonial gates frame the beginning and the existing guardian's entrance.
  put(G.rock, M.darkMoss, 0, -3, 169, 8, 3, 6);
  put(G.box, M.stone, 0, -.22, 169, 12.5, .44, 9.8);
  for (const [z, span] of [[171, 5.1], [26, 5.4]]) {
    const x = pathX(z);
    for (const side of [-1, 1]) {
      put(G.box, M.stone, x + side * span, .2, z, 1.1, .4, 1.1);
      put(G.cylinder, M.red, x + side * span, 2.6, z, .25, 4.9, .25);
    }
    put(G.box, M.red, x, 5, z, span * 2 + 1.2, .38, .4);
    put(G.roof, M.roof, x, 5.57, z, span + 1.2, 1, 1.5, 0, Math.PI / 4);
    put(G.box, M.gold, x, 4.75, z + .24, 2.2, .6, .13);
  }
  function sign(text, subtitle, x, z, width = 2.4) {
    put(G.cylinder, M.wood, x, .9, z, .09, 1.9, .09);
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#34584e'; ctx.fillRect(0, 0, 512, 192); ctx.strokeStyle = '#c9c49e'; ctx.lineWidth = 6; ctx.strokeRect(10, 10, 492, 172);
    ctx.fillStyle = '#f0e8cb'; ctx.font = 'bold 64px serif'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 88);
    ctx.fillStyle = '#becfc0'; ctx.font = '27px sans-serif'; ctx.fillText(subtitle, 256, 145);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 192 / 512), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    board.position.set(x, 1.85, z + .05); group.add(board);
  }
  sign('灵山云径', '前行 · 习棍入山', pathX(156) - 5.8, 156);
  sign('听瀑桥', '沿桥向前 · 竹林古寺', pathX(122) + 5.8, 122);
  sign('竹影径', '穿林 · 望云亭', pathX(91) - 5.8, 91);
  sign('白鬃守关', '前方 · 试炼山门', pathX(33) + 5.8, 33);
  // Small golden trail markers are flush with the paving; they point toward lower z.
  for (const z of [151, 135, 99, 86, 70, 56, 39, 29]) {
    const x = pathX(z);
    for (const side of [-1, 1]) put(G.box, M.gold, x + side * .22, .012, z, .08, .025, .66, 0, side * -.7);
  }

  for (const [geometry, materials] of batches) for (const [material, matrices] of materials) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = material !== M.water && material !== M.lantern; mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); group.add(mesh);
  }
  // Airborne petals are a single points draw; positions are recycled to avoid allocation per frame.
  const particleCount = 110, particlePositions = new Float32Array(particleCount * 3), particleSeed = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const z = i < 75 ? 125 + random() * 38 : 37 + random() * 88;
    particleSeed.set([pathX(z) + (random() - .5) * 15, .5 + random() * 7, z], i * 3);
    particlePositions.set(particleSeed.subarray(i * 3, i * 3 + 3), i * 3);
  }
  const petalGeometry = new THREE.BufferGeometry(); petalGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const petals = new THREE.Points(petalGeometry, new THREE.PointsMaterial({ color: 0xf7cfce, size: .115, transparent: true, opacity: .85, depthWrite: false })); group.add(petals);
  const birdGeometry = new THREE.BufferGeometry(); birdGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 0, -.18, .3, 1, 0, 0, 0, -.18, .3, .18, -.22, -.15, -.18, -.22, -.15], 3)); birdGeometry.computeVertexNormals();
  const birds = new THREE.Group(); group.add(birds);
  for (let i = 0; i < 7; i++) { const bird = new THREE.Mesh(birdGeometry, M.birds); bird.position.set(-9 + i * 2.9, 17 + Math.sin(i) * 1.2, 73 + i * 1.3); bird.scale.setScalar(.45 + i * .025); birds.add(bird); }
  function update(dt, time) {
    if (!group.visible) return;
    const t = Number.isFinite(time) ? time : 0;
    cloudSea.position.x = Math.sin(t * .025) * 1.6; cloudSea.position.y = Math.sin(t * .07) * .3;
    valleyMist.update(t);
    if (waterfallTexture) waterfallTexture.offset.y = t * .4;
    fallingMist.scale.set(3 + Math.sin(t * 1.3) * .15, .9 + Math.cos(t * 1.1) * .1, 3.7 + Math.cos(t) * .12);
    ripples.forEach((ripple, i) => { const phase = (t * .22 + i / ripples.length) % 1; ripple.scale.setScalar(.7 + phase * 4.3); ripple.material.opacity = (1 - phase) * .5; });
    for (let i = 0; i < particleCount; i++) {
      const k = i * 3;
      particlePositions[k] = particleSeed[k] + Math.sin(t * .45 + i * .7) * .9;
      particlePositions[k + 1] = .25 + ((particleSeed[k + 1] - t * (.2 + (i % 4) * .03)) % 7 + 7) % 7;
      particlePositions[k + 2] = particleSeed[k + 2] + Math.sin(t * .2 + i) * 1.2;
    }
    petalGeometry.attributes.position.needsUpdate = true;
    birds.position.set(Math.sin(t * .04) * 12, Math.sin(t * .5) * .4, Math.cos(t * .04) * 7);
    birds.children.forEach((bird, i) => { bird.rotation.z = Math.sin(t * 2.6 + i) * .11; });
  }
  return { group, setVisible: visible => { group.visible = Boolean(visible); }, samplePath, clampPosition, update, landmarks };
}
