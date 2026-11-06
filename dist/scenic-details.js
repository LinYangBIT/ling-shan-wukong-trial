// Shared original scenery. Geometry is local; the optional canvas textures have a
// geometry-only fallback for non-browser validation and constrained platforms.
export function mountainGeometry(THREE, variant = 0) {
  const vertices = [], indices = [], rings = 7, sides = 11;
  for (let ring = 0; ring < rings; ring++) {
    const t = ring / (rings - 1), width = Math.pow(1 - t, .7) * .93 + .025;
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2;
      const ridge = .83 + Math.sin(j * 2.37 + variant * 1.9) * .14;
      const bend = Math.sin(t * 3.1 + variant) * .15 * t;
      vertices.push(Math.cos(angle) * width * ridge + bend,
        t + Math.sin(j * 1.7 + ring * .8 + variant) * .045 * (1 - t),
        Math.sin(angle) * width * ridge + t * .07 * Math.cos(variant));
      if (ring < rings - 1) {
        const a = ring * sides + j, b = ring * sides + (j + 1) % sides;
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
  }
  const top = vertices.length / 3;
  vertices.push(Math.sin(3.1 + variant) * .15, 1.035, .07 * Math.cos(variant));
  for (let j = 0; j < sides; j++) indices.push(top, (rings - 1) * sides + (j + 1) % sides, (rings - 1) * sides + j);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export function bambooLeafGeometry(THREE) {
  // A gently folded, tapered blade. Several blades form an open fan, leaving
  // enough gaps to see the distant mountains through each bamboo crown.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, .55, .015, .13, .62, .1, 0,
    .55, .015, .13, 1.65, -.05, 0, .62, .1, 0,
    1.65, -.05, 0, .55, -.025, -.13, .62, .1, 0,
    .55, -.025, -.13, 0, 0, 0, .62, .1, 0
  ], 3));
  geometry.computeVertexNormals(); return geometry;
}

export function flowTexture(THREE, color = '#4f91ad') {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d'); if (!context) return null;
  context.fillStyle = color; context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 36; i++) {
    const y = i * 7.1, x = (i * 67) % 256;
    context.strokeStyle = `rgba(206,239,239,${.07 + (i % 4) * .035})`;
    context.lineWidth = i % 3 ? 1 : 2; context.beginPath();
    context.moveTo(x - 110, y); context.bezierCurveTo(x - 65, y - 4, x - 45, y + 6, x + 16, y);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function mistLayer(THREE, parent, { color = 0xc8dfe2, opacity = .18, patches = [] } = {}) {
  const group = new THREE.Group(); group.name = 'Soft valley mist'; parent.add(group);
  let map = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
      gradient.addColorStop(0, 'rgba(255,255,255,.8)'); gradient.addColorStop(.4, 'rgba(255,255,255,.42)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient; context.fillRect(0, 0, 64, 64); map = new THREE.CanvasTexture(canvas);
    }
  }
  // Without a soft map, omit the layer rather than drawing opaque rectangles.
  if (map && patches.length) {
    const material = new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, patches.length), dummy = new THREE.Object3D();
    patches.forEach(([x, y, z, width, depth], i) => {
      dummy.position.set(x, y, z); dummy.rotation.set(-Math.PI / 2, 0, i * 2.3); dummy.scale.set(width, depth, 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); group.add(mesh);
  }
  return { group, update(time) { group.position.x = Math.sin(time * .065) * .8; group.position.z = Math.cos(time * .04) * .55; } };
}
