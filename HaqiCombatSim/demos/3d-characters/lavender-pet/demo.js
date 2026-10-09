import * as THREE from 'https://cdn.keepwork.com/keepwork/cdn/vendor/three/three.module.js';
import {createLavenderPetModel} from './model.js';

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, .1, 40);
const model = createLavenderPetModel();
model.position.y = -.04;
scene.add(model);
scene.add(new THREE.HemisphereLight('#fff7ff', '#b6a1c4', 2.2));
const key = new THREE.DirectionalLight('#fff6ef', 2.6);
key.position.set(-3, 6, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, {left: -3, right: 3, top: 4, bottom: -3, near: .5, far: 20});
key.shadow.normalBias = .025;
key.shadow.bias = -.0001;
scene.add(key);
const fill = new THREE.DirectionalLight('#d3caff', 1.2);
fill.position.set(3, 3, -2);
scene.add(fill);
const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.53, 1.56, .1, 96), new THREE.MeshStandardMaterial({color: '#e9e1f0', roughness: .8}));
platform.position.y = -.03;
platform.receiveShadow = true;
scene.add(platform);
const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, .009, 8, 96), new THREE.MeshStandardMaterial({color: '#fffaff', roughness: .75}));
rim.rotation.x = Math.PI / 2;
rim.position.y = .023;
scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({color: '#887494', opacity: .13}));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.086;
floor.receiveShadow = true;
scene.add(floor);

let yaw = 0, pitch = .08, distance = 6.8;
const target = new THREE.Vector3(0, 1.22, 0);
let selected = null, autoRotate = false, pointer = null;
const raycaster = new THREE.Raycaster();
const runtime = model.userData.sculptRuntime;
const viewButtons = [...document.querySelectorAll('[data-view]')];
function updateCamera() {
  camera.position.set(target.x + distance * Math.sin(yaw) * Math.cos(pitch), target.y + distance * Math.sin(pitch), target.z + distance * Math.cos(yaw) * Math.cos(pitch));
  camera.lookAt(target);
}
function freeView() {
  viewButtons.forEach(button => button.classList.remove('active'));
  document.querySelector('#view-name').textContent = '自由视角 · 观察模式';
}
function setView(view) {
  yaw = {front: 0, side: Math.PI / 2, back: Math.PI, left: -Math.PI / 2}[view] ?? 0;
  pitch = .08;
  viewButtons.forEach(button => button.classList.toggle('active', button.dataset.view === view));
  document.querySelector('#view-name').textContent = `${{front:'正面',side:'侧面',back:'背面',left:'左侧'}[view]} · 观察模式`;
  updateCamera();
}
function selectPart(group) {
  selected = group;
  document.querySelector('#selection').textContent = group ? runtime.labels.get(group.name) : '点击模型，认识它的每个部件。';
}
viewButtons.forEach(button => button.addEventListener('click', () => {
  autoRotate = false;
  document.querySelector('#rotate').checked = false;
  setView(button.dataset.view);
}));
document.querySelector('#rotate').addEventListener('change', event => {
  autoRotate = event.target.checked;
  if (autoRotate) freeView();
});
function setWireframe(enabled) {model.traverse(object => {if (object.isMesh) object.material.wireframe = enabled;});}
document.querySelector('#wireframe').addEventListener('change', event => setWireframe(event.target.checked));
document.querySelector('#explode').addEventListener('input', event => {
  const amount = Number(event.target.value) / 100;
  runtime.setExplode(amount);
  distance = 6.8 + amount * 1.6;
  updateCamera();
  document.querySelector('#explode-value').textContent = `${event.target.value}%`;
});
document.querySelector('#reset').addEventListener('click', () => {
  autoRotate = false;
  distance = 6.8;
  document.querySelector('#rotate').checked = false;
  document.querySelector('#wireframe').checked = false;
  document.querySelector('#explode').value = 0;
  document.querySelector('#explode-value').textContent = '0%';
  runtime.setExplode(0);
  setWireframe(false);
  selectPart(null);
  setView('front');
});
canvas.addEventListener('pointerdown', event => {
  if (pointer || (event.pointerType === 'mouse' && event.button !== 0)) return;
  canvas.setPointerCapture(event.pointerId);
  pointer = {id: event.pointerId, x:event.clientX, y:event.clientY, travel:0};
  autoRotate = false;
  document.querySelector('#rotate').checked = false;
});
canvas.addEventListener('pointermove', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
  pointer.travel += Math.abs(dx) + Math.abs(dy);
  yaw -= dx * .008;
  pitch = THREE.MathUtils.clamp(pitch + dy * .006, -.3, 1.1);
  pointer.x = event.clientX; pointer.y = event.clientY;
  freeView(); updateCamera();
});
canvas.addEventListener('pointerup', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (pointer.travel < 6) {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const hit = raycaster.intersectObject(model, true)[0];
    let group = hit?.object;
    while (group && !group.userData.partId) group = group.parent;
    selectPart(group ?? null);
  }
  pointer = null;
  canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener('lostpointercapture', () => {pointer = null;});
canvas.addEventListener('pointercancel', () => {pointer = null;});
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  distance = THREE.MathUtils.clamp(distance * Math.exp(event.deltaY * .001), 4.8, 10);
  updateCamera();
}, {passive:false});
canvas.addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'ArrowLeft') yaw -= .1;
  if (event.key === 'ArrowRight') yaw += .1;
  if (event.key === 'ArrowUp') pitch = Math.min(1.1, pitch + .08);
  if (event.key === 'ArrowDown') pitch = Math.max(-.3, pitch - .08);
  if (['+','='].includes(event.key)) distance = Math.max(4.8, distance - .3);
  if (event.key === '-') distance = Math.min(10, distance + .3);
  freeView(); updateCamera();
});
const observer = new ResizeObserver(() => {
  const {width, height} = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateCamera();
});
observer.observe(canvas.parentElement);
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  renderer.setAnimationLoop(null);
  document.querySelector('#loading').hidden = false;
  document.querySelector('#loading').textContent = '三维画面暂时中断，请刷新重试。';
});
updateCamera();
let lastTime = 0;
renderer.setAnimationLoop(time => {
  const dt = Math.min((time - lastTime) / 1000, .05);
  lastTime = time;
  if (document.hidden) return;
  if (autoRotate) {yaw += dt * .35; updateCamera();}
  renderer.render(scene, camera);
});
renderer.render(scene, camera);
let triangles = 0;
model.traverse(object => {if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;});
document.querySelector('#stats').textContent = `${runtime.parts.length} 个部件 · ${(triangles / 1000).toFixed(1)}k 三角面 · Three.js`;
document.querySelector('#loading').hidden = true;
window.__IMG2THREEJS_READY__ = true;
// Explicit deterministic capture API for this isolated demo, not game runtime.
window.__PET_DEMO__ = {model, scene, camera, renderer, setView, get selected() {return selected?.name ?? null;}, stats: {triangles, parts: runtime.parts.length}};
window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null);
});
window.addEventListener('pageshow', event => {if (event.persisted) location.reload();});
