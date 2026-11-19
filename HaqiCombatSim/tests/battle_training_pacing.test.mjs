import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {markRepeatedTacticalCasts, presentationEffectDuration, presentationEventDurationMs, presentationEventProgress, samplePresentationClock} from '../js/battle_presentation_core.js';

test('brisk beginner playback shortens waiting but preserves hits, heals and failed casts',()=>{
 for(const type of ['pass','status','speak'])assert.ok(presentationEventDurationMs({type},{briskTraining:true})<presentationEventDurationMs({type}));
 for(const type of ['damage','dot','heal','hot','fizzle','movearrow','combat_end']){
  for(const hp of [0,40])assert.equal(presentationEventDurationMs({type},{hp,briskTraining:true}),presentationEventDurationMs({type},{hp}));
 }
});

test('shorter waits retain event order and the full final feedback frame',()=>{
 const events=['pass','speak','status','damage','heal'];
 const frames=events.map(type=>({type,duration:presentationEventDurationMs({type},{hp:50,briskTraining:true})}));
 let elapsed=0;
 for(let i=0;i<frames.length;i++){
  assert.equal(samplePresentationClock(frames,(elapsed+frames[i].duration/2)/1000).index,i);
  elapsed+=frames[i].duration;
 }
 assert.deepEqual(samplePresentationClock(frames,elapsed/1000),{index:frames.length-1,progress:1});
});

test('a returning spell shortens the name hold only after its own caster successfully showed it', () => {
    const effects = JSON.parse(readFileSync(new URL('../data/adventure/spell-effects.json', import.meta.url)));
    const key = Object.keys(effects.cards)[0];
    const card = {key, pipcost: 2, spellSchool: 'fire', type: 'SingleAttack'};
    const options = {effects, card};
    const seen = new Map();
    const cast = {type: 'cast', caster: 'hero', card: key};
    const unrelated = [{...cast, type: 'fizzle'}, {...cast, sourceType: 'reflection'}];
    assert.deepEqual(markRepeatedTacticalCasts(unrelated, seen), unrelated);
    assert.equal(markRepeatedTacticalCasts([cast], seen)[0], cast);
    const [repeated, partner] = markRepeatedTacticalCasts([cast, {...cast, caster: 'partner'}], seen);
    assert.equal(repeated.repeatTacticalCast, true);
    assert.equal(partner.repeatTacticalCast, undefined);
    assert.equal(cast.repeatTacticalCast, undefined);
    const full = presentationEventDurationMs(cast, options);
    const brisk = presentationEventDurationMs(repeated, options);
    assert.equal(full - brisk, 1250);
    for (const [event, hold, duration] of [[cast, 1900, full], [repeated, 650, brisk]]) {
        assert.ok(Math.abs(presentationEventProgress(event, hold / duration, options) - .12) < 1e-8);
        assert.equal(presentationEventProgress(event, 1, options), 1);
    }
    const quick = {...card, pipcost: 0};
    assert.equal(presentationEffectDuration(effects, quick, false, true), 900);
    assert.equal(presentationEffectDuration(effects, quick, true, true), 500);
    assert.equal(presentationEffectDuration(effects, card, false, true), presentationEffectDuration(effects, card));
});
