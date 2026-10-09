// Isolated art experiment; no adventure state, storage or combat dependencies.
const $ = id => document.getElementById(id);
try {
  const THREE = await import('https://cdn.keepwork.com/keepwork/cdn/vendor/three/three.module.js');
  const response = await fetch('../experiments/character-lab/hero.json', {cache:'no-cache'});
  if (!response.ok) throw new Error(`模型读取失败 (${response.status})`);
  const data = await response.json();
  const renderer = new THREE.WebGLRenderer({canvas:$('viewport'),antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.10;
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(32,1,.1,40);
  scene.add(new THREE.HemisphereLight(0xfff7ed,0xb1a99b,2.4));
  const key=new THREE.DirectionalLight(0xfff2e4,2.3);key.position.set(-3,6,5);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-3,right:3,top:4,bottom:-3});key.shadow.bias=-.0002;key.shadow.normalBias=.025;scene.add(key);
  const rim=new THREE.DirectionalLight(0xe7efff,1.25);rim.position.set(3,3,-3);scene.add(rim);
  const turntable=new THREE.Group();scene.add(turntable);
  const axis=new THREE.Group();axis.rotation.x=-Math.PI/2;turntable.add(axis);
  const mats=Object.fromEntries(Object.entries(data.palette).map(([k,v])=>[k,new THREE.MeshStandardMaterial({color:'#'+v,roughness:k==='gem'?.22:.7,metalness:k==='gold'?.5:0,side:THREE.DoubleSide})]));
  const nodes={};let triangles=0;
  for(const n of data.nodes){
    let o;
    if(n.positions){let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(n.positions,3));g.setIndex(n.indices);if(n.flat)g=g.toNonIndexed();g.computeVertexNormals();o=new THREE.Mesh(g,mats[n.slot]);o.castShadow=true;o.receiveShadow=true;triangles+=n.indices.length/3;}else o=new THREE.Group();
    o.name=n.name;o.position.fromArray(n.position);o.rotation.fromArray([...n.rotation,'XYZ']);o.scale.fromArray(n.scale);nodes[n.name]=o;
  }
  for(const n of data.nodes)(n.parent?nodes[n.parent]:axis).add(nodes[n.name]);
  const headRestScale=nodes.head.scale.clone();
  const plinth=new THREE.Mesh(new THREE.CylinderGeometry(1.19,1.25,.13,96),new THREE.MeshStandardMaterial({color:0xc4cdb9,roughness:.85}));plinth.position.y=-.09;plinth.receiveShadow=true;scene.add(plinth);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.17,.008,8,96),new THREE.MeshStandardMaterial({color:0xe9d39b,metalness:.5,roughness:.4}));ring.rotation.x=Math.PI/2;ring.position.y=-.018;scene.add(ring);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.12}));floor.rotation.x=-Math.PI/2;floor.position.y=-.16;floor.receiveShadow=true;scene.add(floor);
  let motion='idle',speed=1,time=0,walkBlend=0,yaw=-.20,pitch=.12,distance=6.4,auto=false;
  const target=new THREE.Vector3(0,1.34,0);
  function resize(){const {width,height}=$('viewport').getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe($('viewport'));resize();
  function selectMotion(value){motion=value;document.querySelectorAll('[data-motion]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.motion===value)));}
  document.querySelectorAll('[data-motion]').forEach(b=>b.onclick=()=>selectMotion(b.dataset.motion));
  $('speed').oninput=e=>{speed=Number(e.target.value);$('speed-value').value=speed.toFixed(1)+'×';};
  function color(slot,value){mats[slot].color.set(value);if(slot==='hair'){mats.hairLight.color.set(value).multiplyScalar(1.45);mats.hairDark.color.set(value).multiplyScalar(.62);}if(slot==='coat')mats.cape.color.set(value).multiplyScalar(.85);$(slot+'-color').value=value;}
  for(const slot of ['hair','coat','gold'])$(slot+'-color').oninput=e=>color(slot,e.target.value);
  const presets={classic:[...['hair','coat','gold'].map(slot=>'#'+data.palette[slot])],forest:['#3c2921','#47705a','#c8af72'],rose:['#e3c6a0','#824c68','#d8ba76']};
  for(const slot of ['hair','coat','gold'])$(slot+'-color').value='#'+data.palette[slot];
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>['hair','coat','gold'].forEach((s,i)=>color(s,presets[b.dataset.preset][i])));
  $('cape').onchange=e=>nodes.cape.visible=e.target.checked;
  $('crystal').onchange=e=>nodes.crystal.visible=e.target.checked;
  $('head-size').oninput=e=>{const v=Number(e.target.value);nodes.head.scale.copy(headRestScale).multiplyScalar(v);$('head-value').value=Math.round(v*100)+'%';};
  $('rotate').onchange=e=>auto=e.target.checked;
  $('wire').onchange=e=>Object.values(mats).forEach(m=>m.wireframe=e.target.checked);
  for(const [id,a] of [['front',0],['side',Math.PI/2],['back',Math.PI]])$(id).onclick=()=>{yaw=a;auto=false;$('rotate').checked=false;};
  $('reset').onclick=()=>{selectMotion('idle');time=0;speed=1;walkBlend=0;yaw=-.2;pitch=.12;distance=6.4;auto=false;$('speed').value=1;$('speed-value').value='1.0×';$('head-size').value=1;$('head-value').value='100%';nodes.head.scale.copy(headRestScale);['hair','coat','gold'].forEach((s,i)=>color(s,presets.classic[i]));for(const [slot,hex] of Object.entries(data.palette))mats[slot].color.set('#'+hex);for(const id of ['cape','crystal']){nodes[id].visible=true;$(id).checked=true;}for(const id of ['rotate','wire'])$(id).checked=false;Object.values(mats).forEach(m=>m.wireframe=false);};
  let drag=null;const canvas=$('viewport');
  canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!drag)return;yaw+=(e.clientX-drag.x)*.009;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-drag.y)*.005,-.2,.7);drag={x:e.clientX,y:e.clientY};};
  canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
  canvas.addEventListener('wheel',e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.004,4,9);},{passive:false});
  canvas.onkeydown=e=>{if(e.key==='ArrowLeft')yaw-=.15;else if(e.key==='ArrowRight')yaw+=.15;else if(e.key==='ArrowUp')distance=Math.max(4,distance-.2);else if(e.key==='ArrowDown')distance=Math.min(9,distance+.2);else return;e.preventDefault();};
  $('stats').textContent=`${data.generator} · ${data.nodes.length} 个节点 · ${triangles.toLocaleString()} 个三角面。动画：待机呼吸、眨眼、摆臂、抬腿与披风摆动。`;
  $('loading').hidden=true;
  let last=performance.now(),frame=0,fpsTime=last;
  function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;
    if(!document.hidden&&motion!=='pause'){
      time+=dt*speed;walkBlend=THREE.MathUtils.damp(walkBlend,motion==='walk'?1:0,8,dt);
      const phase=time*Math.PI*2*1.3,s=Math.sin(phase),b=walkBlend;
      nodes.root.position.z=.015*Math.sin(time*2)*(1-b)+.023*(1-Math.cos(phase*2))*b;
      nodes.body.rotation.y=.035*s*b;nodes.head.rotation.z=.035*Math.sin(time*1.4)*(1-b);
      for(const side of [-1,1]){const step=s*side;nodes['leg'+side].rotation.x=.48*step*b;nodes['shin'+side].rotation.x=-Math.max(0,-step)*.55*b;nodes['arm'+side].rotation.x=-.38*step*b+.025*Math.sin(time*2+side)*(1-b);nodes['forearm'+side].rotation.x=-.12-.1*Math.max(0,step)*b;}
      nodes.cape.rotation.x=.04+.07*Math.sin(phase-.5)*b;
      const blink=(time+1)%4.8;const open=blink<.14?Math.max(.08,Math.abs(blink-.07)/.07):1;nodes['eye-1'].scale.z=nodes.eye1.scale.z=open;
    }
    if(auto)yaw+=dt*.3;turntable.rotation.y=yaw;
    camera.position.set(0,target.y+Math.sin(pitch)*distance,Math.cos(pitch)*distance);camera.lookAt(target);
    renderer.render(scene,camera);
    frame++;if(now-fpsTime>1000){canvas.dataset.fps=String(Math.round(frame*1000/(now-fpsTime)));frame=0;fpsTime=now;}
    canvas.dataset.motion=motion;canvas.dataset.animationTime=time.toFixed(3);
  }
  requestAnimationFrame(animate);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('loading').hidden=false;$('loading').textContent='图形上下文已中断，请刷新页面重试。';});
}catch(error){$('loading').hidden=false;$('loading').textContent='角色加载失败：'+error.message+'。请检查网络及浏览器 WebGL 支持后刷新。';console.error(error);}
