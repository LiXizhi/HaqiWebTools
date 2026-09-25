import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIRECTIONS, patchDirection, resolvePose } from '../demos/mount-lab/mount_core.js';
import { resolveMountDrawPose } from '../js/adventure_mounts_core.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const lab = read('../demos/mount-lab/catalog.json');
const game = read('../data/adventure/mount-catalog.json');

test('all mounts retain rider size across facings in both lab and game', () => {
  for (const mount of lab.mounts) {
    const runtime = game.mounts.find(row => row.id === mount.id);
    assert.ok(runtime, mount.id);
    for (const gender of ['male', 'female']) {
      const front = resolvePose(mount, 'down', {size: 78, gender});
      assert.ok(front.rider.w > 0 && front.rider.w <= 78);
      DIRECTIONS.forEach((direction, facing) => {
        const pose = resolvePose(mount, direction, {size: 78, gender});
        const actual = resolveMountDrawPose(runtime, facing, {size: 78, gender});
        assert.equal(pose.rider.w, front.rider.w, `${mount.id}/${gender}/${direction}`);
        const prefix = gender === 'female' ? 'female-' : '';
        const mb = mount.layoutBounds.mount[pose.mount.cell];
        const rb = mount.layoutBounds.riders[pose.rider.art][pose.rider.cell];
        const top = Math.min(pose.mount.y + mb[1] * pose.mount.h, pose.rider.y + rb[1] * pose.rider.h);
        const bottom = Math.max(pose.mount.y + mb[3] * pose.mount.h, pose.rider.y + rb[3] * pose.rider.h);
        const originalHeight = 78 * Math.max(...mount.layoutBounds.riders[prefix + 'standing'].map(b => b[3] - b[1]));
        assert.ok(bottom - top <= 2 * originalHeight + 1e-8);
        assert.deepEqual(actual.mount, pose.mount);
        assert.deepEqual(actual.rider, pose.rider);
        const anchor = mount.directions[direction].characters?.[gender]?.anchor ?? mount.directions[direction].anchor;
        assert.ok(Math.abs(pose.rider.y + anchor[1] * pose.rider.h - pose.seat[1]) < 1e-8);
      });
    }
  }
});

test('changing a facing ratio resizes only the mount and keeps the seat attached', () => {
  const mount = lab.mounts.find(m => m.id === 'original-16059');
  const next = patchDirection(lab, mount.id, 'left', {characters: {
    ...mount.directions.left.characters,
    male: {seat: [.45, .48], anchor: [.5, .96], scale: .5},
  }});
  const edited = next.mounts.find(m => m.id === mount.id);
  const before = resolvePose(mount, 'left', {size: 100});
  const after = resolvePose(edited, 'left', {size: 100});
  assert.equal(before.rider.w, after.rider.w);
  assert.notEqual(before.mount.w, after.mount.w);
  assert.ok(after.mount.w <= 200);
  assert.equal(after.rider.x + after.rider.w * .5, after.seat[0]);
  assert.equal(after.rider.y + after.rider.h * .96, after.seat[1]);
  assert.deepEqual(resolvePose(edited, 'left', {gender: 'female'}), resolvePose(mount, 'left', {gender: 'female'}));
  for (const d of ['down', 'right', 'up']) assert.deepEqual(resolvePose(edited, d), resolvePose(mount, d));
});

test('unmounted retains original character size; transformed thumbnails keep requested mount size', () => {
  for (const mount of lab.mounts) for (const direction of DIRECTIONS) {
    assert.equal(resolvePose(mount, direction, {size: 100, mode: 'unmounted'}).rider.w, 100);
    assert.ok(resolvePose(mount, direction, {size: 100, mode: 'mounted'}).rider.w <= 100);
    assert.ok(Math.abs(resolvePose(mount, direction, {size: 64, mode: 'transformed'}).mount.w - 64) < 1e-10);
  }
});

test('visible total height, not width or padding, limits all facings together', () => {
  const carpet = lab.mounts.find(m => m.id === 'original-16059');
  for (const gender of ['male', 'female']) for (const d of DIRECTIONS) {
    const pose = resolvePose(carpet, d, {size: 100, gender});
    assert.equal(pose.rider.w, 100, 'flat carpet must not shrink the rider');
  }
  const mount = structuredClone(carpet);
  const full = Array.from({length: 4}, () => [0, 0, 1, 1]);
  mount.layoutBounds = {mount: full, riders: Object.fromEntries(['standing', 'rider', 'female-standing', 'female-rider'].map(k => [k, full]))};
  for (const d of DIRECTIONS) Object.assign(mount.directions[d], {scale: 1, seat: [.5, 0], anchor: [.5, 1], characters: {}});
  // Character sits above the mount: total is exactly 2 x original height.
  for (const d of DIRECTIONS) assert.equal(resolvePose(mount, d, {size: 100}).rider.w, 100);
  mount.directions.up.characters = {male: {scale: .5}, female: {scale: .25}};
  for (const [gender, expected] of [['male', 100 * 2 / 3], ['female', 40]]) {
    for (const d of DIRECTIONS) {
      const pose = resolvePose(mount, d, {size: 100, gender, time: 1, moving: true});
      assert.ok(Math.abs(pose.rider.w - expected) < 1e-8);
      const height = Math.max(pose.mount.y + pose.mount.h, pose.rider.y + pose.rider.h) - Math.min(pose.mount.y, pose.rider.y);
      assert.ok(height <= 200 + 1e-8);
    }
  }
});
