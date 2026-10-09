import test from 'node:test';
import assert from 'node:assert/strict';
import {alignCameraOrigin,clampCameraToWorld,createCameraZoom,FISHING_CAMERA_MS,FISHING_CAMERA_ZOOM} from '../js/adventure_camera_core.js';

test('bounded city camera stays inside the map on a stable sampling lattice',()=>{
    for(const scale of [.615,.82,1,1.317,1.4])for(const dpr of [1,1.25,2])for(const width of [390,1280]){
        const view={w:width/scale,h:844/scale},world={w:2400,h:2400};
        for(const desired of [{x:-300,y:-500},{x:3000,y:3100},{x:130,y:240}]){
            const aligned=alignCameraOrigin(desired.x,desired.y,scale,dpr),p=clampCameraToWorld(aligned,world,view,scale,dpr);
            assert.ok(p.x>=0&&p.y>=0&&p.x+view.w<=world.w+1e-8&&p.y+view.h<=world.h+1e-8);
            for(const value of [p.x,p.y])assert.ok(Math.abs(value*scale*dpr-Math.round(value*scale*dpr))<1e-8);
        }
    }
});

test('camera panning preserves static sprite sampling phase at desktop and mobile scales',()=>{
    for(const scale of [.82,.82*.93,1,1.4])for(const dpr of [1,1.25,1.5,2]){
        const pixels=scale*dpr,object={x:7057400.37,y:1619080.19};let previous=null;
        for(let frame=0;frame<120;frame++){
            const desired={x:7057200.13+frame*.17,y:1619000.23-frame*.13};
            const camera=alignCameraOrigin(desired.x,desired.y,scale,dpr);
            for(const axis of ['x','y'])assert.ok(Math.abs((camera[axis]-desired[axis])*pixels)<=.500001);
            const screen={x:(object.x-camera.x)*pixels,y:(object.y-camera.y)*pixels};
            if(previous)for(const axis of ['x','y']){
                const delta=screen[axis]-previous[axis];
                assert.ok(Math.abs(delta-Math.round(delta))<1e-7,'fixed scenery moves by whole physical pixels');
            }
            previous=screen;
        }
    }
});

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
