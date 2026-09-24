import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveMountPose, riderPlacement, updateSeat } from '../js/mount_pose_core.js';

const catalog = JSON.parse(readFileSync(new URL('../data/mount-demo/mounts.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(catalog.mounts.map(mount => [mount.id, mount]));

test('four facings place the rider and mirror the right seat', () => {
    const dragon = byId.dragon;
    const down = resolveMountPose(dragon, 0);
    const left = resolveMountPose(dragon, 1);
    const right = resolveMountPose(dragon, 2);
    const up = resolveMountPose(dragon, 3);
    assert.equal(down.frame, 0);
    assert.equal(left.frame, 1);
    assert.equal(up.frame, 2);
    assert.equal(right.frame, 1);
    assert.equal(right.flip, true);
    assert.equal(right.seat.x, -left.seat.x);
    assert.equal(right.seat.y, left.seat.y);
    assert.equal(down.seat.x, 0);
    assert.ok(down.front);
    assert.equal(left.back.x, -dragon.size.w / 2);
    assert.equal(left.back.y, -dragon.size.h);
});

test('a mount without a front layer leaves that layer empty', () => {
    const pose = resolveMountPose(byId.carpet, 1);
    assert.equal(pose.front, null);
    assert.equal(pose.back.sheet, 'carpet.webp');
    assert.equal(pose.bob, 8);
});

test('every demo mount resolves and crops the rider from the top', () => {
    for (const mount of catalog.mounts) {
        for (const facing of [0, 1, 2, 3]) {
            const pose = resolveMountPose(mount, facing);
            const place = riderPlacement(pose, catalog.rider);
            assert.ok(place.h <= place.spriteH);
            assert.equal(place.y, pose.seat.y - place.h);
            assert.equal(place.spriteY, pose.seat.y - place.spriteH);
        }
    }
});

test('editing the right facing writes the left seat', () => {
    const next = updateSeat(byId.car, 2, { x: 12, crop: 0.4 });
    assert.equal(next.seats.left.x, 12);
    assert.equal(next.seats.left.crop, 0.4);
    assert.equal(resolveMountPose(next, 2).seat.x, -12);
    assert.throws(() => resolveMountPose({ id: 'bad', size: { w: 1, h: 1 }, seats: { left: { x: 0, y: 0, riderScale: 1, crop: 2 } } }, 1));
});
