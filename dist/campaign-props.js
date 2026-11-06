import { mountainGeometry, mistLayer } from './scenic-details.js';

// Original practice target and a separate cloud-top arena. All geometry is local.
export function createCampaignProps(THREE, scene) {
  const material=(color,other={})=>new THREE.MeshStandardMaterial({color,roughness:.83,...other});
  const stone=material('#bdc9bd'),edge=material('#678a83'),rock=material('#526f73'),gold=material('#c8b578',{metalness:.4,roughness:.5}),wood=material('#6f5941'),straw=material('#d9c18a'),pink=material('#e3b8b4'),leaf=material('#6d9f8b');
  const add=(g,geo,mat,x,y,z,sx=1,sy=1,sz=1)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
  const box=new THREE.BoxGeometry(1,1,1),sphere=new THREE.IcosahedronGeometry(1,1),cylinder=new THREE.CylinderGeometry(1,1,1,10);
  const dummy=new THREE.Group();dummy.name='习武木桩';scene.add(dummy);
  add(dummy,cylinder,wood,0,1.05,0,.15,2.1,.15);add(dummy,sphere,straw,0,1.8,0,.43,.48,.34);add(dummy,cylinder,straw,0,1.15,0,.42,.8,.32);add(dummy,box,wood,0,1.35,0,1.65,.13,.13);
  for(const y of [.9,1.1,1.3]){const ring=add(dummy,new THREE.TorusGeometry(.38,.035,5,16),gold,0,y,0);ring.rotation.x=Math.PI/2;}
  const marker=add(dummy,new THREE.TorusGeometry(.85,.025,5,40),gold,0,.05,0);marker.rotation.x=Math.PI/2;
  const summit=new THREE.Group();summit.name='青岚之巅';scene.add(summit);
  const cliff=add(summit,new THREE.CylinderGeometry(18,12,17,40),rock,0,-8.7,0);cliff.rotation.y=.16;
  add(summit,new THREE.CylinderGeometry(18.3,18,.45,64),edge,0,-.28,0);
  add(summit,new THREE.CylinderGeometry(17.4,17.7,.15,64),stone,0,-.02,0);
  for(const r of [5.5,12,16.7]){const ring=add(summit,new THREE.TorusGeometry(r,.035,5,64),gold,0,.08,0);ring.rotation.x=Math.PI/2;}
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const m=add(summit,box,edge,Math.sin(a)*10,.075,Math.cos(a)*10,.08,.02,10);m.rotation.y=a;}
  const ascentX=z=>Math.sin((z-17)/35*Math.PI)*3.1;
  for(let z=18;z<=55;z+=1.1){const x=ascentX(z),m=add(summit,box,stone,x,-.15,z,6.3,.28,1.03);m.rotation.y=(ascentX(z+.1)-x)*10;add(summit,box,edge,x,-1.8,z,5.8,3,1.08);}
  // Lanterns and flowering pines frame the arena without occupying its playable radius.
  for(let i=0;i<10;i++){const a=i/10*Math.PI*2;if(Math.cos(a)>.75)continue;const x=Math.sin(a)*18.7,z=Math.cos(a)*18.7;
    add(summit,cylinder,wood,x,1.2,z,.14,2.4,.14);
    for(let j=0;j<4;j++)add(summit,sphere,i%2?leaf:pink,x+Math.sin(j*2)*1.05,2.8+j*.38,z+Math.cos(j*2)*.6,1.8,.58,1.2);
    add(summit,box,edge,x*.91,.6,z*.91,.55,1.2,.55);add(summit,box,gold,x*.91,1.28,z*.91,.4,.3,.4);
  }
  for(let i=0;i<5;i++)for(const side of [-1,1]){const z=22+i*7,x=ascentX(z)+side*3.1;add(summit,box,edge,x,.35,z,.26,.7,.26);add(summit,sphere,gold,x,.8,z,.13,.15,.13);}
  // Mist layers and long silhouettes create height while keeping traversal level.
  const mist=new THREE.MeshBasicMaterial({color:'#e5eeea',transparent:true,opacity:.24,depthWrite:false});
  const cloudSea=new THREE.Group();cloudSea.name='青岚流云';summit.add(cloudSea);
  const clouds=new THREE.InstancedMesh(sphere,mist,22),cloudTransform=new THREE.Object3D();
  for(let i=0;i<22;i++){const a=i*2.4,r=28+(i%6)*10;cloudTransform.position.set(Math.sin(a)*r,-4-(i%4)*1.4,Math.cos(a)*r+12);cloudTransform.scale.set(19+(i%3)*8,1.5,9);cloudTransform.updateMatrix();clouds.setMatrixAt(i,cloudTransform.matrix);}
  clouds.instanceMatrix.needsUpdate=true;clouds.computeBoundingSphere();cloudSea.add(clouds);
  const softMist=mistLayer(THREE,summit,{color:0xe2eff0,opacity:.32,patches:Array.from({length:10},(_,i)=>{const a=i*Math.PI/5;return[Math.sin(a)*32,-2.8,Math.cos(a)*32+15,40,32];})});
  const mountainMaterials=['#8aa8ac','#749798','#577f87'].map(c=>material(c));
  const ridges=[0,1,2].map(variant=>mountainGeometry(THREE,variant));
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=70+(i%3)*23,h=25+(i%5)*9;const m=add(summit,ridges[i%3],mountainMaterials[i%3],Math.sin(a)*r,-19,Math.cos(a)*r,11+(i%4)*4,h,10+(i%4)*3);m.rotation.y=i;m.castShadow=false;}
  const halo=add(summit,new THREE.TorusGeometry(2.5,.035,5,64),new THREE.MeshBasicMaterial({color:'#b6ffff',transparent:true,opacity:.5}),0,.12,-5);halo.rotation.x=Math.PI/2;
  // Repeated static props share a draw call; animated clouds and halo stay separate.
  const moving=new Set([halo]),batches=new Map();
  for(const mesh of [...summit.children]){
    if(!mesh.isMesh||moving.has(mesh))continue;
    const key=mesh.geometry.uuid+mesh.material.uuid+mesh.castShadow;
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(mesh);
  }
  for(const meshes of batches.values()){
    if(meshes.length<2)continue;
    const first=meshes[0],batch=new THREE.InstancedMesh(first.geometry,first.material,meshes.length);
    batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;
    meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);summit.remove(mesh);});
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();summit.add(batch);
  }
  summit.visible=false;dummy.visible=false;
  return {dummy,summit,ascentX,update(time){const t=Number.isFinite(time)?time:0;marker.rotation.z=t*.3;if(summit.visible){halo.rotation.z=-t*.1;cloudSea.position.x=Math.sin(t*.055)*1.4;cloudSea.position.z=Math.cos(t*.04)*.7;softMist.update(t);}}};
}
