import {updateLocationLabel,stepWorldMovement,createFrameLoopController} from './frame_loop_controller.js';
import {createInputBindings} from './input_bindings.js';
import {createSceneNavigationController} from './scene_navigation_controller.js';

export {updateLocationLabel,stepWorldMovement};

export function createWorldInteractionController(options){
    const sceneNavigation=createSceneNavigationController(options);
    const frameLoop=createFrameLoopController({
        ...options,
        interact:sceneNavigation.interact,
        nearbySceneInteraction:sceneNavigation.nearbySceneInteraction,
        requestHeroPath:sceneNavigation.requestHeroPath,
        liveEncounterTarget:sceneNavigation.liveEncounterTarget,
        trackedDestinationInteraction:sceneNavigation.trackedDestinationInteraction,
        startFishing:sceneNavigation.startFishing,
    });
    const inputBindings=createInputBindings({
        ...options,
        interactNearest:sceneNavigation.interactNearest,
        pickWorldTarget:sceneNavigation.pickWorldTarget,
        clickWorld:sceneNavigation.clickWorld,
    });

    return {
        ...sceneNavigation,
        ...inputBindings,
        ...frameLoop,
    };
}
