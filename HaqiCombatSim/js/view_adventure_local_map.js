import {createCloseButton} from './view_adventure_controls.js';
// Island navigation UI: controller owns movement and all save changes.
export function renderLocalMap(root,world,save,callbacks){
    root.replaceChildren();root.className='overlay visible';
    const name=world.layout.name;
    const box=document.createElement('section');box.className='modal wide island-guide';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',name);
    const header=document.createElement('header');header.className='modal-header';
    const title=document.createElement('h2');title.textContent=name;
    const close=createCloseButton(callbacks.close);
    header.append(title,close);box.append(header);
    const body=document.createElement('div');body.className='modal-body';
    const canvas=document.createElement('canvas');canvas.width=560;canvas.height=Math.round(560*world.h/world.w);canvas.className='island-guide-map';canvas.setAttribute('aria-label',`${name}地形与当前位置`);
    const list=document.createElement('div');list.className='island-guide-destinations';
    const map=document.createElement('div');map.className='island-guide-chart';map.append(canvas);
    for(const mark of world.landmarks){
        const button=document.createElement('button');button.textContent=mark.name;button.title=mark.description;
        button.onclick=()=>callbacks.teleport(mark.id);list.append(button);
        const region=world.layout.regions.find(r=>r.id===mark.id)||mark;
        const label=document.createElement('button');label.className='island-map-label';label.textContent=mark.name;
        label.setAttribute('aria-label',`传送到${mark.name}`);label.title=`传送到${mark.name}`;
        label.style.left=`${region.x/world.w*100}%`;label.style.top=`${region.y/world.h*100}%`;
        label.onclick=()=>callbacks.teleport(mark.id);map.append(label);
    }
    body.append(map,list);box.append(body);root.append(box);callbacks.draw(canvas,{labels:false});close.focus();
}
