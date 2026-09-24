// 2D mount attachment. Facing matches the adventure hero: 0 down, 1 left, 2 right, 3 up.
// Right reuses the left frame and mirrors seat x. This module only resolves a pose.

export const FACING_NAMES = ['down', 'left', 'right', 'up'];
const SOURCE_FRAME = { down: 0, left: 1, up: 2 };

export function normalizeFacing(facing) {
    const n = Number(facing);
    if (!Number.isInteger(n)) throw new TypeError('朝向必须是 0 到 3 的整数');
    return (n % 4 + 4) % 4;
}

export function sourceFacingName(facing) {
    const name = FACING_NAMES[normalizeFacing(facing)];
    return name === 'right' ? 'left' : name;
}

function layer(sheet, frame, flip, w, h) {
    if (!sheet) return null;
    return { sheet, frame, flip, x: -w / 2, y: -h, w, h };
}

export function resolveMountPose(mount, facing) {
    const index = normalizeFacing(facing);
    const name = FACING_NAMES[index];
    const source = sourceFacingName(index);
    const seat = mount.seats?.[source];
    if (!seat) throw new Error(`坐骑 ${mount.id || ''} 缺少 ${source} 鞍位`);
    const riderScale = Number(seat.riderScale);
    const crop = Number(seat.crop);
    if (!(riderScale > 0) || !(crop > 0 && crop <= 1)) throw new Error(`坐骑 ${mount.id || ''} 的 ${source} 鞍位无效`);
    const frame = SOURCE_FRAME[source];
    const flip = name === 'right';
    const { w, h } = mount.size;
    const x = Number(seat.x);
    return {
        facing: index,
        name,
        source,
        flip,
        frame,
        bob: Number(mount.bob) || 0,
        back: layer(mount.art?.back, frame, flip, w, h),
        front: layer(mount.art?.front || null, frame, flip, w, h),
        seat: { x: flip ? -x : x, y: Number(seat.y), riderScale, crop },
    };
}

export function riderPlacement(pose, rider) {
    const w = rider.frameWidth * pose.seat.riderScale;
    const h = rider.frameHeight * pose.seat.riderScale;
    const visible = h * pose.seat.crop;
    return {
        frame: pose.frame,
        flip: pose.flip,
        x: pose.seat.x - w / 2,
        y: pose.seat.y - visible,
        w,
        h: visible,
        spriteX: pose.seat.x - w / 2,
        spriteY: pose.seat.y - h,
        spriteW: w,
        spriteH: h,
    };
}

export function updateSeat(mount, facing, patch) {
    const source = sourceFacingName(facing);
    const current = mount.seats?.[source];
    if (!current) throw new Error(`坐骑 ${mount.id || ''} 缺少 ${source} 鞍位`);
    return { ...mount, seats: { ...mount.seats, [source]: { ...current, ...patch } } };
}
