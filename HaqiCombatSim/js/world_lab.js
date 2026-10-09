// Independent, local world lab. No adventure imports, state or external asset service.
const $=id=>document.getElementById(id);
$('retry').onclick=()=>location.reload();
try{
 const T=await import('https://cdn.keepwork.com/keepwork/cdn/vendor/three/three.module.js');
 $('progress').textContent='正在读取 Blender 海岛网格…';
 const response=await fetch('../experiments/world-lab/island.json',{cache:'no-cache'});
 if(!response.ok)throw new Error(`模型读取失败 (${response.status})`);
 const data=await response.json();
 const canvas=$('world'),renderer=new T.WebGLRenderer({canvas,antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
 const scene=new T.Scene();scene.background=new T.Color('#49adc4');scene.fog=new T.Fog('#49adc4',55,125);
 const camera=new T.PerspectiveCamera(39,1,.1,180);
 const hemi=new T.HemisphereLight(0xeafcff,0xa5ad74,1.8);scene.add(hemi);
 const sun=new T.DirectionalLight(0xfff0ce,2.7);sun.position.set(-12,20,8);sun.castShadow=true;
 Object.assign(sun.shadow.camera,{left:-15,right:15,top:13,bottom:-13,near:.5,far:65});sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.025;sun.shadow.bias=-.00015;scene.add(sun);
 const root=new T.Group();root.rotation.x=-Math.PI/2;scene.add(root);
 const mats=Object.fromEntries(Object.entries(data.palette).map(([k,v])=>[k,new T.MeshStandardMaterial({color:'#'+v,roughness:k==='water'?.3:.85,side:T.DoubleSide})]));
 const dynamic=[];let meshes=0;
 for(const b of data.batches){
  if(b.layer==='ocean')continue;
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.positions,3));g.setIndex(b.indices);g.computeVertexNormals();
  const m=new T.Mesh(g,mats[b.material]);m.castShadow=!['river','waterfall'].includes(b.layer);m.receiveShadow=true;m.userData.layer=b.layer;root.add(m);meshes++;
  if(['waterfall','flags','boat_a','boat_b'].includes(b.layer))dynamic.push({mesh:m,base:Float32Array.from(b.positions),layer:b.layer});
 }
 // Analytic waves and coastal foam; the island remains real Blender-authored geometry.
 const oceanMat=new T.ShaderMaterial({uniforms:{time:{value:0},warm:{value:0}},vertexShader:`
 uniform float time; varying vec3 wp;
 void main(){vec3 p=position;p.y+=.025*sin(p.x*.9+time)+.018*cos(p.z*1.2-time*.8);wp=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}
 `,fragmentShader:`
 uniform float time;uniform float warm;varying vec3 wp;
 void main(){
  vec2 p=wp.xz;float a=atan(-p.y/6.15,p.x/8.1);float coast=1.+.052*sin(a*5.+.8)+.03*cos(a*9.)+.018*sin(a*15.);
  float r=length(vec2(p.x/8.1,p.y/6.15))/coast;
  vec3 deep=mix(vec3(.005,.22,.43),vec3(.07,.22,.30),warm);vec3 shallow=mix(vec3(.012,.53,.59),vec3(.17,.39,.34),warm);
  vec3 c=mix(shallow,deep,smoothstep(1.,2.8,r));
  float wave=sin(p.x*1.6+sin(p.y*1.9)*.8+time*.7)+cos(p.y*1.8+sin(p.x*.85)-time*.5);
  float lines=smoothstep(1.88,1.98,wave);c+=lines*.095;
  float foam=1.-smoothstep(.016,.055,abs(r-(1.015+.009*sin(a*17.+time*1.4))));
  c=mix(c,vec3(.78,.98,.92),foam*.75);
  float sparkle=pow(max(0.,sin(p.x*6.1+time)*cos(p.y*5.7-time*.5)),26.);c+=sparkle*.10;
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`});
 const og=new T.PlaneGeometry(170,170,180,180);og.rotateX(-Math.PI/2);const ocean=new T.Mesh(og,oceanMat);ocean.position.y=-.04;scene.add(ocean);
 // Waterfall streaks are already separate Blender strips; their vertices move along the sheet.
 let time=0,motion=true,touring=false,labels=true,active='overview';
 const current={yaw:.30,pitch:.67,distance:36,target:new T.Vector3(0,1.15,0)};
 const desired={yaw:.30,pitch:.67,distance:36,target:new T.Vector3(0,1.15,0)};
 const poses={overview:{target:[0,1.15,0],distance:36,pitch:.67,yaw:.30},castle:{target:[-2.25,3.8,-1.2],distance:12,pitch:.38,yaw:.35},falls:{target:[3.05,1.8,-1.1],distance:11,pitch:.36,yaw:.65},village:{target:[3.6,1.1,1.8],distance:10,pitch:.53,yaw:.35},harbor:{target:[7.9,.6,2.5],distance:10,pitch:.47,yaw:.65}};
 function haltTour(){touring=false;$('tour').setAttribute('aria-pressed','false');$('tour').textContent='开始环岛巡游';}
 function view(id){haltTour();active=id;const p=poses[id];Object.assign(desired,{yaw:p.yaw,pitch:p.pitch,distance:p.distance});desired.target.fromArray(p.target);document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===id)));}
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));$('home').onclick=()=>view('overview');
 $('tour').onclick=()=>{touring=!touring;$('tour').setAttribute('aria-pressed',String(touring));$('tour').textContent=touring?'停止巡游':'开始环岛巡游';if(touring){desired.distance=32;desired.pitch=.57;desired.target.set(0,1.5,0);}};
 $('motion').onchange=e=>motion=e.target.checked;
 $('labels').onchange=e=>{labels=e.target.checked;$('landmarks').hidden=!labels;};
 $('wire').onchange=e=>Object.values(mats).forEach(m=>m.wireframe=e.target.checked);
 $('light').onchange=e=>{const sunset=e.target.value==='sunset';sun.color.set(sunset?0xffad69:0xfff0ce);sun.intensity=sunset?2.3:2.7;sun.position.set(sunset?-18:-12,sunset?9:20,8);hemi.intensity=sunset?1.4:1.8;oceanMat.uniforms.warm.value=sunset?1:0;scene.background.set(sunset?'#acb8ae':'#49adc4');scene.fog.color.copy(scene.background);};
 const marks=data.landmarks.map(l=>{const b=document.createElement('button');b.className='marker';b.textContent=l.name;b.setAttribute('aria-label','前往'+l.name);b.onclick=()=>view(l.id);$('landmarks').append(b);return{button:b,point:new T.Vector3(l.position[0],l.position[2]+.8,-l.position[1])};});
 let width=0,height=0;
 function resize(){width=innerWidth;height=innerHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
 addEventListener('resize',resize);resize();
 const pointers=new Map();let gesture=null;
 function snapshot(){const p=[...pointers.values()];return p.length===2?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}:null;}
 canvas.addEventListener('pointerdown',e=>{haltTour();canvas.focus();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);gesture=snapshot();});
 canvas.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const pinch=snapshot();
  if(pinch&&gesture){desired.distance=T.MathUtils.clamp(desired.distance*gesture.d/Math.max(1,pinch.d),5,48);gesture=pinch;return;}
  const dx=e.clientX-old.x,dy=e.clientY-old.y;
  if(e.shiftKey||e.buttons===2){const k=desired.distance*.0015;desired.target.x-=dx*k*Math.cos(desired.yaw)+dy*k*Math.sin(desired.yaw);desired.target.z+=dx*k*Math.sin(desired.yaw)-dy*k*Math.cos(desired.yaw);}else{desired.yaw-=dx*.006;desired.pitch=T.MathUtils.clamp(desired.pitch+dy*.004,.18,1.40);}
 });
 const end=e=>{pointers.delete(e.pointerId);gesture=snapshot();};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.oncontextmenu=e=>e.preventDefault();
 canvas.addEventListener('wheel',e=>{e.preventDefault();haltTour();desired.distance=T.MathUtils.clamp(desired.distance*Math.exp(e.deltaY*.001),5,48);},{passive:false});
 canvas.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(!['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d','home','+','-'].includes(k))return;e.preventDefault();haltTour();if(k==='home'){view('overview');return;}if(k==='arrowleft')desired.yaw-=.1;if(k==='arrowright')desired.yaw+=.1;if(k==='arrowup')desired.pitch=Math.min(1.4,desired.pitch+.08);if(k==='arrowdown')desired.pitch=Math.max(.18,desired.pitch-.08);if(k==='w')desired.target.z-=.35;if(k==='s')desired.target.z+=.35;if(k==='a')desired.target.x-=.35;if(k==='d')desired.target.x+=.35;if(k==='+')desired.distance=Math.max(5,desired.distance-1);if(k==='-')desired.distance=Math.min(48,desired.distance+1);});
 $('model-info').textContent=`${data.sourceObjects} 个 Blender 物件 / ${data.trees} 棵树 / ${data.triangles.toLocaleString()} 个三角面，合并为 ${meshes} 组静态及动态网格。海面为额外的程序着色器。`;
 $('loading').hidden=true;let last=performance.now(),fpsStart=last,frames=0;const projected=new T.Vector3();
 function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;if(document.hidden)return;if(motion)time+=dt;
  if(touring)desired.yaw+=dt*.13;
  const blend=1-Math.exp(-dt*5);for(const k of ['yaw','pitch','distance'])current[k]+=(desired[k]-current[k])*blend;current.target.lerp(desired.target,blend);
  const mobile=width<760;const d=current.distance*(mobile?Math.max(1.25,.92/camera.aspect):1);camera.position.set(current.target.x+Math.sin(current.yaw)*Math.cos(current.pitch)*d,current.target.y+Math.sin(current.pitch)*d,current.target.z+Math.cos(current.yaw)*Math.cos(current.pitch)*d);camera.lookAt(current.target);
  // Shift the optical centre to leave the right controls and mobile bottom controls clear.
  camera.setViewOffset(width,height,mobile?0:width*.075,mobile?height*.10:0,width,height);
  oceanMat.uniforms.time.value=time;
  for(const entry of dynamic){const {mesh:m,base,layer}=entry;if(layer.startsWith('boat')){m.position.z=Math.sin(time*1.3+(layer==='boat_a'?0:2))*.035;continue;}
   const a=m.geometry.attributes.position.array;
   for(let i=0;i<a.length;i+=3){if(layer==='flags'){a[i+1]=base[i+1]+Math.sin(time*3+base[i]*5)*.045;}else{a[i+1]=base[i+1]+Math.sin(base[i+2]*15+time*6)*.012;a[i]=base[i]+Math.sin(base[i+2]*9+time*4)*.009;}}
   m.geometry.attributes.position.needsUpdate=true;
  }
  for(const mark of marks){if(!labels)continue;projected.copy(mark.point).project(camera);const show=projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.96&&Math.abs(projected.y)<.9;mark.button.hidden=!show;mark.button.style.left=((projected.x*.5+.5)*width)+'px';mark.button.style.top=((-projected.y*.5+.5)*height)+'px';}
  renderer.render(scene,camera);frames++;
  if(now-fpsStart>1000){$('status').textContent=`${Math.round(frames*1000/(now-fpsStart))} 帧/秒 · ${renderer.info.render.calls} 次绘制`;frames=0;fpsStart=now;}
  canvas.dataset.ready='true';canvas.dataset.view=active;canvas.dataset.time=time.toFixed(2);
 }
 requestAnimationFrame(frame);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('loading').hidden=false;$('progress').textContent='图形上下文中断，请重新加载。';$('retry').hidden=false;});
}catch(error){$('loading').hidden=false;$('progress').textContent='加载失败：'+error.message;$('retry').hidden=false;console.error(error);}
