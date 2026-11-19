import { catalogTracksMonster } from '../../adventure_catalog_quests_core.js';
import { cityEntranceAppearance } from '../../adventure_city_dungeons_core.js';
import { npcCharacter } from '../../adventure_city_people_core.js';
import { createCompanion, stepCompanion, selectCompanionId, selectSocialPetId } from '../../adventure_companion_core.js';
import { currentQuest, questState, questProgress } from '../../adventure_core.js';
import { earthBoatAt, earthBoatRiderPose } from '../../adventure_earth_boat_core.js';
import { earthCityNpcMarker } from '../../adventure_earth_city_config_core.js';
import { activeAdventureHonor } from '../../adventure_honors_core.js';
import { magicStarStatus } from '../../adventure_magic_star_core.js';
import { monsterScenePositions, stepMonsterWander, monsterTerritoryWarning, monsterSceneParams } from '../../adventure_monster_motion_core.js';
import { createMotionTrail, motionStyle, drawMotionTrail, drawMotionAccessory } from '../../adventure_motion_effects.js';
import { sceneMountSave } from '../../adventure_mounts_core.js';
import { npcPurpose } from '../../adventure_npc_core.js';
import { petDisplayScale } from '../../adventure_pet_interactions_core.js';
import { petAppearanceStage } from '../../adventure_pets_core.js';
import { presenceLanguageLabel } from '../../adventure_presence_core.js';
import { createSignpostPainter } from '../../adventure_signposts.js';
import { socialGesturePose, socialHeadAnchor } from '../../adventure_social_actions_core.js';
import { heroSocialLookPeers } from '../../adventure_social_motion_core.js';
import { drawMagicStar, starCompanionVisible } from '../../adventure_star.js';
import { createStarFollower } from '../../adventure_star_motion_core.js';
import { createWorldViewQuery, walkable } from '../../adventure_world_core.js';
import { createHeroActor, updateHeroActor } from '../../hero_pose_core.js';
import { islandCompanionNavigation } from '../../island_companion_navigation.js';
import { tr } from '../../locale_runtime.js';
import { openingJourneyScene, openingGuideAnchor, OPENING_PET } from '../../opening_journey_core.js';
import { hashSeed } from '../../rng_core.js';
import { mergeSceneObjects } from '../../scene_order_core.js';
import { petIdleLift } from '../../views/adventure/view_adventure_pet_mood.js';
import { drawSocialPet } from '../../views/adventure/view_adventure_pet_social.js';
import { drawCityHotspot } from '../../views/adventure/view_city_dungeon.js';
import { drawDungeonEntrance } from '../../views/adventure/view_dungeon_entrance.js';
import { drawEarthBoatRider } from '../../views/adventure/view_earth_boat.js';
import { drawForestCommissionSite } from '../../views/adventure/view_forest_scene.js';
import { drawMemoryNode } from '../../hanzi/view_hanzi_memory.js';
import { drawMonsterTerritory } from '../../views/adventure/view_monster_territory.js';
import { PLATE, ellipse, text, plate, circleRune } from './primitives.js';

export function createActorPass({
    assets,
    ctx,
    cam,
    reducedMotion,
    shadow,
    avatar,
    monster,
    creature,
    starAnchor,
    campToys,
    interactionFeedback,
    terrain,
}) {
    const worldView = createWorldViewQuery();
    const drawSignpost = createSignpostPainter();
    const motionTrail = createMotionTrail();
    const starFollower = createStarFollower();
    const socialFx = new Map();
    let lastMonsterTime = null;
    let lastPetTime = null;
    let heroActor = null;
    let heroPrevious = null;
    let heroScope = null;
    let heroIdentity = null;
    let localActor = null;
    let localPrevious = null;
    let localScope = null;
    let localIdentity = null;
    let companion = null;
    let companionId = null;
    let companionWorld = null;
    let companionSave = null;

    function drawObject(o, state) {
        const { world, save, time, frame, options, visualSave, heroPose, localPose, star, starLevel, motion, streetFocus, petId } = state;
        const { w, t, gestureAt, markerFor, forestScene } = frame;
        const {
            localSecondMoving = false,
            graphics = { particles: true, trails: true },
            socialGesture = null,
            petScene = null,
            socialActors = [],
            inParty = false,
            moving = false,
            title = false,
            teleportEffect = null,
            fishingPose = null,
            motionHidden = false,
        } = options;

        if (o.kind === 'hanzi-memory') {
            drawMemoryNode(ctx, o, time, world.memoryArt);
            return;
        }
        if (o.kind === 'hanzi-sign') {
            ctx.save();
            ctx.fillStyle = '#f3dfab';
            ctx.fillRect(o.x - 15, o.y - 27, 30, 32);
            ctx.fillStyle = '#614524';
            ctx.textAlign = 'center';
            ctx.font = '22px serif';
            ctx.fillText(o.glyph, o.x, o.y - 3);
            ctx.restore();
            return;
        }
        if (o.kind.startsWith('street')) {
            terrain.streetPainter.draw(ctx, o, save.position, streetFocus);
            return;
        }
        if (o.x < cam.x - 200 || o.x > cam.x + w / cam.scale + 200 || o.y < cam.y - 50 || o.y > cam.y + frame.h / cam.scale + 230) {
            return;
        }
        if (o.kind === 'opening-companion') {
            const hop = reducedMotion.matches ? 0 : Math.sin(t * (o.free ? 4 : 2)) * 2;
            shadow(ctx, o.x, o.y, 17);
            assets.drawPet(ctx, OPENING_PET, 0, o.x - 32, o.y - 60 - hop, 64, 64);
            plate(ctx, o.label, o.x, o.y + 18, PLATE.place);
            if (o.free) circleRune(ctx, o.x, o.y, 22, t, '#9dce8c');
            return;
        }
        if (o.kind === 'pet-social') {
            ctx.save();
            ctx.globalAlpha *= o.row.sceneOpacity ?? 1;
            drawSocialPet(ctx, assets, o.row, petScene?.effects || [], time, reducedMotion.matches, petScene?.now);
            ctx.restore();
            return;
        }
        if (o.kind === 'tree') {
            ctx.save();
            if (Math.abs(save.position.x - o.x) < o.size * 0.4 && save.position.y < o.y && save.position.y > o.y - o.size * 0.85) {
                ctx.globalAlpha = 0.52;
            }
            const custom = (world.isEarth && world.drawEarthDecoration?.(ctx, o)) || terrain.drawCustomTree(ctx, o, world);
            if (!custom && !world.isEarth) assets.tile(ctx, 'sprites', o.tile, o.x - o.size / 2, o.y - o.size + 10, o.size, o.size);
            ctx.restore();
            if (!world.isEarth && !o.snow && assets.sceneryTile) {
                const variant = Math.abs(Math.round(o.x * 7 + o.y * 13)) % 8;
                const size = o.size * 0.36;
                assets.sceneryTile(ctx, 8 + variant, o.x + o.size * 0.18, o.y - size + 14, size, size);
            }
            return;
        }
        if (o.kind === 'building') {
            ctx.save();
            if ((o.atlas || world.zone === 'town') && Math.abs(save.position.x - o.x) < o.w * 0.5 && save.position.y < o.y && save.position.y > o.y - o.h) {
                ctx.globalAlpha = 0.52;
            }
            const bob = o.frame === 'boat' && !reducedMotion.matches ? Math.sin(t * 1.4 + o.x) * 2 : 0;
            const scale = o.atlas === 'camp' && o.frame !== 'harbor' ? 1.22 : (world.zone === 'hanzi' && o.frame === 'harbor' ? 1.45 : 1);
            const dw = o.w * scale;
            const dh = o.h * scale;
            const drawAtlas = world.zone === 'hanzi' && o.frame === 'harbor' ? 'hanziHarbor' : o.atlas;
            let drawn = world.isEarth
                ? world.drawEarthBuilding?.(ctx, o)
                : drawAtlas && assets.buildingArt?.draw(ctx, drawAtlas, o.frame, o.x - dw / 2, o.y - dh + bob, dw, dh);
            if (!drawn && !o.atlas && world.zone === 'town') {
                if (Math.hypot(o.x - 3500, o.y - 2710) < 120) {
                    drawn = assets.environmentArt?.draw(ctx, 'islandLandmarks', 'townCastle', o.x - o.w * 0.74, o.y - o.h * 1.42, o.w * 1.48, o.h * 1.45);
                } else if (Math.hypot(o.x - 1540, o.y - 2780) < 120) {
                    drawn = assets.environmentArt?.draw(ctx, 'islandLandmarks', 'townWindmill', o.x - o.w * 0.7, o.y - o.h * 1.36, o.w * 1.4, o.h * 1.4);
                } else {
                    drawn = assets.buildingArt?.draw(ctx, 'town', o.tile === 6 ? 'tower' : 'village', o.x - o.w * 0.62, o.y - o.h * 1.18, o.w * 1.24, o.h * 1.2);
                }
            }
            if (!drawn && !o.decorationOnly && !world.isEarth) assets.tile(ctx, 'sprites', o.tile, o.x - o.w / 2, o.y - o.h, o.w, o.h);
            ctx.restore();
            return;
        }
        if (o.kind === 'landmark') {
            if (world.languageQuestTarget?.kind === 'landmark' && world.languageQuestTarget.id === o.id) {
                plate(ctx, '语言任务 · ' + o.name, o.x, o.y - 35, { ...PLATE.place, text: '#fff1a3' });
            }
            if (o.forestSite) {
                drawForestCommissionSite(ctx, assets, o, forestScene?.sites[o.id], (label, x, y, active) =>
                    plate(ctx, label, x, y, active ? { ...PLATE.place, text: '#fff1a3', stroke: '#d9bd65' } : PLATE.place));
                if (forestScene?.sites[o.id]?.active) circleRune(ctx, o.x, o.y, 32, reducedMotion.matches ? 0 : t, '#e9d69a');
            } else if (o.dungeonId && !o.cityDungeon) {
                drawDungeonEntrance(ctx, o, t, reducedMotion.matches, assets.entranceArt);
            } else if (o.cityHotspot && !o.streetArt) {
                drawCityHotspot(ctx, o);
            } else if (!world.isEarth && !o.cityDungeon && !o.streetArt) {
                drawSignpost(ctx, o.name, o.x, o.y);
            }
            if (o.cityDungeon && !world.isEarth) {
                const art = cityEntranceAppearance(o.cityLevel, o.cityNodeEntrance);
                plate(ctx, o.name, o.x, o.y - art.h / 2 - 17, { ...PLATE.place, text: art.color });
            } else if (!world.isEarth && o.cityHotspot) {
                plate(ctx, o.name, o.x, o.y + 32);
            }
            return;
        }
        if (o.kind === 'camp-toy') {
            campToys.draw(ctx, o, time, { reduced: reducedMotion.matches, near: Math.hypot(o.x - save.position.x, o.y - save.position.y) < 120 });
            return;
        }
        if (o.kind === 'npc') {
            shadow(ctx, o.x, o.y, 25);
            const dragon = [36211, 30112].includes(o.id);
            const sw = dragon ? 100 : 64;
            const sh = dragon ? 104 : 86;
            const response = interactionFeedback.npcPose(o, save.position, time);
            ctx.save();
            ctx.translate(0, -response.lift);
            if (response.glow) {
                ctx.shadowColor = '#fff0ad';
                ctx.shadowBlur = graphics.low ? 4 : 10;
            }
            const character = npcCharacter(o, assets.hero?.manifest, world.isCityDungeon === true);
            if (character) avatar(ctx, { ...character, facing: response.facing }, o.x, o.y, t, false, 1, false);
            else if (!assets.draw(ctx, o.portrait, o.x - sw / 2, o.y - sh + Math.sin(t * 1.6 + o.id) * 1.5, sw, sh, true, false)) {
                ellipse(ctx, o.x, o.y - 27, 19, 28, '#668b76');
                ellipse(ctx, o.x, o.y - 65, 14, 16, '#efd6ad');
            }
            ctx.restore();
            const purpose = npcPurpose(assets.content, o);
            plate(ctx, purpose ? `${tr(o.name)} · ${tr(purpose.role)}` : o.name, o.x, o.y + 19, PLATE.npc);
            const forestNpc = forestScene?.phase !== 'done' && forestScene?.goal.kind === 'npc' && forestScene.goal.id === o.id;
            const marker = world.languageQuestTarget?.kind === 'npc' && world.languageQuestTarget.id === o.id
                ? '!'
                : o.earthNpc
                    ? earthCityNpcMarker(save, world.city, o.id)
                    : markerFor(o.id) || (forestNpc ? (forestScene.phase === 'report' ? '?' : '!') : null);
            if (marker) text(ctx, marker, o.x, o.y - sh - 8 + Math.sin(t * 3) * 3, 29, '#fff1a3');
            if (forestScene?.npcs[o.id] && Math.hypot(o.x - save.position.x, o.y - save.position.y) < 155) {
                plate(ctx, forestScene.npcs[o.id], o.x, o.y - sh - 35, PLATE.place);
            }
            return;
        }
        if (o.kind === 'mob') {
            ctx.save();
            ctx.globalAlpha *= o.sceneState?.opacity ?? 1;
            const m = o.monster || assets.content.monsters[o.monsterId] || { name: '缺失怪物' };
            monster(ctx, m, o.x, o.y, t, o.scale, o);
            const q = currentQuest(save, assets.content);
            const goal = q && questProgress(save, q).find(g => g.kind === 'defeat' && g.id === m.goalId && g.value < g.count);
            const trackedMob = (o.monsterIds || [o.monsterId]).some(id => catalogTracksMonster(save, assets.content, assets.content.monsters[id]));
            if (o.index === 0) {
                const purpose = o.blocked?.length ? '待迁移' : goal && questState(save, q.id).accepted ? '任务目标' : trackedMob ? '任务追踪' : '练习战术';
                plate(ctx, tr(m.name) + (o.monster ? ` · ${m.level}级` : '') + (o.groupSize > 1 ? ` · ${tr(`${o.groupSize}只`)}` : '') + ` · ${tr(purpose)}`, o.x, o.y + 18, PLATE.mob);
            }
            if (o.mode === 'warning') {
                const progress = 1 - o.alertRemaining / o.alertDuration;
                const pop = reducedMotion.matches ? 1 : 0.8 + Math.min(1, progress * 6) * 0.2 + Math.sin(progress * Math.PI * 4) * 0.06;
                ctx.save();
                ctx.translate(o.x, o.y - 104 * o.scale - 22);
                ctx.scale(pop, pop);
                ellipse(ctx, 0, 0, 13, 13, '#fff4ce');
                ctx.strokeStyle = '#a43b2a';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, 13, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = '#ff7953';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                ctx.stroke();
                text(ctx, '!', 0, 7, 23, '#a43b2a');
                ctx.restore();
            } else if ((goal && questState(save, q.id).accepted) || trackedMob) {
                text(ctx, '◇', o.x, o.y - 90 + Math.sin(t * 3) * 3, 25, '#fff2a9');
            }
            ctx.restore();
            return;
        }
        if (o.kind === 'remote-player') {
            const peer = o.peer;
            ctx.save();
            ctx.filter = 'saturate(1.12) hue-rotate(8deg)';
            const nameY = avatar(ctx, { ...peer.profile, facing: peer.facing, mountId: null }, o.x, o.y, t, peer.moving, 1, false);
            ctx.restore();
            plate(ctx, peer.profile.name || '哈奇玩家', o.x, nameY + 16, { ...PLATE.social, text: '#a5e8ff' });
            plate(ctx, presenceLanguageLabel(peer.profile.native), o.x, nameY + 40, { ...PLATE.social, text: '#c5eaf4' });
            return;
        }
        if (o.kind === 'social') {
            const a = o.actor;
            const p = a.profile;
            const fx = o.fx;
            const pose = fx?.poseOut;
            const gesturePose = socialGesturePose(socialGesture, p.id, gestureAt, reducedMotion.matches);
            ctx.save();
            ctx.globalAlpha *= a.sceneOpacity ?? 1;
            ctx.translate(0, -(gesturePose?.hop || 0));
            if (graphics.trails && fx?.motion && !title && !motionHidden) drawMotionAccessory(ctx, fx.motion, o, time, reducedMotion.matches);
            const onBoat = drawEarthBoatRider(ctx, assets, world, o, a.facing, (x, y) =>
                avatar(ctx, { ...p, mountId: null, facing: a.facing }, x, y, 0, false, 1, false, earthBoatRiderPose(pose, a.facing)));
            const nameY = onBoat
                ? o.y + 32
                : avatar(ctx, { ...p, mountId: null, facing: pose?.facing ?? a.facing }, o.x, o.y, t, a.moving, 1, false, pose || null);
            if (graphics.trails && fx?.motion && !title && !motionHidden) drawMotionAccessory(ctx, fx.motion, o, time, reducedMotion.matches, true);
            plate(ctx, p.sceneLabel || p.name, o.x, nameY + 16, PLATE.social);
            plate(ctx, presenceLanguageLabel(p.native), o.x, nameY + 40, PLATE.social);
            if (gesturePose) {
                const head = socialHeadAnchor(o);
                text(ctx, gesturePose.icon, head.x, head.y + 9, 27, '#fff');
            }
            ctx.restore();
            return;
        }
        if (o.kind === 'social-pet') {
            const fx = o.fx;
            const id = fx.petId;
            const pet = fx.companion;
            const hop = reducedMotion.matches ? 0 : pet.moving ? Math.abs(Math.sin(pet.phase)) * 5 : petIdleLift(time, reducedMotion.matches);
            ctx.save();
            ctx.globalAlpha *= o.actor.sceneOpacity ?? 1;
            shadow(ctx, o.x, o.y, 18);
            ctx.translate(o.x, o.y);
            ctx.scale(pet.facing, 1);
            const drawn = assets.content.pets?.[id]?.art && assets.drawPet(ctx, id, 0, -32, -60 - hop, 64, 64);
            if (!drawn) creature(ctx, 'pet', 0, -hop, t, 0.36, false);
            ctx.restore();
            return;
        }
        if (o.kind === 'local-player') {
            const pose = socialGesturePose(socialGesture, 'local-hero-1', gestureAt, reducedMotion.matches);
            ctx.save();
            ctx.translate(0, -(pose?.hop || 0));
            const peerVisualSave = sceneMountSave(
                earthBoatAt(world, o.x, o.y) ? { ...o.save, mountId: null } : o.save,
                { inParty: inParty || socialActors.some(actor => actor.inParty) },
            );
            const onBoat = drawEarthBoatRider(ctx, assets, world, o, localPose.facing, (x, y) =>
                avatar(ctx, { ...peerVisualSave, mountId: null, facing: localPose.facing }, x, y, 0, false, 1, true, earthBoatRiderPose(localPose, localPose.facing)));
            if (!onBoat) avatar(ctx, { ...peerVisualSave, facing: localPose.facing }, o.x, o.y, t, localSecondMoving || localPose.moving, 1, true, localPose);
            plate(ctx, o.save.name, o.x, o.y + (onBoat ? 50 : 20), PLATE.hero);
            if (pose) {
                const head = socialHeadAnchor(o);
                text(ctx, pose.icon, head.x, head.y + 9, 27, '#fff');
            }
            ctx.restore();
            return;
        }
        if (o.kind === 'hero') {
            const gesturePose = socialGesturePose(socialGesture, 'hero', gestureAt, reducedMotion.matches);
            ctx.save();
            ctx.translate(0, -(gesturePose?.hop || 0));
            if (!star.front) drawMagicStar(ctx, star, assets, starLevel);
            if (graphics.trails) circleRune(ctx, o.x, o.y + 2, 24, t, '#f7e6a088');
            let nameY;
            if (drawEarthBoatRider(ctx, assets, world, o, save.facing || 0, (x, y) =>
                avatar(ctx, { ...visualSave, mountId: null, facing: save.facing || 0 }, x, y, 0, false, 1, true, earthBoatRiderPose(heroPose, save.facing || 0)))) {
                nameY = o.y + 50;
            } else if (fishingPose) {
                ctx.save();
                ctx.translate(o.x, o.y - fishingPose.lift);
                ctx.rotate(fishingPose.lean);
                avatar(ctx, { ...save, mountId: null, facing: fishingPose.facing }, 0, 0, t, false);
                ctx.restore();
                nameY = o.y + 21;
            } else {
                if (graphics.trails && !title && !motionHidden && !teleportEffect) drawMotionAccessory(ctx, motion, o, time, reducedMotion.matches);
                const response = interactionFeedback.heroPose(time);
                ctx.save();
                ctx.translate(o.x, o.y);
                ctx.scale(response.x, response.y);
                ctx.translate(-o.x, -o.y);
                const heroBottom = avatar(ctx, { ...visualSave, facing: heroPose.facing }, o.x, o.y, t, moving, 1, true, heroPose);
                ctx.restore();
                if (graphics.trails && !title && !motionHidden && !teleportEffect) drawMotionAccessory(ctx, motion, o, time, reducedMotion.matches, true);
                nameY = heroBottom + 21;
            }
            if (star.front) drawMagicStar(ctx, star, assets, starLevel);
            if (!title) {
                plate(ctx, save.name, o.x, nameY, PLATE.hero);
                const honor = (save.tacticsRecord || save.dungeonChallengeRecords || save.tacticsChallenges) ? activeAdventureHonor(save) : null;
                if (honor) plate(ctx, '「' + honor.title + '」', o.x, nameY + 21, PLATE.npc);
            }
            if (gesturePose) {
                const head = socialHeadAnchor(o);
                text(ctx, gesturePose.icon, head.x, head.y + 9, 27, '#fff');
            }
            ctx.restore();
            return;
        }
        if (o.kind === 'pet') {
            const pet = save.pets?.[petId];
            const id = pet?.speciesId || petId;
            const hop = reducedMotion.matches ? 0 : companion.moving ? Math.abs(Math.sin(companion.phase)) * 5 : petIdleLift(time, reducedMotion.matches);
            shadow(ctx, o.x, o.y, 18);
            ctx.save();
            ctx.translate(o.x, o.y);
            ctx.scale(companion.facing, 1);
            const drawn = assets.content.pets?.[id]?.art && assets.drawPet(ctx, id, pet ? petAppearanceStage(pet, assets.content) : 0, -32, -60 - hop, 64, 64);
            if (!drawn) creature(ctx, 'pet', 0, -hop, t, 0.36, false);
            ctx.restore();
        }
    }

    function draw({ world, save, time, frame, options, coldTiles }) {
        const { w, h, dpr, t, viewport, viewRect, mark } = frame;
        const {
            localSecond = null,
            localSecondMoving = false,
            localFollowing = false,
            gatheringPets = [],
            graphics = { particles: true, trails: true },
            petScene = null,
            socialActors = [],
            remotePlayers = [],
            inParty = false,
            moving = false,
            title = false,
            teleportEffect = null,
            fishingPose = null,
            membership = {},
            motionHidden = false,
            hideLocalActors = false,
            monstersPaused = false,
        } = options;

        const identity = save.name + ':' + save.appearance + ':' + save.seed;
        if (!heroActor || heroScope !== world || heroIdentity !== identity || !heroPrevious || time - heroPrevious.time > 1000 || Math.hypot(save.position.x - heroPrevious.x, save.position.y - heroPrevious.y) > 100) {
            heroActor = createHeroActor(Number(save.seed) || 7419);
            heroActor.facing = save.facing || 0;
            heroActor.head = [0, 4, 12, 8][heroActor.facing];
            heroPrevious = { ...save.position, time };
            heroScope = world;
            heroIdentity = identity;
        }
        const turnableSocial = heroSocialLookPeers(socialActors, { inParty: inParty || !!save.coopRun });
        if (localSecond && !title && !localFollowing && !localSecondMoving) {
            turnableSocial.push({ id: 'local-hero-1', ...localSecond.position });
        }
        const heroPose = updateHeroActor(heroActor, {
            id: 'hero',
            dx: save.position.x - heroPrevious.x,
            dy: save.position.y - heroPrevious.y,
            x: save.position.x,
            y: save.position.y,
            time: t,
            facing: save.facing || 0,
            lookPeers: turnableSocial,
            npcs: world.npcs,
            reducedMotion: reducedMotion.matches,
        });
        heroPrevious = { ...save.position, time };

        let localPose = null;
        if (localSecond && !title) {
            const peerIdentity = localSecond.name + ':' + localSecond.appearance + ':' + localSecond.seed;
            if (!localActor || localScope !== world || localIdentity !== peerIdentity || !localPrevious || time - localPrevious.time > 1000 || Math.hypot(localSecond.position.x - localPrevious.x, localSecond.position.y - localPrevious.y) > 100) {
                localActor = createHeroActor(Number(localSecond.seed) || 7419);
                localActor.facing = localSecond.facing || 0;
                localActor.head = [0, 4, 12, 8][localActor.facing];
                localPrevious = { ...localSecond.position, time };
                localScope = world;
                localIdentity = peerIdentity;
            }
            const peers = heroSocialLookPeers(socialActors, { inParty: inParty || !!save.coopRun });
            if (!localFollowing && !moving) peers.push({ id: 'hero', ...save.position });
            localPose = updateHeroActor(localActor, {
                id: 'local-hero-1',
                dx: localSecond.position.x - localPrevious.x,
                dy: localSecond.position.y - localPrevious.y,
                ...localSecond.position,
                time: t,
                facing: localSecond.facing || 0,
                lookPeers: peers,
                npcs: world.npcs,
                reducedMotion: reducedMotion.matches,
            });
            localPrevious = { ...localSecond.position, time };
        } else {
            localActor = null;
            localPrevious = null;
        }

        const visualSave = sceneMountSave(
            earthBoatAt(world, save.position.x, save.position.y) ? { ...save, mountId: null } : save,
            { inParty: inParty || socialActors.some(actor => actor.inParty) },
        );
        const style = motionStyle(visualSave, membership);
        style.pose = { ...style.pose, facing: heroPose.facing, visualHead: heroPose.head, visualBreath: { ...heroPose.breath } };
        const motion = motionTrail.step(save.position, time, style, {
            moving,
            scope: world,
            reducedMotion: reducedMotion.matches,
            hidden: !graphics.trails || title || motionHidden || !!fishingPose || !!teleportEffect,
        });
        const star = starFollower.step(starAnchor({ ...visualSave, facing: heroPose.facing }, t, moving), time, {
            enabled: starCompanionVisible(save, motion.style, { title, motionHidden, fishingPose: !!fishingPose, teleportEffect: !!teleportEffect }),
            reducedMotion: reducedMotion.matches,
            scope: world,
        });
        const starLevel = magicStarStatus(membership, Date.now()).level;
        drawMotionTrail(ctx, motion, time, (c, p) => avatar(c, p.pose, p.x, p.y, p.born / 1000, true, 1, false));

        const monsterRadius = monsterSceneParams(world).territoryRadius;
        const padding = Math.max(320, monsterRadius + 110);
        const queryRect = { x: cam.x - padding, y: cam.y - padding, w: w / cam.scale + padding * 2, h: h / cam.scale + padding * 2 };
        const nearby = worldView.query(world, queryRect);
        const monsterDt = lastMonsterTime !== null && time - lastMonsterTime < 250 ? (time - lastMonsterTime) / 1000 : 0;
        lastMonsterTime = time;

        let objects = [];
        const scenery = [];
        const monsterWorld = world.isEarth ? { ...world, earthBoating: false } : world;
        for (const o of nearby) {
            if (world.isEarth && (o.x < queryRect.x || o.x > queryRect.x + queryRect.w || o.y < queryRect.y || o.y > queryRect.y + queryRect.h)) continue;
            if (o.kind === 'tree' && world.isEarth && world.earthDecorationBaked?.(o)) continue;
            if (o.kind !== 'mob') {
                scenery.push(o);
                continue;
            }
            stepMonsterWander(world, o, monsterDt, viewport, {
                enabled: !title && !motionHidden && !monstersPaused,
                ambient: !reducedMotion.matches,
                hero: save.position,
                canWalk: (x, y) => walkable(monsterWorld, x, y),
            });
            const warning = !title && !motionHidden && monsterTerritoryWarning(world, o, save.position);
            if (warning) drawMonsterTerritory(ctx, o, save.position, monsterSceneParams(world), t, reducedMotion.matches);
            if (!o.hidden) {
                for (const pose of monsterScenePositions(world, o)) {
                    objects.push({ ...o, ...pose, monsterIds: null, groupSize: o.monsterIds?.length || 1 });
                }
            }
        }
        if (!title && !localSecond) objects.push(...campToys.rows);
        if (!save.observer) objects.push({ ...save.position, kind: 'hero' });
        const openingActor = !title && !localSecond && openingJourneyScene(save, world.npcs.find(n => n.id === 36201));
        if (openingActor) {
            if (!walkable(world, openingActor.x, openingActor.y)) {
                const npc = world.npcs.find(n => n.id === 36201);
                openingActor.x = npc.x;
                openingActor.y = npc.y + 12;
            }
            objects.push({ ...openingActor, kind: 'opening-companion' });
        }
        if (localSecond && !title) objects.push({ ...localSecond.position, kind: 'local-player', save: localSecond });

        const petId = selectCompanionId(save, assets.content);
        if (petId && !petScene) {
            if (!companion || companionId !== petId || companionWorld !== world || companionSave !== save) {
                companion = createCompanion(world, save.position, `${save.seed}:${world.zone}:${petId}`);
                companionId = petId;
                companionWorld = world;
                companionSave = save;
                lastPetTime = time;
            }
            const lead = openingGuideAnchor(save, world.npcs.find(n => n.id === 36201));
            stepCompanion(companion, world, lead || save.position, (time - lastPetTime) / 1000, {
                deferSearch: coldTiles > 0,
                inParty,
                ...islandCompanionNavigation.options(companion, world, () => companionWorld === world && companionSave === save),
            });
            if (!gatheringPets.some(row => row.pet.id === petId)) objects.push({ ...companion.position, kind: 'pet' });
        } else {
            companion = petScene?.pets.find(row => row.pet.id === petId) || null;
        }
        lastPetTime = time;

        for (const peer of remotePlayers) {
            if (
                !title
                && peer.position.x >= viewRect.x - 80
                && peer.position.x <= viewRect.x + viewRect.w + 80
                && peer.position.y >= viewRect.y - 80
                && peer.position.y <= viewRect.y + viewRect.h + 80
            ) {
                objects.push({ ...peer.position, kind: 'remote-player', peer });
            }
        }

        const liveSocial = new Set();
        const lookables = [
            { id: 'hero', x: save.position.x, y: save.position.y, moving },
            ...(localSecond && !title ? [{ id: 'local-hero-1', ...localSecond.position, moving: localSecondMoving }] : []),
            ...socialActors.map(a => ({ id: a.profile.id, x: a.position.x, y: a.position.y, moving: !!a.moving })),
        ];
        for (const actor of socialActors) {
            liveSocial.add(actor.profile.id);
            const onScreen = actor.position.x >= viewRect.x && actor.position.x <= viewRect.x + viewRect.w
                && actor.position.y >= viewRect.y && actor.position.y <= viewRect.y + viewRect.h;
            let fx = socialFx.get(actor.profile.id);
            const petSpecies = selectSocialPetId(actor.profile, assets.content);
            if (!fx || fx.world !== world || fx.petId !== petSpecies) {
                const pose = createHeroActor(hashSeed(actor.profile.id));
                pose.facing = actor.facing;
                pose.head = [0, 4, 12, 8][pose.facing];
                fx = {
                    petId: petSpecies,
                    world,
                    companion: createCompanion(world, actor.position, `${actor.profile.id}:${world.zone}:${petSpecies}`),
                    trail: createMotionTrail(hashSeed(actor.profile.id)),
                    pose,
                    lastPos: { ...actor.position },
                    lastTime: time,
                };
                socialFx.set(actor.profile.id, fx);
            }
            const peers = lookables.filter(p => p.id !== actor.profile.id && !p.moving);
            const dx = actor.position.x - fx.lastPos.x;
            const dy = actor.position.y - fx.lastPos.y;
            const socialPose = updateHeroActor(fx.pose, {
                id: actor.profile.id,
                dx,
                dy,
                x: actor.position.x,
                y: actor.position.y,
                time: t,
                facing: actor.facing,
                lookPeers: peers,
                npcs: [],
                reducedMotion: reducedMotion.matches,
            });
            if (!actor.moving && socialPose.targetId) actor.facing = socialPose.facing;
            fx.lastPos = { ...actor.position };
            fx.poseOut = socialPose;
            const socialStyle = motionStyle({
                school: actor.profile.school,
                level: actor.profile.level || 1,
                appearance: actor.profile.appearance,
                headId: actor.profile.headId,
                bodyId: actor.profile.bodyId,
                facing: socialPose.facing,
                mountId: null,
                equipmentGuids: {},
                equipmentInstances: [],
            });
            socialStyle.pose = { ...socialStyle.pose, facing: socialPose.facing, visualHead: socialPose.head, visualBreath: { ...socialPose.breath } };
            const hidden = title || motionHidden || !onScreen;
            if (onScreen && !title && !petScene) {
                stepCompanion(fx.companion, world, actor.position, (time - fx.lastTime) / 1000, {
                    deferSearch: coldTiles > 0,
                    inParty: !!actor.inParty,
                    ...islandCompanionNavigation.options(fx.companion, world, () => socialFx.get(actor.profile.id) === fx),
                });
                objects.push({ ...fx.companion.position, kind: 'social-pet', fx, actor });
            }
            const socialMotion = fx.trail.step(actor.position, time, socialStyle, {
                moving: !!actor.moving && onScreen,
                scope: world,
                reducedMotion: reducedMotion.matches,
                hidden: hidden || !graphics.trails,
            });
            if (!hidden) {
                ctx.save();
                ctx.globalAlpha *= actor.sceneOpacity ?? 1;
                drawMotionTrail(ctx, socialMotion, time, (c, p) =>
                    avatar(c, { ...actor.profile, mountId: null, facing: p.pose?.facing ?? socialPose.facing }, p.x, p.y, p.born / 1000, true, 1, false));
                ctx.restore();
            }
            fx.lastTime = time;
            fx.motion = socialMotion;
            objects.push({ ...actor.position, kind: 'social', actor, fx, onScreen });
        }
        for (const id of socialFx.keys()) if (!liveSocial.has(id)) socialFx.delete(id);

        if (petScene && !title) {
            for (const row of petScene.pets) {
                if (!gatheringPets.some(job => job.pet.id === row.pet.id)) objects.push({ ...row.position, kind: 'pet-social', row });
            }
            for (const pet of petScene.babies) {
                objects.push({ ...pet.birth.anchor, kind: 'pet-social', row: { pet, position: pet.birth.anchor, scale: petDisplayScale(pet, assets.content) } });
            }
        }
        if (world.dungeon?.scene.streetscape) objects.push(...terrain.streetPainter.objects(world, viewport, time, save.position, reducedMotion.matches));
        if (!title && !motionHidden) {
            for (const row of gatheringPets) objects.push({ ...row.position, kind: 'pet-social', row: { ...row, scale: petDisplayScale(row.pet, assets.content) } });
            for (const n of world.memoryNodes || []) objects.push({ ...n, kind: 'hanzi-memory' });
            for (const n of world.memorySigns || []) objects.push({ ...n, kind: 'hanzi-sign' });
        }
        if (hideLocalActors) objects = objects.filter(o => !['hero', 'pet', 'pet-social', 'local-player', 'opening-companion'].includes(o.kind));
        objects = mergeSceneObjects(scenery, objects);

        const streetFocus = world.dungeon?.scene.streetscape
            ? [...world.npcs, ...terrain.streetPainter.people()].filter(n => Math.hypot(n.x - save.position.x, n.y - save.position.y) < 120)
            : [];
        mark('earth-render-actors');

        const islandCache = !world.isEarth && !world.isCityDungeon;
        const treeSource = world.zone === 'camp'
            ? assets.environmentArt?.images?.campTrees
            : ['town', 'fire', 'desert', 'dark'].includes(world.zone)
                ? (assets.environmentArt?.images?.islandTrees || assets.environmentArt?.images?.campTrees)
                : assets.environmentArt?.images?.trees;
        if (islandCache) terrain.islandScenery.begin(world, treeSource || assets.images?.get('sprites'), cam.scale * dpr);
        else terrain.islandScenery.clear();

        const drawState = { world, save, time, frame, options, visualSave, heroPose, localPose, star, starLevel, motion, streetFocus, petId };
        for (let objectIndex = 0; objectIndex < objects.length; objectIndex++) {
            const o = objects[objectIndex];
            if (o.hidden) continue;
            if (islandCache && o.kind === 'tree' && !(o.x < cam.x - 200 || o.x > cam.x + w / cam.scale + 200 || o.y < cam.y - 50 || o.y > cam.y + h / cam.scale + 230)) {
                const end = terrain.islandScenery.draw(ctx, objects, objectIndex, save.position, viewport);
                if (end > objectIndex) {
                    objectIndex = end - 1;
                    continue;
                }
            }
            drawObject(o, drawState);
        }
        mark('earth-render-objects');
        return { objects, visualSave, companion, petId };
    }

    return {
        draw,
        companionTarget: () => (companion ? { x: companion.position.x, y: companion.position.y } : null),
    };
}
