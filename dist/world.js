import * as THREE from './vendor/three.module.js';

// Original procedural environment and articulated characters. No extracted game assets.
export function createWorld(scene) {
  const ground = new THREE.Group(); ground.name = 'Ancient courtyard'; scene.add(ground);
  const woods = new THREE.Group(); woods.name = 'Bamboo forest'; scene.add(woods);
  const accents = new THREE.Group(); scene.add(accents);
  let seed = 1147;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const tex = (kind) => {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const ctx = c.getContext('2d'); const data = ctx.createImageData(1024,1024);
    const base = kind === 'stone' ? [88,92,84] : kind === 'armor' ? [64,67,58] : [55,66,47];
    for(let y=0;y<1024;y++) for(let x=0;x<1024;x++) {
      const i=(y*1024+x)*4;
      const grain=(rand()-.5)*24 + Math.sin(x*.023+Math.sin(y*.037)*2)*7 + Math.cos(y*.013+Math.sin(x*.008))*9;
      const moss=kind==='stone' && (Math.sin(x*.011)*Math.cos(y*.018)+Math.sin((x+y)*.009))>1 ? 12:0;
      data.data[i]=base[0]+grain-moss; data.data[i+1]=base[1]+grain+moss*.3; data.data[i+2]=base[2]+grain-moss;
      data.data[i+3]=255;
    }
    ctx.putImageData(data,0,0);
    if(kind==='stone') {
      ctx.strokeStyle='rgba(16,21,19,.16)'; ctx.lineWidth=1;
      for(let i=0;i<28;i++){const x=rand()*1024,y=rand()*1024;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rand()*70,y+rand()*140);ctx.lineTo(x+rand()*90,y+rand()*190);ctx.stroke();}
      ctx.strokeStyle='rgba(191,189,154,.045)';ctx.lineWidth=1;
      for(let i=0;i<120;i++){ctx.beginPath();ctx.moveTo(rand()*1024,rand()*1024);ctx.lineTo(rand()*1024,rand()*1024);ctx.stroke();}
    } else if(kind==='armor') {
      for(let y=0;y<1024;y+=48) for(let x=0;x<1024;x+=44){ctx.strokeStyle='rgba(194,153,77,.38)';ctx.lineWidth=3;ctx.strokeRect(x+(y%96?22:0)+3,y+3,36,39);ctx.fillStyle='rgba(207,170,98,.5)';ctx.beginPath();ctx.arc(x+(y%96?22:0)+20,y+12,3,0,Math.PI*2);ctx.fill();}
    }
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;return map;
  };
  const stoneTex=tex('stone'),armorTex=tex('armor'),earthTex=tex('earth');
  const mat = (color,roughness=.8,metalness=0,other={}) => new THREE.MeshStandardMaterial({color,roughness,metalness,...other});
  const M={stone:mat(0xb1b4aa,.96,0,{map:stoneTex,bumpMap:stoneTex,bumpScale:.09}), darkStone:mat(0x46544b,.92,0,{map:stoneTex,bumpMap:stoneTex,bumpScale:.1}), earth:mat(0x9b9e87,1,0,{map:earthTex}), moss:mat(0x344c37,1), wood:mat(0x30271e,.9), redwood:mat(0x4f2920,.82), roof:mat(0x43504b,.66,.16), gold:mat(0xac8450,.43,.78), oldGold:mat(0x655232,.65,.66), bronze:mat(0x877348,.54,.68), armor:mat(0xaaa18a,.52,.55,{map:armorTex,bumpMap:armorTex,bumpScale:.018}), black:mat(0x15201c,.62,.25), red:mat(0x752f25,.93), skin:mat(0x9f7450,.98), face:mat(0xb99975,.93), fur:mat(0x4c3927,1), lightFur:mat(0x9b8d72,1), whiteFur:mat(0xaaa99b,.96), bone:mat(0xe8d8b5,.72), eye:mat(0xfdb653,.25,.1,{emissive:0xba4a0a,emissiveIntensity:1.3}), bamboo:mat(0x344b37,.92), leaf:mat(0x3c5038,.96,0,{side:THREE.DoubleSide}), glow:mat(0xffc685,.4,0,{emissive:0xff8c29,emissiveIntensity:4}), jade:mat(0x314b43,.5,.35)};
  M.leaf.side=THREE.DoubleSide;
  // Static meshes are merged by material to keep mobile draw calls bounded.
  function mergeDirect(group) {
    const batches=new Map(); const children=[...group.children];
    for(const mesh of children){if(!mesh.isMesh||Array.isArray(mesh.material))continue;mesh.updateMatrix();const geo=mesh.geometry.clone();geo.applyMatrix4(mesh.matrix);const list=batches.get(mesh.material)||[];list.push(geo);batches.set(mesh.material,list);group.remove(mesh);}
    for(const [material,geos] of batches){
      let v=0,n=0;for(const g of geos){v+=g.attributes.position.count;n+=g.index?g.index.count:g.attributes.position.count;}
      const p=new Float32Array(v*3),norm=new Float32Array(v*3),uv=new Float32Array(v*2),ind=new Uint32Array(n);let offset=0,k=0;
      for(const g of geos){const count=g.attributes.position.count;p.set(g.attributes.position.array,offset*3);if(g.attributes.normal)norm.set(g.attributes.normal.array,offset*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,offset*2);for(let j=0;j<(g.index?g.index.count:count);j++)ind[k++]=offset+(g.index?g.index.array[j]:j);offset+=count;g.dispose();}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('normal',new THREE.BufferAttribute(norm,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(new THREE.BufferAttribute(ind,1));g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
  }
  const sphereGeo=new THREE.SphereGeometry(1,24,16);
  function mesh(group,geo,material,x=0,y=0,z=0,sx=1,sy=1,sz=1){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;}
  const sphere=(g,m,x,y,z,sx,sy,sz)=>mesh(g,sphereGeo,m,x,y,z,sx,sy,sz);
  const box=(g,m,x,y,z,sx,sy,sz)=>mesh(g,new THREE.BoxGeometry(sx,sy,sz),m,x,y,z);
  const cyl=(g,m,x,y,z,rt,rb,h,seg=16)=>mesh(g,new THREE.CylinderGeometry(rt,rb,h,seg),m,x,y,z);
  function beam(g,m,a,b,r1,r2=r1){const d=new THREE.Vector3().subVectors(b,a);const o=cyl(g,m,0,0,0,r1,r2,d.length(),12);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;}
  function torus(g,m,x,y,z,r,t,rx=Math.PI/2){const o=mesh(g,new THREE.TorusGeometry(r,t,7,28),m,x,y,z);o.rotation.x=rx;return o;}
  function curve(g,m,points,r){const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(g,new THREE.TubeGeometry(path,28,r,7,false),m);}
  function tuft(g,m,x,y,z,r=.08,len=.2,angle=0){const o=mesh(g,new THREE.ConeGeometry(r,len,7),m,x,y,z);o.rotation.x=angle;return o;}

  // Textured paving, concentric stone courses and a worn central seal.
  const soil=mesh(ground,new THREE.CircleGeometry(63,100),M.earth,0,-.14,0);soil.rotation.x=-Math.PI/2;
  const court=cyl(ground,M.darkStone,0,-.13,0,19,19,.22,96);
  function pavingStone(inner,outer,start,end){
    const points=[],indices=[],segments=4;
    for(let edge=0;edge<2;edge++)for(let j=0;j<=segments;j++){const a=start+(end-start)*j/segments,r=edge?outer:inner;points.push(Math.sin(a)*r,.075,Math.cos(a)*r);}
    for(let j=0;j<segments;j++){const a=j,b=segments+1+j;indices.push(a,b,a+1,b,b+1,a+1);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.setIndex(indices);geo.computeVertexNormals();
    const uv=[];for(let j=0;j<points.length;j+=3)uv.push(points[j]*.35,points[j+2]*.35);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return geo;
  }
  for(let ring=0;ring<7;ring++){
    const radius=3.6+ring*2.15,count=Math.round(2*Math.PI*radius/2.1);
    for(let i=0;i<count;i++){const offset=.5*(ring%2),a=(i+offset)/count*Math.PI*2,b=(i+1+offset)/count*Math.PI*2;mesh(ground,pavingStone(radius-1.057,radius+1.057,a+.0013,b-.0013),rand()>.12?M.stone:M.darkStone,0,(rand()-.5)*.008,0);}
  }
  cyl(ground,M.darkStone,0,.025,0,2.6,2.6,.16,64);
  for(const r of [1.65,2.2,2.52,17.7,18.5])torus(ground,M.oldGold,0,.12,0,r,.025);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;const o=box(ground,M.oldGold,Math.sin(a)*1.9,.14,Math.cos(a)*1.9,.06,.012,.32);o.rotation.y=a;}
  for(let i=0;i<75;i++){const a=rand()*Math.PI*2,r=13+rand()*6;const o=mesh(ground,new THREE.CircleGeometry(.2+rand()*.6,8),M.moss,Math.cos(a)*r,.1,Math.sin(a)*r);o.rotation.x=-Math.PI/2;}

  // Temple roofs are curved meshes with upturned eaves and individual tile seams.
  function roof(g,x,y,z,w,d,h){
    const rows=14,cols=30,pos=[],uv=[],idx=[];
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){const u=i/cols*2-1,v=j/rows*2-1;const yy=h*(1-Math.abs(v))+.5*Math.pow(Math.abs(u),5)+.18*Math.pow(Math.abs(v),6);pos.push(x+u*w/2,y+yy,z+v*d/2);uv.push(i/cols*5,j/rows*3);}
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i,b=a+cols+1;idx.push(a,b,a+1,b,b+1,a+1);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();const m=mesh(g,geo,M.roof);m.material.side=THREE.DoubleSide;
    for(let i=0;i<=cols;i++){const xx=i/cols*2-1;curve(g,M.darkStone,[[x+xx*w/2,y+.5*Math.pow(Math.abs(xx),5)+.2,z-d/2],[x+xx*w/2,y+h+.5*Math.pow(Math.abs(xx),5),z],[x+xx*w/2,y+.5*Math.pow(Math.abs(xx),5)+.2,z+d/2]],.047);}
    for(const side of [-1,1])curve(g,M.oldGold,[[x-w/2,y+.67,z+side*d/2],[x-w*.3,y+.23,z+side*d/2],[x,y+.2,z+side*d/2],[x+w*.3,y+.23,z+side*d/2],[x+w/2,y+.67,z+side*d/2]],.095);
    beam(g,M.oldGold,new THREE.Vector3(x-w/2,y+h+.1,z),new THREE.Vector3(x+w/2,y+h+.1,z),.13);
    for(const side of [-1,1]){curve(g,M.oldGold,[[x+side*w*.43,y+h,z],[x+side*w*.49,y+h+.23,z],[x+side*w*.51,y+h+.7,z]],.13);sphere(g,M.oldGold,x+side*w*.51,y+h+.72,z,.12,.19,.12);}
  }
  box(ground,M.darkStone,0,.6,-22,17,1.2,8);
  for(let i=0;i<5;i++)box(ground,M.stone,0,.12+i*.22,-16.6-i*.6,8,.25,1);
  box(ground,M.redwood,0,3,-24.6,13,3.7,.45);
  for(const x of [-6,-3,0,3,6])for(const z of [-19,-24]){cyl(ground,M.darkStone,x,1.35,z,.5,.65,.5,12);cyl(ground,M.redwood,x,3.25,z,.24,.3,3.8,20);cyl(ground,M.oldGold,x,1.72,z,.32,.32,.12,20);cyl(ground,M.oldGold,x,4.85,z,.31,.31,.15,20);}
  for(const z of [-19,-24])box(ground,M.redwood,0,5.1,z,14,.4,.45);
  for(const x of [-5.2,-3.5,0,3.5,5.2]){box(ground,M.black,x,3,-24.25,1.35,2.9,.12);for(let i=0;i<6;i++)box(ground,M.oldGold,x-.58+i*.23,3,-24.12,.035,2.75,.035);for(let i=0;i<5;i++)box(ground,M.oldGold,x,1.7+i*.6,-24.1,1.2,.045,.035);}
  roof(ground,0,5.22,-21.5,18,10,2.05);
  roof(ground,0,7.32,-21.5,10,6,1.35);
  box(ground,M.black,0,4.54,-18.7,3,.75,.18);
  // Abstract bronze seal rather than copied game lettering.
  for(const x of [-.75,0,.75]){torus(ground,M.gold,x,4.54,-18.58,.19,.025,0);box(ground,M.gold,x,4.54,-18.55,.04,.3,.035);}
  for(const x of [-7.3,7.3])for(let i=0;i<9;i++){const z=-17+i*1.15;box(ground,M.darkStone,x,.4,z,.4,.8,.4);sphere(ground,M.stone,x,.9,z,.25,.16,.25);if(i<8)box(ground,M.darkStone,x,.65,z+.6,.16,.18,1.2);}

  const flameMeshes=[];
  function lantern(x,z,scale=1){const y=.25;const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);ground.add(g);cyl(g,M.darkStone,0,y,0,.6,.75,.5,8);cyl(g,M.stone,0,1,0,.22,.35,1.3,8);cyl(g,M.darkStone,0,1.72,0,.58,.4,.22,8);box(g,M.glow,0,2.1,0,.5,.6,.5);for(let a=0;a<4;a++){const angle=a*Math.PI/2+Math.PI/4;box(g,M.darkStone,Math.cos(angle)*.42,2.1,Math.sin(angle)*.42,.1,.75,.1);}cyl(g,M.darkStone,0,2.5,0,.22,.78,.45,4);sphere(g,M.stone,0,2.85,0,.11,.18,.11);mergeDirect(g);g.updateMatrix();for(const child of [...g.children]){child.applyMatrix4(g.matrix);ground.add(child);}ground.remove(g);
    const light=new THREE.PointLight(0xffaf59,4*scale,6*scale,2);light.position.set(x,2.1*scale,z);accents.add(light);flameMeshes.push(light);
  }
  for(const [x,z,s] of [[-10,-12,1.1],[10,-12,1.1],[-12,8,.85],[12,8,.85],[-4.5,-17,1],[4.5,-17,1]])lantern(x,z,s);

  // Weathered cliffs and dense, layered bamboo silhouettes.
  const rockGeo=new THREE.IcosahedronGeometry(1,2);const rp=rockGeo.attributes.position;for(let i=0;i<rp.count;i++){const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),n=1+Math.sin(x*9+y*7)*Math.cos(z*8-y*2)*.13;rp.setXYZ(i,x*n,y*n,z*n);}rockGeo.computeVertexNormals();
  for(let i=0;i<48;i++){const a=i/48*Math.PI*2,r=21+rand()*14;const o=mesh(ground,rockGeo,rand()>.7?M.stone:M.darkStone,Math.sin(a)*r,rand()*1.2,Math.cos(a)*r,1+rand()*2.6,1.4+rand()*4,1+rand()*2.7);o.rotation.set(rand(),rand()*6,rand()*.4);}
  for(const s of [-1,1])for(let i=0;i<5;i++)mesh(ground,rockGeo,M.darkStone,s*(30+rand()*14),3+rand()*5,-20-i*8,6+rand()*5,9+rand()*13,7+rand()*6);
  const leafGeo=new THREE.BufferGeometry();
  leafGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-1,-.6,.02,-.45,-1,0,.2,0,0,1,1,0,.2,.6,.02,-.45,0,.12,0],3));leafGeo.setIndex([6,0,1,6,1,2,6,2,3,6,3,4,6,4,5,6,5,0]);leafGeo.computeVertexNormals();
  for(let i=0;i<150;i++){
    const a=rand()*Math.PI*2,r=22+rand()*23,x=Math.sin(a)*r,z=Math.cos(a)*r;
    if(Math.abs(x)<10&&z<-17&&z>-28)continue;
    const h=8+rand()*13,radius=.07+rand()*.13,lean=(rand()-.5)*1.4;
    beam(woods,M.bamboo,new THREE.Vector3(x,0,z),new THREE.Vector3(x+lean,h,z+lean*.4),radius*.55,radius);
    for(let j=1;j<h;j+=1.1){const o=cyl(woods,M.darkStone,x+lean*j/h,j,z+lean*.4*j/h,radius*1.12,radius*1.12,.065,7);o.rotation.z=-lean/h;}
    for(let j=0;j<4;j++){const yy=h*(.55+j*.12),ang=rand()*Math.PI*2,len=1+rand()*1.4,xx=x+Math.cos(ang)*len,zz=z+Math.sin(ang)*len;
      beam(woods,M.bamboo,new THREE.Vector3(x+lean*yy/h,yy,z),new THREE.Vector3(xx,yy+.5,zz),.025,.045);
      for(let k=0;k<7;k++){const f=(k+1)/7;for(const side of [-1,1]){const lx=x+(xx-x)*f+Math.sin(ang)*side*.3, lz=z+(zz-z)*f-Math.cos(ang)*side*.3;const o=mesh(woods,leafGeo,M.leaf,lx,yy+.4*f,lz,.12,.035,.45);o.rotation.set(.2,ang+side*.5,side*.2);}}
    }
  }
  // Moss-covered old trunks and exposed roots.
  for(const [x,z] of [[-20,-5],[23,-10],[-25,17],[24,18]]){
    curve(ground,M.wood,[[x,-.5,z],[x+.3,5,z],[x-1,10,z+1],[x-2,17,z-1]],.75);
    for(let k=0;k<5;k++){const a=k/5*Math.PI*2;curve(ground,M.wood,[[x,1,z],[x+Math.cos(a),.5,z+Math.sin(a)],[x+Math.cos(a)*3,.05,z+Math.sin(a)*3]],.25);}
  }
  mergeDirect(ground);mergeDirect(woods);

  function joint(parent,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
  function character(wolf=false){
    const root=new THREE.Group();root.name=wolf?'Jade-fang Guardian':'Monkey pilgrim';scene.add(root);
    const torso=joint(root,0,wolf?1.65:1.02,0);const head=joint(torso,0,wolf?1.35:.85,wolf?.13:0);
    const leftLeg=joint(root,wolf?-.4:-.2,wolf?1.65:1.02,0),rightLeg=joint(root,wolf?.4:.2,wolf?1.65:1.02,0);
    const leftArm=joint(torso,wolf?-.85:-.43,wolf?.9:.54,0),rightArm=joint(torso,wolf?.85:.43,wolf?.9:.54,0);
    const rig={torso,head,leftLeg,rightLeg,leftArm,rightArm};
    if(!wolf){
      sphere(torso,M.black,0,.3,0,.31,.46,.22);
      // Overlapping narrow lamellae wrap a human chest instead of a round breastplate.
      for(let row=0;row<6;row++)for(let col=0;col<7;col++){const xx=(col-3)*.083,yy=.59-row*.093,zz=.205+Math.sqrt(Math.max(0,1-xx*xx/.11))*.038;const plate=box(torso,(row+col)%4?M.armor:M.bronze,xx,yy,zz,.076,.135,.035);plate.rotation.y=xx*.8;box(torso,M.oldGold,xx,yy+.047,zz+.022,.044,.008,.008);}
      for(const side of [-1,1]){const strap=box(torso,M.bronze,side*.18,.49,.265,.045,.35,.025);strap.rotation.z=side*.22;}
      box(torso,M.oldGold,0,.095,.265,.18,.05,.045);
      // Individual layered lamellar skirt and waist bindings.
      for(let layer=0;layer<3;layer++)for(let i=0;i<10;i++){const a=i/10*Math.PI*2;const o=box(torso,i%3?M.armor:M.bronze,Math.sin(a)*(.31+layer*.035),-.04-layer*.12,Math.cos(a)*(.26+layer*.035),.18,.23,.045);o.rotation.y=a;o.rotation.x=(a<Math.PI?.15:-.15);}
      torus(torso,M.red,0,.02,0,.32,.055);torus(torso,M.gold,0,.05,0,.33,.022);
      const sash=joint(torso,-.17,-.13,.3);box(sash,M.red,0,-.31,0,.2,.65,.045);sash.rotation.z=-.12;rig.cloth=sash;
      sphere(head,M.fur,0,0,0,.215,.255,.19);sphere(head,M.face,0,-.035,.15,.16,.167,.075);
      sphere(head,M.face,0,-.13,.213,.128,.073,.075);sphere(head,M.skin,0,-.075,.266,.062,.033,.024);
      for(const s of [-1,1]){sphere(head,M.fur,s*.225,0,0,.08,.115,.07);sphere(head,M.skin,s*.241,0,.04,.048,.073,.025);sphere(head,M.black,s*.077,.022,.214,.041,.016,.013);sphere(head,M.eye,s*.076,.021,.226,.009,.008,.006);const b=box(head,M.fur,s*.083,.055,.22,.112,.045,.045);b.rotation.z=s*.19;}
      box(head,M.fur,0,-.176,.275,.115,.009,.012);for(const side of [-1,1])for(let i=0;i<6;i++){const o=tuft(head,M.fur,side*(.155+i*.006),-.075-i*.024,.1,.033,.13,.15);o.rotation.z=side*(1.05+i*.1);}head.scale.set(.86,.92,.88);
      for(let i=0;i<18;i++){const a=i/18*Math.PI*2;tuft(head,M.fur,Math.sin(a)*.19,.17+rand()*.08,Math.cos(a)*.15,.05,.17,Math.cos(a)*.5);}
      // Circlet and two fine crown plumes.
      torus(head,M.gold,0,.13,0,.218,.021);sphere(head,M.gold,0,.14,.22,.055,.05,.028);
      for(const s of [-1,1])curve(head,M.lightFur,[[s*.09,.19,-.06],[s*.19,.6,-.17],[s*.27,.78,-.5],[s*.32,.64,-.72]],.012);
      for(const [arm,s] of [[leftArm,-1],[rightArm,1]]){
        sphere(arm,M.black,0,-.05,0,.145,.18,.17);
        for(let layer=0;layer<3;layer++){const pauldron=box(arm,layer===0?M.bronze:M.armor,s*(.015+layer*.026),-.015-layer*.062,0,.29+layer*.035,.085,.35);pauldron.rotation.z=-s*(.13+layer*.13);const edge=box(arm,M.oldGold,s*(.04+layer*.029),.02-layer*.063,.178,.26+layer*.035,.012,.013);edge.rotation.z=-s*(.13+layer*.13);}
        cyl(arm,M.fur,0,-.25,0,.095,.09,.48,16);cyl(arm,M.armor,0,-.47,.015,.12,.1,.28,18);
        torus(arm,M.gold,0,-.35,.015,.12,.018);torus(arm,M.gold,0,-.58,.015,.103,.018);sphere(arm,M.skin,0,-.68,.025,.082,.115,.075);
        for(let k=0;k<5;k++)sphere(arm,M.skin,-.06+k*.028,-.72,.067,.015,.065,.026);
      }
      for(const [leg,s] of [[leftLeg,-1],[rightLeg,1]]){
        cyl(leg,M.black,0,-.24,0,.135,.105,.48,18);sphere(leg,M.bronze,0,-.48,.045,.14,.13,.12);cyl(leg,M.armor,0,-.69,0,.13,.1,.37,20);torus(leg,M.gold,0,-.52,0,.13,.02);torus(leg,M.gold,0,-.86,0,.103,.018);sphere(leg,M.black,0,-.93,.09,.12,.105,.22);
      }
      const tail=joint(torso,0,-.15,-.22);curve(tail,M.fur,[[0,0,0],[.08,-.3,-.33],[.45,-.45,-.53],[.7,-.15,-.48],[.74,.1,-.29]],.055);rig.tail=tail;
      const staff=joint(rightArm,0,-.65,.04);cyl(staff,M.wood,0,0,0,.035,.035,2.65,20);for(const s of [-1,1]){cyl(staff,M.gold,0,s*1.12,0,.06,.06,.45,20);for(let j=0;j<6;j++)torus(staff,M.oldGold,0,s*(.94+j*.065),0,.063,.011);sphere(staff,M.gold,0,s*1.36,0,.065,.055,.065);}staff.rotation.z=.18;rig.staff=staff;
    } else {
      sphere(torso,M.black,0,.48,0,.56,.86,.39);sphere(torso,M.jade,0,.66,.12,.51,.6,.31);
      for(let row=0;row<7;row++)for(let col=0;col<7;col++){const xx=(col-3)*.133;const plate=box(torso,(row+col)%5?M.jade:M.armor,xx,.98-row*.128,.43-Math.abs(xx)*.19,.12,.18,.05);plate.rotation.y=xx*.6;box(torso,M.oldGold,xx,1.04-row*.128,.46-Math.abs(xx)*.19,.07,.013,.015);}
      for(let i=0;i<14;i++){const a=i/14*Math.PI*2;const o=box(torso,M.armor,Math.sin(a)*.57,-.15,Math.cos(a)*.41,.23,.62,.07);o.rotation.y=a;o.rotation.z=(rand()-.5)*.25;}
      torus(torso,M.oldGold,0,.06,0,.57,.075);sphere(torso,M.bronze,0,.04,.48,.19,.17,.08);
      sphere(head,M.whiteFur,0,.16,-.035,.31,.41,.29);sphere(head,M.whiteFur,0,-.015,.34,.2,.145,.43);sphere(head,M.black,0,.015,.719,.125,.075,.055);
      sphere(head,M.black,0,-.18,.43,.19,.115,.33);sphere(head,M.whiteFur,0,-.29,.38,.19,.085,.33);sphere(head,M.fur,0,-.28,.41,.14,.035,.26);
      for(const s of [-1,1]){
        const ear=tuft(head,M.whiteFur,s*.3,.53,-.06,.15,.48,-.15);ear.rotation.z=-s*.18;
        const ie=tuft(head,M.fur,s*.3,.55,.015,.07,.28,-.15);ie.rotation.z=-s*.18;
        sphere(head,M.black,s*.19,.215,.22,.1,.035,.045);const eye=sphere(head,M.eye,s*.185,.217,.256,.043,.011,.013);eye.rotation.z=s*.2;
        const brow=box(head,M.whiteFur,s*.195,.27,.25,.235,.105,.15);brow.rotation.z=s*.3;
        for(let i=0;i<4;i++)tuft(head,M.bone,s*(.135+i*.008),-.17,.65-i*.12,i===1?.043:.028,i===1?.235:.13,Math.PI);for(let i=0;i<3;i++)tuft(head,M.bone,s*.14,-.26,.62-i*.13,.025,.1,0);
        for(let i=0;i<6;i++){const a=(i/5-.5)*1.7;const t=tuft(head,M.whiteFur,s*(.32+Math.sin(a)*.05),-.03-i*.04,.05-Math.cos(a)*.04,.11,.43,.3);t.rotation.z=s*(1.4-i*.16);}
      }
      // Broad layered mane feathers follow the shoulder line.
      for(let i=0;i<45;i++){const a=i/45*Math.PI*2,r=.51+rand()*.23;const o=tuft(torso,i%3?M.whiteFur:M.lightFur,Math.sin(a)*r,.97+rand()*.4,Math.cos(a)*r*.65,.13,.45+rand()*.3,Math.cos(a)*.7);o.rotation.z=-Math.sin(a)*1.15;}
      for(const [arm,s] of [[leftArm,-1],[rightArm,1]]){
        sphere(arm,M.black,0,-.07,0,.27,.29,.29);for(let i=0;i<3;i++){const plate=box(arm,i?M.jade:M.armor,s*.045*i,-.04-i*.1,0,.58+i*.07,.12,.62);plate.rotation.z=-s*(.12+i*.17);const edge=box(arm,M.oldGold,s*.05*i,.015-i*.1,.32,.56+i*.07,.018,.022);edge.rotation.z=-s*(.12+i*.17);}
        for(let i=0;i<3;i++){const spike=tuft(arm,M.oldGold,s*(.12+i*.09),.21,-.08+i*.09,.07,.4+i*.07);spike.rotation.z=-s*.4;}
        cyl(arm,M.whiteFur,0,-.46,0,.2,.16,.84,20);cyl(arm,M.jade,0,-.84,0,.25,.2,.48,20);torus(arm,M.bronze,0,-.65,0,.26,.04);torus(arm,M.bronze,0,-1.05,0,.21,.04);
        sphere(arm,M.whiteFur,0,-1.2,.03,.2,.24,.17);
        for(let i=0;i<4;i++){sphere(arm,M.whiteFur,-.14+i*.09,-1.35,.1,.05,.16,.07);const claw=tuft(arm,M.bone,-.14+i*.09,-1.52,.17,.038,.19,Math.PI*.8);}
      }
      for(const leg of [leftLeg,rightLeg]){cyl(leg,M.black,0,-.37,0,.24,.18,.74,20);sphere(leg,M.bronze,0,-.75,.14,.27,.27,.16);cyl(leg,M.jade,0,-1.04,0,.25,.19,.57,20);torus(leg,M.bronze,0,-.8,0,.25,.035);sphere(leg,M.whiteFur,0,-1.45,.17,.25,.2,.42);for(let i=0;i<3;i++){const c=tuft(leg,M.bone,-.14+i*.14,-1.48,.53,.05,.24,Math.PI/2);}}
      const tail=joint(torso,0,-.28,-.37);curve(tail,M.whiteFur,[[0,0,0],[.2,-.32,-.43],[.6,-.28,-.73],[.85,.08,-.65]],.13);rig.tail=tail;
      const staff=joint(rightArm,0,-1.25,.05);cyl(staff,M.wood,0,.13,0,.065,.065,3.9,20);for(const s of [-1,1])cyl(staff,M.bronze,0,s*1.65,0,.1,.1,.5,18);const blade=mesh(staff,new THREE.ConeGeometry(.52,1.3,3),M.jade,0,2.3,0);blade.scale.z=.15;torus(staff,M.gold,0,1.75,0,.16,.04);rig.staff=staff;staff.rotation.z=-.18;
    }
    // Separate rigid armor sections at their anatomical joints before batching.
    // Existing staff references remain valid after their hand is reparented.
    const splitLimb=(limb,cut)=>{
      const lower=joint(limb,0,cut,0);
      for(const child of [...limb.children])if(child!==lower && child.position.y<cut-.012){
        limb.remove(child);child.position.y-=cut;lower.add(child);
      }
      return lower;
    };
    rig.leftElbow=splitLimb(leftArm,wolf?-.66:-.34);
    rig.rightElbow=splitLimb(rightArm,wolf?-.66:-.34);
    rig.leftKnee=splitLimb(leftLeg,wolf?-.75:-.48);
    rig.rightKnee=splitLimb(rightLeg,wolf?-.75:-.48);
    rig.leftAnkle=splitLimb(rig.leftKnee,wolf?-.55:-.38);
    rig.rightAnkle=splitLimb(rig.rightKnee,wolf?-.55:-.38);
    const hips=joint(root,0,wolf?1.65:1.02,0);
    for(const limb of [torso,leftLeg,rightLeg]){root.remove(limb);limb.position.y-=hips.position.y;hips.add(limb);}
    hips.position.y+=.09; // Sole clearance above the raised courtyard paving.
    rig.hips=hips;
    for(const g of Object.values(rig))mergeDirect(g);
    root.userData.rig=rig;return {root,rig};
  }
  const player=character(false),guardian=character(true);const hero=player.root,boss=guardian.root,heroRig=player.rig,bossRig=guardian.rig;
  hero.position.set(0,0,7);boss.position.set(0,0,-5);boss.rotation.y=Math.PI;

  const particleCount=140,positions=new Float32Array(particleCount*3);for(let i=0;i<particleCount;i++){positions[i*3]=(rand()-.5)*55;positions[i*3+1]=.5+rand()*12;positions[i*3+2]=(rand()-.5)*55;}
  const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const pc=document.createElement('canvas');pc.width=pc.height=32;const cx=pc.getContext('2d');const gradient=cx.createRadialGradient(16,16,0,16,16,16);gradient.addColorStop(0,'rgba(255,226,147,1)');gradient.addColorStop(.25,'rgba(255,196,83,.7)');gradient.addColorStop(1,'rgba(255,180,60,0)');cx.fillStyle=gradient;cx.fillRect(0,0,32,32);
  const particles=new THREE.Points(pg,new THREE.PointsMaterial({size:.12,map:new THREE.CanvasTexture(pc),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,color:0xe9d5a3,opacity:.55}));scene.add(particles);
  const ring=mesh(accents,new THREE.TorusGeometry(.65,.018,6,48),new THREE.MeshBasicMaterial({color:0x86d4c4,transparent:true,opacity:0}),0,.06,0);ring.rotation.x=Math.PI/2;
  let lowQuality=false;
  const clamp01=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
  const ease=(n,type='smooth')=>type==='in'?n*n*n:type==='out'?1-(1-n)**3:type==='linear'?n:n*n*(3-2*n);
  // Values are offsets from the bind pose; every joint receives a fresh target.
  // Contact keys match gameplay hit moments, with a short acceleration interval.
  const ready={hips:[0,0,0],hipsP:[0,-.015,0],torso:[.045,-.08,0],head:[-.025,.08,0],leftArm:[-.28,0,.16],rightArm:[-.15,0,-.12],leftElbow:[-.3,0,0],rightElbow:[-.18,0,0],leftLeg:[-.08,0,-.025],rightLeg:[.08,0,.025],leftKnee:[.1,0,0],rightKnee:[.1,0,0],staff:[.12,0,-.1]};
  const stance=(changes)=>Object.fromEntries(Object.entries({...ready,...changes}).map(([key,value])=>[key,[...value]]));
  const frame=(at,pose,curve='smooth')=>({at,pose,curve});
  const comboTracks=[
    [frame(0,stance({})),frame(.23,stance({hips:[-.04,-.45,-.04],hipsP:[0,-.08,0],torso:[.08,-.6,.1],head:[-.04,.48,0],rightArm:[-.55,.3,-.8],rightElbow:[-.95,0,-.12],leftArm:[-.4,0,.46],leftElbow:[-.7,0,.25],leftLeg:[-.26,0,-.08],rightLeg:[.3,0,.05],leftKnee:[.25,0,0],rightKnee:[.4,0,0],staff:[.7,.15,-.9]})),
     frame(.32,stance({hips:[-.035,-.52,-.04],hipsP:[0,-.09,0],torso:[.1,-.65,.1],head:[-.04,.6,0],rightArm:[-.65,.4,-.95],rightElbow:[-1.05,0,-.14],leftArm:[-.5,0,.65],leftElbow:[-.9,0,.15],leftLeg:[-.32,0,-.08],rightLeg:[.36,0,.05],leftKnee:[.3,0,0],rightKnee:[.4,0,0],staff:[.75,.1,-.85]})),
     frame(.42,stance({hips:[.09,.42,.02],hipsP:[0,-.035,.035],torso:[.12,.38,-.16],head:[-.05,-.38,.05],rightArm:[-1.28,-.3,-.6],rightElbow:[-.3,0,0],leftArm:[-1.12,.2,.8],leftElbow:[-.65,0,0],leftLeg:[-.43,0,-.045],rightLeg:[.4,0,.05],leftKnee:[.18,0,0],rightKnee:[.35,0,0],staff:[.18,.16,1.32]}),'in'),
     frame(.58,stance({hips:[.12,.68,.04],hipsP:[0,-.06,.025],torso:[.16,.6,-.16],head:[-.04,-.55,0],rightArm:[-1.1,-.5,.18],rightElbow:[-.6,0,-.15],leftArm:[-.9,.15,.85],leftElbow:[-1.05,0,.05],leftLeg:[-.35,0,-.04],rightLeg:[.3,0,.07],leftKnee:[.25,0,0],rightKnee:[.4,0,0],staff:[-.05,.2,1.45]}),'out'),frame(.84,stance({torso:[.04,.12,-.025],rightArm:[-.45,-.1,-.15],rightElbow:[-.55,0,0],staff:[.18,0,.35]})),frame(1,stance({}))],
    [frame(0,stance({torso:[.05,.15,0],rightArm:[-.35,-.2,.1],rightElbow:[-.45,0,0],staff:[.2,0,.4]})),
     frame(.26,stance({hips:[.09,.52,.08],hipsP:[0,-.14,0],torso:[.18,.68,-.12],head:[-.05,-.6,0],rightArm:[-.48,-.35,.5],rightElbow:[-.9,0,-.15],leftArm:[-.7,.3,.9],leftElbow:[-1.1,0,0],leftLeg:[-.4,0,-.09],rightLeg:[.32,0,.12],leftKnee:[.55,0,0],rightKnee:[.5,0,0],staff:[-.65,.1,1.2]})),
     frame(.35,stance({hips:[.1,.6,.09],hipsP:[0,-.15,0],torso:[.2,.72,-.13],head:[-.05,-.65,0],rightArm:[-.4,-.4,.5],rightElbow:[-1.05,0,-.1],leftArm:[-.8,.3,.95],leftElbow:[-1.2,0,0],leftLeg:[-.42,0,-.09],rightLeg:[.35,0,.12],leftKnee:[.6,0,0],rightKnee:[.5,0,0],staff:[-.72,.15,1.35]})),
     frame(.46,stance({hips:[-.08,-.42,-.04],hipsP:[0,.035,.015],torso:[-.1,-.5,.08],head:[.06,.4,-.04],rightArm:[-2,-.2,-.55],rightElbow:[-.18,0,0],leftArm:[-1.7,.3,.6],leftElbow:[-.55,0,0],leftLeg:[.16,0,-.05],rightLeg:[-.28,0,.08],leftKnee:[.1,0,0],rightKnee:[.15,0,0],staff:[.55,-.15,-.98]}),'in'),
     frame(.63,stance({hips:[-.1,-.62,-.04],hipsP:[0,.015,0],torso:[-.16,-.65,.08],head:[.08,.5,0],rightArm:[-2.25,-.2,-.3],rightElbow:[-.5,0,0],leftArm:[-1.85,.25,.55],leftElbow:[-.8,0,0],leftLeg:[.25,0,-.03],rightLeg:[-.26,0,.03],leftKnee:[.18,0,0],rightKnee:[.17,0,0],staff:[.45,-.15,-.6]}),'out'),frame(.86,stance({torso:[-.02,-.2,0],rightArm:[-.8,0,-.2],rightElbow:[-.6,0,0],staff:[.25,0,-.25]})),frame(1,stance({}))],
    [frame(0,stance({})),frame(.18,stance({hips:[.06,-.5,0],hipsP:[0,-.13,0],torso:[.14,-.45,.13],head:[-.08,.5,0],rightArm:[-.65,.3,-.75],rightElbow:[-.9,0,0],leftArm:[-.6,0,.6],leftElbow:[-.9,0,0],leftLeg:[-.35,0,-.04],rightLeg:[.35,0,.08],leftKnee:[.5,0,0],rightKnee:[.35,0,0],staff:[.35,0,-.75]})),
     frame(.38,stance({hips:[-.05,2.8,0],hipsP:[0,.06,0],torso:[-.1,.3,-.07],head:[0,-.35,0],rightArm:[-2.65,.15,-.3],rightElbow:[-.75,0,0],leftArm:[-2.45,.1,.45],leftElbow:[-.95,0,0],leftLeg:[-.15,.2,-.05],rightLeg:[.35,-.1,.04],leftKnee:[.4,0,0],rightKnee:[.85,0,0],staff:[.35,.1,-.2]}),'in'),
     frame(.48,stance({hips:[-.15,5.65,0],hipsP:[0,.07,0],torso:[-.23,.25,-.06],head:[.1,-.2,0],rightArm:[-2.85,0,-.2],rightElbow:[-.55,0,0],leftArm:[-2.7,0,.35],leftElbow:[-.75,0,0],leftLeg:[-.3,0,-.03],rightLeg:[.3,0,.04],leftKnee:[.4,0,0],rightKnee:[.5,0,0],staff:[.45,0,-.1]}),'linear'),
     frame(.57,stance({hips:[.13,6.35,-.015],hipsP:[0,-.17,.04],torso:[.53,-.15,0],head:[-.2,.12,0],rightArm:[-1.25,0,-.22],rightElbow:[-.08,0,0],leftArm:[-1.12,.1,.5],leftElbow:[-.32,0,0],leftLeg:[-.55,0,-.08],rightLeg:[.42,0,.08],leftKnee:[.55,0,0],rightKnee:[.8,0,0],staff:[-.75,0,-.2]}),'in'),
     frame(.7,stance({hips:[.16,6.4,0],hipsP:[0,-.19,.04],torso:[.6,-.16,0],head:[-.26,.1,0],rightArm:[-.95,0,-.2],rightElbow:[-.2,0,0],leftArm:[-1,0,.5],leftElbow:[-.45,0,0],leftLeg:[-.55,0,-.06],rightLeg:[.4,0,.08],leftKnee:[.65,0,0],rightKnee:[.8,0,0],staff:[-.9,0,-.12]}),'out'),frame(.88,stance({hips:[.03,Math.PI*2,0],hipsP:[0,-.07,0],torso:[.15,-.1,0],rightArm:[-.45,0,-.15],rightElbow:[-.35,0,0],staff:[-.3,0,-.1]})),frame(1,stance({hips:[0,Math.PI*2,0]}))]
  ];
  const heavyTrack=[frame(0,stance({})),frame(.2,stance({hips:[.12,-.2,0],hipsP:[0,-.2,-.025],torso:[.35,-.2,.05],head:[-.18,.25,0],leftLeg:[-.55,0,-.1],rightLeg:[-.35,0,.1],leftKnee:[.95,0,0],rightKnee:[.85,0,0],rightArm:[-1.5,.1,-.5],rightElbow:[-1.2,0,0],leftArm:[-1.3,0,.6],leftElbow:[-1.15,0,0],staff:[.8,0,-.4]})),
    frame(.39,stance({hips:[-.12,-.12,0],hipsP:[0,.05,0],torso:[-.2,-.12,0],head:[.12,.2,0],leftLeg:[-.65,0,-.05],rightLeg:[.1,0,.05],leftKnee:[1.1,0,0],rightKnee:[.75,0,0],rightArm:[-2.9,.1,-.2],rightElbow:[-.75,0,0],leftArm:[-2.7,.1,.4],leftElbow:[-1,0,0],staff:[.45,0,-.2]}),'out'),
    frame(.51,stance({hips:[-.18,-.1,0],hipsP:[0,.04,0],torso:[-.28,-.08,0],head:[.12,.05,0],leftLeg:[-.5,0,-.08],rightLeg:[-.15,0,.08],leftKnee:[.75,0,0],rightKnee:[.45,0,0],rightArm:[-3,.05,-.2],rightElbow:[-.55,0,0],leftArm:[-2.8,0,.35],leftElbow:[-.75,0,0],staff:[.5,0,-.13]})),
    frame(.6,stance({hips:[.17,.12,0],hipsP:[0,-.21,.04],torso:[.64,.12,0],head:[-.25,-.08,0],leftLeg:[-.58,0,-.08],rightLeg:[.4,0,.09],leftKnee:[.65,0,0],rightKnee:[1,0,0],rightArm:[-1.1,0,-.18],rightElbow:[-.05,0,0],leftArm:[-.95,0,.5],leftElbow:[-.3,0,0],staff:[-.9,0,-.18]}),'in'),
    frame(.73,stance({hips:[.18,.13,0],hipsP:[0,-.23,.045],torso:[.7,.12,0],head:[-.28,-.08,0],leftLeg:[-.6,0,-.08],rightLeg:[.4,0,.09],leftKnee:[.7,0,0],rightKnee:[1,0,0],rightArm:[-.9,0,-.2],rightElbow:[-.12,0,0],leftArm:[-.9,0,.5],leftElbow:[-.4,0,0],staff:[-1,0,-.1]}),'out'),frame(.9,stance({hipsP:[0,-.09,0],torso:[.2,0,0],rightArm:[-.55,0,-.2],rightElbow:[-.4,0,0],staff:[-.25,0,-.1]})),frame(1,stance({}))];
  const dodgeTrack=[frame(0,stance({})),frame(.12,stance({hipsP:[0,.015,0],torso:[.55,0,0],head:[-.15,0,0],leftLeg:[-.6,0,0],rightLeg:[-.55,0,0],leftKnee:[1.3,0,0],rightKnee:[1.2,0,0],leftArm:[-1.1,0,.4],rightArm:[-.8,0,-.4],leftElbow:[-1.5,0,0],rightElbow:[-1.4,0,0],staff:[.15,0,1.1]})),
    frame(.3,stance({hips:[1.25,0,.08],hipsP:[0,.67,0],torso:[.5,0,0],head:[.2,0,0],leftLeg:[-1.1,0,0],rightLeg:[-1.2,0,0],leftKnee:[2,0,0],rightKnee:[2.1,0,0],leftArm:[-1.5,0,.3],rightArm:[-1.3,0,-.3],leftElbow:[-1.7,0,0],rightElbow:[-1.6,0,0],staff:[.15,0,1.15]})),
    frame(.55,stance({hips:[3.7,0,.04],hipsP:[0,.74,0],torso:[.5,0,0],head:[.25,0,0],leftLeg:[-1.35,0,-.05],rightLeg:[-1.15,0,.05],leftKnee:[2.15,0,0],rightKnee:[2,0,0],leftArm:[-1.5,0,.3],rightArm:[-1.3,0,-.3],leftElbow:[-1.7,0,0],rightElbow:[-1.6,0,0],staff:[.15,0,1.15]}),'linear'),
    frame(.8,stance({hips:[5.85,0,0],hipsP:[0,.16,0],torso:[.6,0,0],head:[-.15,0,0],leftLeg:[-.65,0,-.04],rightLeg:[-.3,0,.04],leftKnee:[1,0,0],rightKnee:[.7,0,0],leftArm:[-.6,0,.4],rightArm:[-.5,0,-.3],leftElbow:[-.8,0,0],rightElbow:[-.7,0,0],staff:[.2,0,.65]}),'linear'),frame(1,stance({hips:[Math.PI*2,0,0]}))];
  // Cinematic tracks use normalized progress, so the director can change duration
  // or skip a shot without depending on elapsed battle time or input state.
  const clonePose=pose=>Object.fromEntries(Object.entries(pose).map(([key,value])=>[key,[...value]]));
  const heroFallen=stance({hips:[.1,.08,-.08],hipsP:[0,-.48,0],torso:[.62,.08,-.12],head:[.36,0,.07],leftLeg:[-1,0,-.045],rightLeg:[-.9,0,.045],leftKnee:[2.35,0,0],rightKnee:[2.25,0,0],leftArm:[-.3,0,.4],rightArm:[-.25,0,-.35],leftElbow:[-.4,0,0],rightElbow:[-.2,0,0],staff:[.04,0,1.86],tail:[.05,0,.03],cloth:[-1.9,0,.04],clothP:[0,.06,.03]});
  const bossReady={hips:[.02,0,0],hipsP:[0,-.035,0],torso:[.1,0,0],head:[.15,0,0],leftArm:[-.15,0,.18],rightArm:[-.12,0,-.18],leftElbow:[-.25,0,0],rightElbow:[-.23,0,0],leftLeg:[0,0,-.02],rightLeg:[0,0,.02],leftKnee:[.08,0,0],rightKnee:[.08,0,0],staff:[.12,0,.05],tail:[.06,0,0]};
  const bossStance=changes=>clonePose({...bossReady,...changes});
  const bossFallen=bossStance({hips:[.2,.08,.08],hipsP:[0,-.74,0],torso:[.72,.02,.12],head:[.4,-.05,.1],leftLeg:[-1.05,0,-.055],rightLeg:[-.85,0,.055],leftKnee:[2.35,0,0],rightKnee:[2.2,0,0],leftArm:[-.35,0,.48],rightArm:[-.25,0,-.35],leftElbow:[-.4,0,0],rightElbow:[-.2,0,0],staff:[.05,0,2],tail:[.1,0,0]});
  groundFeet(heroFallen);groundFeet(bossFallen);
  const composed=stance({hipsP:[0,0,0],torso:[0,0,0],head:[-.035,0,0],leftArm:[-.08,0,.12],leftElbow:[-.15,0,0],rightArm:[-1.1,0,-.12],rightElbow:[0,0,0],leftLeg:[-.04,0,-.02],rightLeg:[.04,0,.02],leftKnee:[.07,0,0],rightKnee:[.07,0,0],staff:[1.1,0,-.06]});
  const cinematicTracks={
    intro:{
      hero:[frame(0,stance({torso:[.03,-.16,0],head:[.16,.12,0],rightArm:[-.8,0,-.2],rightElbow:[-.1,0,0],staff:[.9,0,.02]})),
        frame(.2,stance({torso:[.02,-.2,0],head:[.06,.18,0],rightArm:[-.95,.08,-.3],rightElbow:[-.35,0,0],leftArm:[-.55,0,.3],leftElbow:[-.65,0,0],staff:[.9,0,-.3]})),
        frame(.35,stance({hips:[0,-.12,0],torso:[.06,-.3,.04],head:[-.035,.3,0],rightArm:[-1.15,.1,-.62],rightElbow:[-.6,0,0],leftArm:[-.85,0,.5],leftElbow:[-.8,0,0],staff:[.4,0,-1.15]})),
        frame(.47,stance({hips:[0,.12,0],torso:[.04,.32,-.05],head:[-.04,-.28,0],rightArm:[-1.18,-.1,-.42],rightElbow:[-.4,0,0],leftArm:[-.9,0,.55],leftElbow:[-.75,0,0],staff:[.35,0,2.75]}),'linear'),
        frame(.59,stance({torso:[.04,-.12,0],head:[.03,.12,0],rightArm:[-.95,0,-.2],rightElbow:[-.35,0,0],leftArm:[-1.4,0,.5],leftElbow:[-1.2,0,0],staff:[1.1,0,6.1]}),'linear'),
        frame(.73,stance({torso:[.19,-.08,0],head:[.2,.08,0],rightArm:[-.95,0,-.16],rightElbow:[-.25,0,0],leftArm:[-1.45,0,.48],leftElbow:[-1.3,0,0],staff:[1.05,0,6.12]})),
        frame(.9,stance({rightArm:[-.32,0,-.12],rightElbow:[-.25,0,0],leftArm:[-.5,0,.18],leftElbow:[-.45,0,0],staff:[.25,0,Math.PI*2-.1]})),frame(1,stance({staff:[.12,0,Math.PI*2-.1]}))],
      boss:[frame(0,bossStance({torso:[.23,0,0],head:[.4,0,0],rightArm:[-.08,0,-.18],rightElbow:[-.15,0,0],staff:[.08,0,.05]})),
        frame(.33,bossStance({torso:[.18,0,0],head:[.22,0,0]})),
        frame(.58,bossStance({torso:[.02,-.12,0],head:[-.14,.12,0],rightArm:[-1.18,.06,-.36],rightElbow:[-.48,0,0],leftArm:[-.55,0,.3],leftElbow:[-.45,0,0],staff:[.85,0,-.15]})),
        frame(.74,bossStance({torso:[.04,-.1,0],head:[-.08,.1,0],rightArm:[-1.08,0,-.32],rightElbow:[-.4,0,0],staff:[.75,0,-.12]})),frame(.94,bossStance({})),frame(1,bossStance({}))]
    },
    phase2:{
      hero:[frame(0,stance({})),frame(.3,stance({hips:[-.035,0,0],torso:[-.08,.1,0],head:[.05,-.1,0],leftArm:[-.85,0,.35],leftElbow:[-.75,0,0],rightArm:[-.6,0,-.3],rightElbow:[-.4,0,0],staff:[.4,0,-.3]})),
        frame(.5,stance({hips:[-.06,.08,0],hipsP:[0,.02,0],torso:[-.16,.12,0],head:[.05,-.12,0],leftArm:[-1.55,0,.38],leftElbow:[-1.15,0,0],rightArm:[-.8,0,-.35],rightElbow:[-.5,0,0],staff:[.5,0,-.4]}),'out'),
        frame(.7,stance({torso:[-.07,.08,0],leftArm:[-1.1,0,.3],leftElbow:[-.9,0,0],rightArm:[-.5,0,-.23],rightElbow:[-.35,0,0],staff:[.35,0,-.25]})),frame(.94,stance({})),frame(1,stance({}))],
      boss:[frame(0,bossStance({})),frame(.25,bossStance({hips:[.06,0,0],hipsP:[0,-.18,0],torso:[.46,0,0],head:[.28,0,0],leftLeg:[-.42,0,-.04],rightLeg:[-.4,0,.04],leftKnee:[.85,0,0],rightKnee:[.82,0,0],leftArm:[-.55,0,.3],rightArm:[-.65,0,-.3],leftElbow:[-1,0,0],rightElbow:[-.95,0,0],staff:[.6,0,-.25]})),
        frame(.45,bossStance({hips:[-.035,0,0],hipsP:[0,.015,0],torso:[-.2,0,0],head:[-.4,0,0],leftArm:[-2.2,0,.75],rightArm:[-2.45,0,-.68],leftElbow:[-.4,0,0],rightElbow:[-.35,0,0],staff:[.35,0,-.08],leftLeg:[-.12,0,-.08],rightLeg:[-.1,0,.08],leftKnee:[.18,0,0],rightKnee:[.18,0,0]}),'out'),
        frame(.64,bossStance({hips:[-.02,0,0],hipsP:[0,.01,0],torso:[-.14,0,0],head:[-.32,0,0],leftArm:[-1.85,0,1],rightArm:[-2.3,0,-.85],leftElbow:[-.25,0,0],rightElbow:[-.25,0,0],staff:[.25,0,-.08],leftLeg:[-.1,0,-.07],rightLeg:[-.08,0,.07],leftKnee:[.17,0,0],rightKnee:[.17,0,0]})),
        frame(.83,bossStance({torso:[.2,0,0],head:[.06,0,0],leftArm:[-.6,0,.32],rightArm:[-.7,0,-.3],leftElbow:[-.4,0,0],rightElbow:[-.4,0,0],staff:[.5,0,-.1]})),frame(1,bossStance({torso:[.14,0,0],head:[.1,0,0]}))]
    },
    victory:{
      hero:[frame(0,stance({})),frame(.21,stance({torso:[.01,-.1,0],head:[.06,.1,0],leftArm:[-.18,0,.15],rightArm:[-.3,0,-.15],rightElbow:[-.3,0,0],staff:[.25,0,-.2]})),
        frame(.35,stance({hips:[0,-.16,0],torso:[.035,-.38,.04],head:[-.02,.3,0],rightArm:[-1.15,.1,-.6],rightElbow:[-.5,0,0],leftArm:[-.55,0,.35],leftElbow:[-.5,0,0],staff:[.4,0,-1.2]})),
        frame(.46,stance({hips:[0,.12,0],torso:[.03,.3,-.05],head:[-.03,-.25,0],rightArm:[-1.2,-.1,-.4],rightElbow:[-.35,0,0],leftArm:[-.55,0,.3],leftElbow:[-.45,0,0],staff:[.35,0,2.8]}),'linear'),
        frame(.57,stance({torso:[.025,-.08,0],head:[.05,.08,0],rightArm:[-1.08,0,-.16],rightElbow:[-.1,0,0],leftArm:[-.15,0,.12],leftElbow:[-.2,0,0],staff:[1.2,0,Math.PI*2-.08]}),'linear'),
        frame(.7,{...clonePose(composed),hipsP:[0,.01,0],head:[.09,0,0],staff:[1.1,0,Math.PI*2-.06]}),frame(.84,{...clonePose(composed),staff:[1.1,0,Math.PI*2-.06]}),frame(1,{...clonePose(composed),staff:[1.1,0,Math.PI*2-.06]})],
      boss:[frame(0,bossStance({})),frame(.1,bossStance({torso:[-.15,.08,-.06],head:[-.22,-.08,0],leftArm:[-.3,0,.3],rightArm:[-.3,0,-.3]})),
        frame(.3,bossStance({hips:[.08,.03,.03],hipsP:[0,-.22,0],torso:[.35,.04,.07],head:[.25,0,.03],leftLeg:[-.62,0,-.04],rightLeg:[-.52,0,.04],leftKnee:[1.35,0,0],rightKnee:[1.25,0,0],leftArm:[-.4,0,.4],rightArm:[-.3,0,-.35],leftElbow:[-.45,0,0],rightElbow:[-.3,0,0],staff:[.05,0,1.25]})),
        frame(.55,clonePose(bossFallen),'out'),frame(.72,clonePose(bossFallen)),frame(1,clonePose(bossFallen))]
    },
    defeat:{
      hero:[frame(0,stance({})),frame(.12,stance({hips:[-.05,.06,-.04],hipsP:[0,.01,0],torso:[-.2,.1,-.08],head:[-.2,-.08,.04],leftArm:[-.45,0,.3],rightArm:[-.3,0,-.25],leftElbow:[-.6,0,0],rightElbow:[-.35,0,0]})),
        frame(.34,stance({hips:[.04,.07,-.05],hipsP:[0,-.13,0],cloth:[-1.1,0,.04],clothP:[0,.04,.02],torso:[.32,.07,-.08],head:[.2,0,.05],leftLeg:[-.62,0,-.04],rightLeg:[-.55,0,.04],leftKnee:[1.35,0,0],rightKnee:[1.25,0,0],leftArm:[-.45,0,.35],rightArm:[-.3,0,-.3],leftElbow:[-.5,0,0],rightElbow:[-.3,0,0],staff:[.05,0,1.25]})),
        frame(.65,clonePose(heroFallen),'out'),frame(.8,clonePose(heroFallen)),frame(1,clonePose(heroFallen))],
      boss:[frame(0,bossStance({})),frame(.24,bossStance({torso:[.06,.08,0],head:[.12,-.08,0],rightArm:[-.4,0,-.22],rightElbow:[-.35,0,0],staff:[.35,0,.05]})),
        frame(.52,bossStance({torso:[.08,0,0],head:[.28,0,0],leftArm:[-.1,0,.12],rightArm:[-.12,0,-.14],leftElbow:[-.15,0,0],rightElbow:[-.15,0,0],staff:[.12,0,.05]})),frame(1,bossStance({torso:[.08,0,0],head:[.26,0,0],leftArm:[-.1,0,.12],rightArm:[-.12,0,-.14],leftElbow:[-.15,0,0],rightElbow:[-.15,0,0],staff:[.12,0,.05]}))]
    }
  };
  function groundFeet(pose){
    for(const side of ['left','right'])pose[side+'Ankle']=[-(pose.hips?.[0]||0)-(pose[side+'Leg']?.[0]||0)-(pose[side+'Knee']?.[0]||0),0,-(pose.hips?.[2]||0)-(pose[side+'Leg']?.[2]||0)];
    return pose;
  }
  function cinematicPose(type,progress){
    const tracks=cinematicTracks[type];if(!tracks)return null;
    const p=clamp01(progress),hero=sampleTrack(tracks.hero,p),boss=sampleTrack(tracks.boss,p);
    // Secondary motion is also progress-led. It settles completely on a death hold.
    const heroSettled=type==='defeat'?ease(clamp01((p-.5)/.25)):0,bossSettled=type==='victory'?ease(clamp01((p-.4)/.25)):0;
    if(!hero.tail)hero.tail=[-.08+Math.sin(p*9)*.025,-(hero.torso?.[1]||0)*.3,0];
    if(!hero.cloth)hero.cloth=[-.05-(hero.torso?.[0]||0)*.24,0,(hero.torso?.[1]||0)*.1];
    if(heroSettled>.999){hero.tail=[...heroFallen.tail];hero.cloth=[...heroFallen.cloth];}
    if(bossSettled>.999)boss.tail=[...bossFallen.tail];
    groundFeet(hero);groundFeet(boss);
    return {hero,boss};
  }

  function sampleTrack(track,progress){
    const p=clamp01(progress);let index=1;while(index<track.length-1&&track[index].at<p)index++;
    const a=track[index-1],b=track[index],f=ease(clamp01((p-a.at)/(b.at-a.at)),b.curve),pose={};
    for(const name of new Set([...Object.keys(a.pose),...Object.keys(b.pose)])){
      const av=a.pose[name]||[0,0,0],bv=b.pose[name]||[0,0,0];pose[name]=av.map((v,i)=>v+(bv[i]-v)*f);
    }return pose;
  }
  const capture=rig=>Object.fromEntries(Object.entries(rig).map(([name,j])=>[name,{p:j.position.clone(),q:j.quaternion.clone()}]));
  const heroBind=capture(heroRig),bossBind=capture(bossRig),targetQ=new THREE.Quaternion(),offsetQ=new THREE.Quaternion(),euler=new THREE.Euler(),targetP=new THREE.Vector3();
  function applyPose(rig,bind,pose,dt,response){
    const alpha=1-Math.exp(-Math.max(0,dt)*response);
    for(const [name,j] of Object.entries(rig)){
      const r=pose[name]||[0,0,0],p=pose[name+'P']||[0,0,0],base=bind[name];
      offsetQ.setFromEuler(euler.set(r[0],r[1],r[2],'XYZ'));targetQ.copy(base.q).multiply(offsetQ);
      targetP.copy(base.p).add(new THREE.Vector3(p[0],p[1],p[2]));
      j.quaternion.slerp(targetQ,alpha);j.position.lerp(targetP,alpha);
    }
  }
  const add=(pose,key,x=0,y=0,z=0)=>{const v=pose[key]||(pose[key]=[0,0,0]);v[0]+=x;v[1]+=y;v[2]+=z;};
  function heroIdle(t,state){
    const speed=state.moving?Math.max(.2,clamp01(state.moveSpeed??1)):0,phase=t*(7.8+speed*3),l=Math.sin(phase),r=-l,breath=Math.sin(t*2.1);
    const pose=stance({hips:[0,0,Math.sin(phase)*speed*.025],hipsP:[0,-.02+Math.cos(phase*2)*speed*.025+breath*.007,0],torso:[.055+speed*.12+breath*.008,-.08+Math.sin(phase)*speed*.06,Math.sin(t*1.4)*.012],head:[-.04-speed*.07,.08+Math.sin(t*.65)*.04,0],leftLeg:[-.06+l*speed*.68,0,-.025],rightLeg:[.06+r*speed*.68,0,.025],leftKnee:[.1+Math.max(0,l)*speed*1.05,0,0],rightKnee:[.1+Math.max(0,r)*speed*1.05,0,0],leftArm:[-.28-l*speed*.44,0,.16],rightArm:[-.15-r*speed*.3,0,-.12],leftElbow:[-.3-Math.max(0,-l)*speed*.38,0,0],rightElbow:[-.18-Math.max(0,-r)*speed*.3,0,0]});
    return pose;
  }
  function bossPose(t,state){
    const moving=state.bossMoving?1:0,step=Math.sin(t*5.1),pose={hips:[.02,0,step*moving*.025],hipsP:[0,-.035+Math.cos(t*10.2)*moving*.035,0],torso:[.1+Math.sin(t*1.5)*.02,Math.sin(t*.5)*.025,0],head:[.15,-Math.sin(t*.5)*.025,0],leftArm:[-.15-step*moving*.3,0,.18],rightArm:[-.12+step*moving*.3,0,-.18],leftElbow:[-.25,0,0],rightElbow:[-.23,0,0],leftLeg:[step*moving*.48,0,-.02],rightLeg:[-step*moving*.48,0,.02],leftKnee:[.08+Math.max(0,step)*moving*.75,0,0],rightKnee:[.08+Math.max(0,-step)*moving*.75,0,0],staff:[.12,0,.05],tail:[.06,Math.sin(t*1.7)*.14,0]};
    if(Number.isFinite(state.bossAttacking)&&state.bossAttacking>=0){
      const slam=state.bossAttackType==='slam',wind=slam?
        {hips:[-.05,-.12,0],hipsP:[0,-.12,0],torso:[-.2,-.15,0],head:[.3,.15,0],rightArm:[-2.8,0,-.25],rightElbow:[-.75,0,0],leftArm:[-2.5,0,.35],leftElbow:[-1,0,0],staff:[.3,0,-.1],leftLeg:[-.3,0,-.06],rightLeg:[.2,0,.06],leftKnee:[.4,0,0],rightKnee:[.4,0,0]}:
        {hips:[-.04,-.55,0],hipsP:[0,-.1,0],torso:[.12,-.5,.08],head:[.08,.6,0],rightArm:[-.8,.3,-.85],rightElbow:[-.85,0,0],leftArm:[-.65,0,.7],leftElbow:[-.8,0,0],staff:[.5,0,-.85],leftLeg:[-.25,0,-.08],rightLeg:[.3,0,.08],leftKnee:[.3,0,0],rightKnee:[.35,0,0]};
      const contact=slam?
        {hips:[.15,.08,0],hipsP:[0,-.2,.035],torso:[.62,.1,0],head:[-.12,-.1,0],rightArm:[-1.1,0,-.18],rightElbow:[-.05,0,0],leftArm:[-1,0,.45],leftElbow:[-.25,0,0],staff:[-.75,0,-.12],leftLeg:[-.4,0,-.06],rightLeg:[.3,0,.08],leftKnee:[.55,0,0],rightKnee:[.65,0,0]}:
        {hips:[.08,.65,.04],hipsP:[0,-.08,.03],torso:[.2,.5,-.13],head:[.02,-.55,0],rightArm:[-1.2,-.3,-.25],rightElbow:[-.15,0,0],leftArm:[-1.1,.2,.8],leftElbow:[-.55,0,0],staff:[.1,0,1.4],leftLeg:[-.38,0,-.04],rightLeg:[.3,0,.06],leftKnee:[.3,0,0],rightKnee:[.45,0,0]};
      const follow={...contact,torso:slam?[.72,.12,0]:[.23,.65,-.14],rightArm:slam?[-.9,0,-.2]:[-1,-.45,.08],rightElbow:[-.45,0,0],staff:slam?[-.92,0,-.1]:[.02,0,1.55]};
      const base=structuredClone(pose),track=[frame(0,base),frame(.26,{...base,...wind}),frame(.4,{...base,...wind}),frame(.545,{...base,...contact},'in'),frame(.72,{...base,...follow},'out'),frame(1,base)];
      Object.assign(pose,sampleTrack(track,state.bossAttacking));
    }
    const hit=clamp01(state.bossHit);add(pose,'torso',-.22*hit,.13*hit,-.07*hit);add(pose,'head',-.25*hit,-.1*hit,0);add(pose,'hipsP',0,-.045*hit,0);
    if(state.bossDead)Object.assign(pose,clonePose(bossFallen));
    return pose;
  }
  function animate(t,dt,state={}){
    dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    let pose=heroIdle(t,state),response=20;
    const attacking=Number.isFinite(state.attacking)&&state.attacking>=0;
    if(attacking){pose=sampleTrack(state.heavy?heavyTrack:comboTracks[Math.max(0,Math.min(2,state.combo|0))],state.attacking);response=90;}
    if(state.dodging){pose=sampleTrack(dodgeTrack,state.dodgeProgress??0);response=75;}
    if(state.healing){
      const p=clamp01(state.healProgress),weight=Math.min(ease(clamp01(p/.2),'out'),1-ease(clamp01((p-.78)/.22)));
      add(pose,'leftArm',-1.6*weight,0,.25*weight);add(pose,'leftElbow',-1.3*weight,0,0);add(pose,'head',-.18*weight,-.08*weight,-.07*weight);add(pose,'torso',-.06*weight,0,0);response=30;
    }
    if((state.casting??0)>0){const c=clamp01(state.casting);add(pose,'leftArm',-1.4*c,-.2*c,.15*c);add(pose,'leftElbow',.2*c,0,0);add(pose,'torso',-.07*c,-.16*c,0);add(pose,'head',0,.16*c,0);response=45;}
    const hit=clamp01(state.heroHit);add(pose,'hips',-.1*hit,.07*hit,.09*hit);add(pose,'torso',-.27*hit,.12*hit,.13*hit);add(pose,'head',-.22*hit,-.13*hit,-.09*hit);add(pose,'leftArm',-.25*hit,0,.15*hit);add(pose,'hipsP',0,-.035*hit,0);
    if(state.heroDead){pose=clonePose(heroFallen);response=8;}
    const cinematic=cinematicPose(state.cinematic,state.cinematicProgress);
    if(cinematic){pose=cinematic.hero;response=35;}
    // Delayed accessories communicate acceleration without detaching from the rig.
    const twist=pose.torso?.[1]||0,lean=pose.torso?.[0]||0,speed=state.moving?clamp01(state.moveSpeed??1):0;
    if(!cinematic&&!state.heroDead){
      pose.tail=[-.1+Math.sin(t*3.1)*(.035+speed*.07)+lean*.15,-twist*.35+Math.sin(t*1.3)*.08,-twist*.12];
      pose.cloth=[-.04-speed*.24-lean*.35+Math.sin(t*5.2)*(.02+speed*.05),-twist*.25,Math.sin(t*2.7)*.025+twist*.12];
    }
    applyPose(heroRig,heroBind,pose,dt,response);
    // Freeze is an exact hold of the current pose, including secondary motion.
    if(!state.bossFrozen || state.bossDead)applyPose(bossRig,bossBind,cinematic?cinematic.boss:bossPose(t,state),dt,cinematic?35:state.bossDead?7:state.bossAttacking>=0?70:20);
    if(state.bossFrozen){ring.material.opacity=.75;ring.position.copy(boss.position);ring.position.y+=.08;ring.scale.setScalar(1.4+Math.sin(t*8)*.08);ring.rotation.z=t;}else ring.material.opacity=0;
    particles.rotation.y=t*.008;
    flameMeshes.forEach((l,i)=>{l.intensity=(lowQuality?1.5:3.5)+Math.sin(t*6+i*3)*.4;});
  }

  function setQuality(quality){lowQuality=quality==='low';particles.visible=!lowQuality;woods.visible=true;woods.children.forEach(o=>{o.castShadow=!lowQuality;});for(let i=0;i<flameMeshes.length;i++)flameMeshes[i].visible=!lowQuality||i<2;}
  return {hero,boss,heroRig,bossRig,animate,setQuality,particles,ground,woods};
}
