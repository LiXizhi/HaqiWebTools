import { cityEntranceAppearance } from '../../adventure_city_dungeons_core.js';
import { regionAt } from '../../adventure_island_layout_core.js';
import { npcHasActiveQuest } from '../../adventure_npc_core.js';
import { socialGesturePose } from '../../adventure_social_actions_core.js';
import { socialBubble, localSocialBubbles } from '../../adventure_social_motion_core.js';
import { drawIslandWeather, stepWeatherFade } from '../../adventure_weather.js';
import { tr } from '../../locale_runtime.js';
import { openingGuideAnchor } from '../../opening_journey_core.js';
import { createDungeonFog } from '../../views/adventure/view_adventure_dungeon_fog.js';
import { drawPetSocialEffects } from '../../views/adventure/view_adventure_pet_social.js';
import { drawRewardEffect } from '../../views/adventure/view_adventure_rewards.js';
import { drawTeleportEffect } from '../../views/adventure/view_adventure_teleport.js';
import { drawGatheringProgress } from '../../views/adventure/view_gathering_progress.js';
import { TAU, PLATE, plate, drawSpeechBubble } from './primitives.js';

export function createOverlayPass({ assets, ctx, cam, reducedMotion, interactionFeedback, earthEnvironment, frameMeter }) {
    const dungeonFog = createDungeonFog();
    let vignetteCanvas = null;
    let vignetteW = 0;
    let vignetteH = 0;
    let weatherFade = null;

    function drawWorldOverlays({ world, save, time, frame, options, actorResult, starAnchor }) {
        const { w, h, t, gestureAt, markerFor } = frame;
        const {
            localSecond = null,
            socialGesture = null,
            petScene = null,
            socialActors = [],
            inParty = false,
            title = false,
            rewardEffect = null,
            teleportEffect = null,
            motionHidden = false,
            hideLocalActors = false,
            companionBubble = null,
            learningGreeting = null,
        } = options;
        const { objects, visualSave, companion } = actorResult;

        let bubbleTarget = null;
        let greetingTarget = null;

        if (!title && companion && openingGuideAnchor(save, world.npcs.find(n => n.id === 36201))) {
            plate(ctx, '去看看那只小家伙', companion.position.x, companion.position.y - 72, PLATE.place);
        }
        if (petScene && !title) {
            drawPetSocialEffects(
                ctx,
                assets,
                objects
                    .filter(o => o.kind === 'pet-social' && o.x >= cam.x - 80 && o.x <= cam.x + w / cam.scale + 80 && o.y >= cam.y && o.y <= cam.y + h / cam.scale + 80)
                    .map(o => o.row),
                petScene.effects,
                time,
                reducedMotion.matches,
                petScene.now,
            );
        }
        if (petScene?.food && !title && !hideLocalActors) {
            const f = petScene.food;
            ctx.fillStyle = '#b58a55';
            ctx.beginPath();
            ctx.ellipse(f.x, f.y, 16, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#efcc80';
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.arc(f.x - 8 + i * 4, f.y - 2 - (i % 2) * 3, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        if (learningGreeting && !title) {
            const g = learningGreeting;
            const at = g.npc;
            const maxWidth = Math.min(260, (w - 24) / cam.scale);
            const lines = [];
            ctx.font = '600 14px "Microsoft YaHei", sans-serif';
            for (const value of [g.text, g.translation].filter(Boolean)) {
                let line = '';
                for (const ch of value) {
                    if (ctx.measureText(line + ch).width > maxWidth - 24 && line) {
                        lines.push(line);
                        line = '';
                    }
                    line += ch;
                }
                if (line) lines.push(line);
            }
            const height = lines.length * 21 + 20;
            const left = Math.max(cam.x + 12 / cam.scale, Math.min(at.x - maxWidth / 2, cam.x + w / cam.scale - maxWidth - 12 / cam.scale));
            const top = Math.max(cam.y + 12 / cam.scale, at.y - 125 - height);
            greetingTarget = { x: left, y: top, w: maxWidth, h: height };
            ctx.fillStyle = '#fffbe9';
            ctx.strokeStyle = '#7a6335';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(left, top, maxWidth, height, 10);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#493a23';
            ctx.textAlign = 'left';
            lines.forEach((line, i) => ctx.fillText(line, left + 12, top + 23 + i * 21));
            const head = starAnchor(visualSave, t, false);
            drawSpeechBubble(ctx, { x: head.x, y: head.y + 50 }, t, true);
        }
        const partnerBubbles = localSecond
            ? localSocialBubbles(socialActors, [save.position, localSecond.position], { gesture: socialGesture, at: gestureAt })
            : [socialBubble(socialActors, save.position, { gesture: socialGesture, at: gestureAt, inParty: inParty || !!save.coopRun })].filter(Boolean);
        const nearbyPartnerBubble = partnerBubbles[0];
        if (!title && !motionHidden) {
            for (const b of partnerBubbles) {
                ctx.save();
                ctx.fillStyle = '#fffbe9';
                ctx.strokeStyle = '#7a6335';
                ctx.lineWidth = 1.5;
                ctx.shadowColor = '#173b3655';
                ctx.shadowBlur = 4;
                ctx.beginPath();
                ctx.roundRect(b.x, b.y, b.w, b.h, 10);
                ctx.fill();
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.moveTo(b.x + 15, b.y + b.h - 1);
                ctx.lineTo(b.x + 20, b.y + b.h + 6);
                ctx.lineTo(b.x + 25, b.y + b.h - 1);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#7a6335';
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(b.x + 12 + i * 8, b.y + 15, 2, 0, TAU);
                    ctx.fill();
                }
                ctx.restore();
            }
        }
        // Resolve the invited resident, never the player's follower, including duplicate NPC instances.
        const invitedNpc = companionBubble && world.npcs.find(n => !n.hidden && (companionBubble.instanceId ? n.instanceId === companionBubble.instanceId : String(n.id) === String(companionBubble.npcId)));
        if (
            invitedNpc
            && !title
            && !motionHidden
            && !nearbyPartnerBubble
            && !socialGesturePose(socialGesture, 'hero', gestureAt)
            && !markerFor(invitedNpc.id)
            && !npcHasActiveQuest(save, assets.content, invitedNpc.id)
        ) {
            const height = [36211, 30112].includes(invitedNpc.id) ? 104 : 86;
            bubbleTarget = drawSpeechBubble(ctx, { x: invitedNpc.x, y: invitedNpc.y - height + 56 }, t, reducedMotion.matches);
        }
        if (!world.portal.hidden) plate(ctx, world.portal.name, world.portal.x, world.portal.y + 48);
        if (world.entrancePortal) plate(ctx, world.entrancePortal.name, world.entrancePortal.x, world.entrancePortal.y + 48);
        if (!title && rewardEffect?.level) drawRewardEffect(ctx, save.position.x, save.position.y, rewardEffect, reducedMotion.matches);
        if (!title) drawTeleportEffect(ctx, teleportEffect, time, reducedMotion.matches);
        dungeonFog(ctx, world, save.position, { x: cam.x, y: cam.y, w: w / cam.scale, h: h / cam.scale }, cam.scale, save.dungeonExploration?.[world.zone]);

        return { bubbleTarget, greetingTarget };
    }

    function drawScreenOverlays({ world, save, time, frame, options }) {
        const { w, h, mark } = frame;
        const {
            graphics = { particles: true, trails: true },
            socialActors = [],
            title = false,
            weatherOverride = null,
            weatherTime = time,
            motionHidden = false,
        } = options;

        earthEnvironment.tint(ctx, w, h);
        earthEnvironment.nightLights(ctx, world, cam, w, h, { enabled: !graphics.low });
        earthEnvironment.weather(ctx, cam, w, h, weatherTime, { enabled: graphics.particles, reducedMotion: reducedMotion.matches, low: graphics.low });
        const liveWeather = graphics.particles ? (weatherOverride || world.layout && regionAt(world, save.position)?.weather || null) : null;
        if (!graphics.particles) weatherFade = null;
        weatherFade = stepWeatherFade(weatherFade, liveWeather, weatherTime, !!weatherOverride);
        const paintWeather = (weather, opacity) =>
            weather && opacity > 0.01 && drawIslandWeather(ctx, world, save.position, weatherTime / 1000, w, h, reducedMotion.matches, assets.environmentArt, weather, cam, opacity);
        paintWeather(weatherFade.previous, weatherFade.previousWeight);
        paintWeather(weatherFade.weather, weatherFade.weight);
        if (!vignetteCanvas || vignetteW !== w || vignetteH !== h) {
            vignetteW = w;
            vignetteH = h;
            vignetteCanvas = document.createElement('canvas');
            vignetteCanvas.width = Math.max(1, w);
            vignetteCanvas.height = Math.max(1, h);
            const g = vignetteCanvas.getContext('2d');
            const vignette = g.createRadialGradient(w * 0.5, h * 0.5, h * 0.15, w * 0.5, h * 0.5, Math.max(w, h) * 0.68);
            vignette.addColorStop(0, 'transparent');
            vignette.addColorStop(1, '#113b4b66');
            g.fillStyle = vignette;
            g.fillRect(0, 0, w, h);
        }
        ctx.drawImage(vignetteCanvas, 0, 0, w, h);
        if (!title) interactionFeedback.floating.draw(ctx, time, { reduced: reducedMotion.matches });
        mark('earth-render-overlay');

        if (world.isEarth && !title) {
            const seen = new Set();
            const placed = [];
            const actors = [save.position, ...socialActors.map(a => a.position), ...world.npcs.filter(n => !n.hidden)].map(p => ({
                x: (p.x - cam.x) * cam.scale,
                y: (p.y - cam.y) * cam.scale,
            }));
            ctx.save();
            ctx.font = '600 12px "PingFang SC", sans-serif';
            const landmarks = (world.landmarks || []).filter(p => !p.hidden);
            const cities = (world.mapCities || []).filter(city =>
                !landmarks.some(p => p.id === `city:${city.id}` || p.cityFallback?.id === city.id || p.id === `city:${world.city?.id}:entrance` && city.name === world.city?.name));
            for (const place of [...landmarks, ...cities]) {
                const key = `${place.name}:${Math.round(place.x)}:${Math.round(place.y)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const x = (place.x - cam.x) * cam.scale;
                const y = (place.y - cam.y) * cam.scale;
                if (x < 12 || x > w - 12 || y < 20 || y > h - 20) continue;
                const width = ctx.measureText(tr(place.name)).width + 20;
                const left = Math.max(width / 2 + 8, Math.min(w - width / 2 - 8, x));
                for (const offset of [-28, 32, -100, 64]) {
                    const top = y + offset;
                    const box = { x: left - width / 2, y: top - 14, w: width, h: 23 };
                    if (
                        box.y < 8
                        || box.y + box.h > h - 8
                        || placed.some(b => box.x < b.x + b.w + 6 && box.x + box.w + 6 > b.x && box.y < b.y + b.h + 6 && box.y + box.h + 6 > b.y)
                        || actors.some(a => box.x < a.x + 30 && box.x + box.w > a.x - 30 && box.y < a.y + 24 && box.y + box.h > a.y - 90 * cam.scale)
                    ) {
                        continue;
                    }
                    const style = place.cityDungeon ? { ...PLATE.place, text: cityEntranceAppearance(place.cityLevel, place.cityNodeEntrance).color } : PLATE.place;
                    plate(ctx, place.name, left, top, style);
                    placed.push(box);
                    break;
                }
            }
            ctx.restore();
        }
        if (!title && !motionHidden && world.memoryGathering) {
            const n = world.memoryGathering;
            drawGatheringProgress(ctx, { x: (n.x - cam.x) * cam.scale, y: (n.y - cam.y) * cam.scale }, n.progress, '文字记忆');
        }
        const meter = frameMeter.sample(time, !title && !motionHidden);
        if (!title && !motionHidden) {
            ctx.save();
            ctx.font = '600 12px monospace';
            ctx.textAlign = 'left';
            ctx.fillStyle = '#17332ddd';
            ctx.fillRect(8, h - 30, 156, 22);
            ctx.fillStyle = '#e7f3dd';
            ctx.fillText(meter ? `FPS ${meter.fps} · ${meter.ms.toFixed(1)} ms` : 'FPS —', 14, h - 15);
            ctx.restore();
        }
    }

    return {
        drawWorldOverlays,
        drawScreenOverlays,
        isWeatherFading: () => !!(weatherFade?.previous && weatherFade.previousWeight > 0.01),
    };
}
