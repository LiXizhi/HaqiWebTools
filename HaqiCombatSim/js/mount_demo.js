import { FACING_NAMES, resolveMountPose, riderPlacement, updateSeat, sourceFacingName } from './mount_pose_core.js';

const ASSET = 'assets/mount-demo/';
const canvas = document.querySelector('#stage');
const ctx = canvas.getContext('2d');
const mountSelect = document.querySelector('#mount');
const facingBar = document.querySelector('#facing');
const seatForm = document.querySelector('#seat');
const poseOut = document.querySelector('#pose');
const showSeat = document.querySelector('#show-seat');
const status = document.querySelector('#status');

const keys = new Set();
let catalog = null;
let mount = null;
let facing = 0;
let moving = false;
let images = new Map();

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(src));
        img.src = src;
    });
}

function sheetOf(name) {
    return name ? images.get(name) : null;
}

function drawSheet(img, layer, bobY) {
    if (!img || !layer) return;
    const sw = img.width / 3;
    const sh = img.height;
    ctx.save();
    ctx.translate(layer.x + layer.w / 2, bobY + layer.y + layer.h / 2);
    if (layer.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, layer.frame * sw, 0, sw, sh, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
    ctx.restore();
}

function drawRider(pose, bobY) {
    const img = sheetOf(catalog.rider.sheet);
    if (!img) return;
    const place = riderPlacement(pose, catalog.rider);
    const sw = img.width / 3;
    const sh = img.height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(place.x, bobY + place.y, place.w, place.h);
    ctx.clip();
    ctx.translate(place.spriteX + place.spriteW / 2, bobY + place.spriteY + place.spriteH / 2);
    if (place.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, place.frame * sw, 0, sw, sh, -place.spriteW / 2, -place.spriteH / 2, place.spriteW, place.spriteH);
    ctx.restore();
}

function render(time) {
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#d7ecdf';
    ctx.fillRect(0, 0, w, h);
    const pose = resolveMountPose(mount, facing);
    const bob = moving ? Math.sin(time / 1000 * 10) * pose.bob : Math.sin(time / 1000 * 2) * pose.bob * 0.25;
    const cx = w / 2;
    const cy = h * 0.72;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#173d4140';
    ctx.beginPath();
    ctx.ellipse(0, 0, mount.size.w * 0.28, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSheet(sheetOf(pose.back?.sheet), pose.back, bob);
    drawRider(pose, bob);
    drawSheet(sheetOf(pose.front?.sheet), pose.front, bob);
    if (showSeat.checked) {
        ctx.fillStyle = '#e23b3b';
        ctx.beginPath();
        ctx.arc(pose.seat.x, bob + pose.seat.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    requestAnimationFrame(render);
}

function readSeat() {
    const data = new FormData(seatForm);
    return {
        x: Number(data.get('x')),
        y: Number(data.get('y')),
        riderScale: Number(data.get('riderScale')),
        crop: Number(data.get('crop')),
    };
}

function fillSeatForm() {
    const source = sourceFacingName(facing);
    const seat = mount.seats[source];
    seatForm.elements.x.value = seat.x;
    seatForm.elements.y.value = seat.y;
    seatForm.elements.riderScale.value = seat.riderScale;
    seatForm.elements.crop.value = seat.crop;
    seatForm.querySelector('legend').textContent = facing === 2 ? '鞍位（正在改朝左，朝右自动镜像）' : `鞍位（${FACING_NAMES[facing]}）`;
    const pose = resolveMountPose(mount, facing);
    poseOut.textContent = JSON.stringify({
        id: mount.id,
        facing: pose.name,
        source: pose.source,
        flip: pose.flip,
        seat: pose.seat,
        front: pose.front ? pose.front.sheet : null,
        bob: pose.bob,
    }, null, 2);
}

function selectMount(id) {
    mount = catalog.mounts.find(item => item.id === id);
    fillSeatForm();
}

facingBar.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    facing = Number(button.dataset.facing);
    fillSeatForm();
});

seatForm.addEventListener('input', () => {
    mount = updateSeat(mount, facing, readSeat());
    const index = catalog.mounts.findIndex(item => item.id === mount.id);
    catalog.mounts[index] = mount;
    fillSeatForm();
});

document.addEventListener('keydown', event => {
    const map = { ArrowDown: 0, ArrowLeft: 1, ArrowRight: 2, ArrowUp: 3 };
    if (map[event.key] === undefined) return;
    event.preventDefault();
    keys.add(event.key);
    facing = map[event.key];
    moving = true;
    fillSeatForm();
});

document.addEventListener('keyup', event => {
    keys.delete(event.key);
    moving = keys.size > 0;
});

const data = await fetch('data/mount-demo/mounts.json').then(response => response.json());
catalog = data;
const names = new Set([data.rider.sheet]);
for (const item of data.mounts) {
    names.add(item.art.back);
    if (item.art.front) names.add(item.art.front);
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    mountSelect.append(option);
}
await Promise.all([...names].map(async name => images.set(name, await loadImage(ASSET + name))));
mountSelect.addEventListener('change', () => selectMount(mountSelect.value));
selectMount(data.mounts[0].id);
status.textContent = '方向键切换朝向并走动。改数字会立刻重画，只影响这一页。';
requestAnimationFrame(render);
