import {mountLayout} from '../../js/mount_layout_core.js';
// Pure 2D layout. Coordinates are fractions of a cell, not 3D attachment points.
export const DIRECTIONS = ['down', 'left', 'right', 'up'];
export const MODES = ['mounted', 'unmounted', 'transformed'];

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} 必须是有限数值`);
}
export function validateCatalog(catalog) {
  if (catalog.version !== 1 || !catalog.mounts?.length) throw new Error('坐骑配置版本或列表无效');
  const ids = new Set();
  for (const mount of catalog.mounts) {
    if (!mount.id || ids.has(mount.id)) throw new Error('坐骑编号重复或缺失');
    ids.add(mount.id);
    for (const key of ['ground', 'lift', 'bob']) finite(mount[key], key);
    for (const direction of DIRECTIONS) {
      const pose = mount.directions?.[direction];
      if (!pose) throw new Error(`${mount.id} 缺少 ${direction}`);
      for (const key of ['seat', 'anchor']) {
        if (!Array.isArray(pose[key]) || pose[key].length !== 2) throw new Error(`${key} 需要二维坐标`);
        pose[key].forEach(value => finite(value, key));
      }
      finite(pose.scale, 'scale');
      if (pose.scale <= 0 || pose.scale > 2) throw new Error('角色缩放超出范围');
      for (const key of ['cell', 'riderCell']) {
        if (!Number.isInteger(pose[key]) || pose[key] < 0 || pose[key] > 3) throw new Error('图集格号无效');
      }
      if (!['rider', 'standing'].includes(pose.riderArt)) throw new Error('角色姿态无效');
      for (const polygon of pose.foreground) {
        if (polygon.length < 3) throw new Error('遮挡区域至少需要三个点');
        for (const point of polygon) {
          if (point.length !== 2 || point.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('遮挡坐标无效');
        }
      }
    }
  }
  return catalog;
}

export function resolvePose(mount, direction, {size = 100, mode = 'mounted', time = 0, moving = false, gender = 'male'} = {}) {
  if (!DIRECTIONS.includes(direction) || !MODES.includes(mode)) throw new Error('朝向或模式无效');
  finite(size, 'size');
  if (size <= 0) throw new Error('尺寸必须大于零');
  if (!['male','female'].includes(gender)) throw new Error('角色类型无效');
  const source = mount.directions[direction];
  const p = {...source, ...source.characters?.[gender]};
  const bob = Math.sin(time * (moving ? 9 : 2)) * (moving ? mount.bob : mount.bob * .25);
  const layout = mountLayout(mount, p, mode === 'transformed' ? size * p.scale : size, bob, {gender, limitSize: mode === 'mounted'});
  if (mode === 'unmounted') {
    layout.seat = [0, 0];
    layout.rider = {x: -size * .5, y: -size * .96, w: size, h: size};
  }
  const rider = {art: (gender === 'female' ? 'female-' : '') + (mode === 'unmounted' ? 'standing' : p.riderArt),
    cell: mode === 'unmounted' ? DIRECTIONS.indexOf(direction) : p.riderCell, ...layout.rider};
  return {mount: {art: mount.id, cell: p.cell, ...layout.mount}, rider, seat: layout.seat,
    foreground: p.foreground, showMount: mode !== 'unmounted', showRider: mode !== 'transformed'};
}

export function patchDirection(catalog, id, direction, patch) {
  const result = structuredClone(catalog);
  const mount = result.mounts.find(m => m.id === id);
  if (!mount || !DIRECTIONS.includes(direction)) throw new Error('找不到坐骑或方向');
  Object.assign(mount.directions[direction], patch);
  return validateCatalog(result);
}
