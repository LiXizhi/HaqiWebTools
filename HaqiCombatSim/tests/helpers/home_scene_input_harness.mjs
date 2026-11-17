import { bindHomeSceneCanvasInput } from '../../js/home/view_home_scene_input.js';

export function bindHomeSceneInputForTest({
    canvas,
    body = { dataset: {} },
    side = { contains: () => false },
    dock = { children: [null, null, { contains: () => false }] },
    doc = null,
    state,
    position = () => ({}),
    hitAt = () => null,
    eraseAt = () => {},
    paintAt = () => {},
    petDragPoint = () => ({ x: 0, y: 0 }),
    cb = {},
}) {
    return bindHomeSceneCanvasInput({
        canvas,
        body,
        side,
        dock,
        getState: () => state,
        setState: updates => Object.assign(state, updates),
        position,
        hitAt,
        eraseAt,
        paintAt,
        petDragPoint,
        run: fn => fn(),
        cb,
        doc,
    });
}
