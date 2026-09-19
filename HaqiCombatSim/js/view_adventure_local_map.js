// Island navigation UI: controller owns movement and all save changes.
export function renderLocalMap(root,world,save,callbacks){
    root.replaceChildren();root.className='overlay visible';
    const box=document.createElement('section');box.className='modal wide island-guide';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','哈奇岛导览');
    const header=document.createElement('header');header.className='modal-header';
    const title=document.createElement('h2');title.textContent='哈奇岛导览';
    const close=document.createElement('button');close.className='close-button';close.textContent='×';close.setAttribute('aria-label','关闭');close.onclick=callbacks.close;
    header.append(title,close);box.append(header);
    const body=document.createElement('div');body.className='modal-body';
    const hint=document.createElement('p');hint.textContent='选择地标，沿小路步行前往。白色圆点是你的位置，河流从桥上通过。';
    const canvas=document.createElement('canvas');canvas.width=560;canvas.height=440;canvas.className='island-guide-map';canvas.setAttribute('aria-label','哈奇岛地形与当前位置');
    const list=document.createElement('div');list.className='island-guide-destinations';
    for(const mark of [...world.landmarks,{...world.portal,description:'返回魔法营地的传送阵。'}]){
        const button=document.createElement('button');button.textContent=mark.name;button.title=mark.description;
        button.onclick=()=>callbacks.walk({...mark,kind:mark.id==='portal'?'portal':'landmark'});list.append(button);
    }
    body.append(hint,canvas,list);box.append(body);root.append(box);callbacks.draw(canvas);close.focus();
}
