import {createCloseButton} from './view_adventure_controls.js';
import {fill, setText, tr} from './locale_runtime.js';
// Island navigation UI: controller owns movement and all save changes.
export function renderLocalMap(root,world,save,callbacks){
    root.replaceChildren();root.className='overlay visible';
    const name=world.layout.name;
    const box=document.createElement('section');box.className='modal wide island-guide';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',tr(name));
    const header=document.createElement('header');header.className='modal-header';
    const title=document.createElement('h2');setText(title,name);
    const close=createCloseButton(callbacks.close);
    header.append(title,close);box.append(header);
    const body=document.createElement('div');body.className='modal-body';
    const canvas=document.createElement('canvas');canvas.width=560;canvas.height=Math.round(560*world.h/world.w);canvas.className='island-guide-map';canvas.setAttribute('aria-label',fill('{name}地形与当前位置',{name}).text);
    canvas.style.cursor='pointer';
    canvas.addEventListener('click',e=>{
        const rect=canvas.getBoundingClientRect();
        callbacks.teleportToPosition((e.clientX-rect.left)/rect.width*world.w,(e.clientY-rect.top)/rect.height*world.h);
    });
    const list=document.createElement('div');list.className='island-guide-destinations';
    const map=document.createElement('div');map.className='island-guide-chart';map.append(canvas);
    for(const mark of world.landmarks){
        const button=document.createElement('button');setText(button,mark.name);button.title=tr(mark.description||'');
        button.onclick=()=>callbacks.teleport(mark.id);list.append(button);
        const region=world.layout.regions.find(r=>r.id===mark.id)||mark;
        const label=document.createElement('button');label.className='island-map-label';setText(label,mark.name);
        const teleport=fill('传送到{name}',{name:mark.name}).text;
        label.setAttribute('aria-label',teleport);label.title=teleport;
        label.style.left=`${region.x/world.w*100}%`;label.style.top=`${region.y/world.h*100}%`;
        label.onclick=()=>callbacks.teleport(mark.id);map.append(label);
    }
    body.append(map,list);box.append(body);root.append(box);callbacks.draw(canvas,{labels:false});close.focus();
}
