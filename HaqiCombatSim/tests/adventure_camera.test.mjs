import test from 'node:test';
import assert from 'node:assert/strict';
import {createCameraZoom,FISHING_CAMERA_MS,FISHING_CAMERA_ZOOM} from '../js/adventure_camera_core.js';

test('fishing zoom eases in and restores the exact exploration setting',()=>{
    for(const factor of [.1,.93,1.12,2]){
        const camera=createCameraZoom(),before=camera.zoomBy(factor);
        assert.equal(camera.setFishing(true),FISHING_CAMERA_ZOOM);
        camera.tick(0);
        assert.equal(camera.value,before);
        const mid=camera.tick(FISHING_CAMERA_MS/2);
        assert.ok(Math.abs(mid-(before+FISHING_CAMERA_ZOOM)/2)<1e-9);
        assert.equal(camera.tick(FISHING_CAMERA_MS),FISHING_CAMERA_ZOOM);
        assert.equal(camera.zoomBy(.5),FISHING_CAMERA_ZOOM);
        camera.setFishing(true);
        assert.equal(camera.setFishing(false),before);
        camera.tick(FISHING_CAMERA_MS);
        assert.equal(camera.tick(FISHING_CAMERA_MS*2),before);
        assert.equal(camera.setFishing(false),before);
        camera.setFishing(true);camera.tick(FISHING_CAMERA_MS*3);camera.tick(FISHING_CAMERA_MS*4);
        camera.setFishing(false);camera.tick(FISHING_CAMERA_MS*4);assert.equal(camera.tick(FISHING_CAMERA_MS*5),before);
    }
});
test('fishing zoom can reverse from the current distance',()=>{
    const camera=createCameraZoom();
    camera.setFishing(true);camera.tick(0);
    const mid=camera.tick(FISHING_CAMERA_MS/2);
    camera.setFishing(false);camera.tick(1000);
    const back=camera.tick(1000+FISHING_CAMERA_MS/2);
    assert.ok(back<mid);
    assert.equal(camera.tick(1000+FISHING_CAMERA_MS),1);
});
test('reduced motion reaches the fishing zoom immediately',()=>{
    const camera=createCameraZoom();
    camera.zoomBy(.9);camera.setFishing(true);
    assert.equal(camera.tick(0,true),FISHING_CAMERA_ZOOM);
    camera.setFishing(false);
    assert.equal(camera.tick(10,true),.9);
});
test('exploration zoom remains bounded and ignores invalid input',()=>{
    const camera=createCameraZoom();for(const factor of [NaN,Infinity,0,-1])assert.equal(camera.zoomBy(factor),1);
    assert.equal(camera.zoomBy(.1),.75);assert.equal(camera.zoomBy(100),1.4);
});
