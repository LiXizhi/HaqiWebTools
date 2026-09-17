import { actorPose } from './actor_animation_core.js';
export function drawAnimatedActor(ctx,at,action,progress,direction,reduced,draw) {
    const pose=actorPose(action,progress,direction,reduced);
    ctx.save();
    try {
        ctx.translate(at.x+pose.x,at.y+pose.y);ctx.rotate(pose.rotation);ctx.scale(pose.sx,pose.sy);
        ctx.globalAlpha*=pose.alpha;ctx.filter=`brightness(${pose.brightness})`;
        draw();
    } finally {ctx.restore();}
}
