import test from 'node:test';
import assert from 'node:assert/strict';
import {learningModeForced,enforceLearningMode} from '../js/learning_mode_policy.js';
import {normalizeLocaleSave} from '../js/locale_core.js';
import {createSettingsControls} from '../js/view_settings_controls.js';
test('forceBilingual is presence-based and only matches its exact parameter',()=>{
    for(const search of ['?forceBilingual','?forceBilingual=1','?forceBilingual=false'])assert.equal(learningModeForced(search),true);
    for(const search of ['', '?forceOther=1','?x=forceBilingual'])assert.equal(learningModeForced(search),false);
});
test('default enabled, saved opt out, and forced restoration across loaded saves',()=>{
    assert.equal(normalizeLocaleSave({}).languageLearning.enabled,true);
    for(const forced of [false,true]){
        const save=normalizeLocaleSave({languageLearning:{enabled:false}});
        enforceLearningMode(save,forced);
        assert.equal(save.languageLearning.enabled,forced);
    }
});
test('disabled settings toggle prevents callback execution',()=>{
    let called=false;
    const ui=createSettingsControls({el:(tag,cls,...children)=>({children}),button:(label,onclick)=>({onclick,setAttribute(){}})});
    const row=ui.toggle({label:'语言学习',disabled:true},true,()=>{called=true;});
    const pill=row.children.at(-1);assert.equal(pill.disabled,true);pill.onclick();assert.equal(called,false);
});
