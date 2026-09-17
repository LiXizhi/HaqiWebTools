// Keyboard (WASD / arrows / E / Enter / Space / Esc), pointer taps and a touch joystick.
export function createInput(canvas) {
  const keys=new Set();const input={axis:[0,0],interact:false,cancel:false,menu:null,tap:null,joystick:null,enabled:true};
  const map={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right'};
  const isTyping=e=>['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName);
  window.addEventListener('keydown',e=>{if(isTyping(e))return;const k=e.key.toLowerCase();
    if(map[k]){keys.add(map[k]);e.preventDefault();}
    if(['e','enter',' '].includes(k)){input.interact=true;e.preventDefault();}
    if(k==='escape')input.cancel=true;
    if(['j','i','m','b'].includes(k))input.menu=k;});
  window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(map[k])keys.delete(map[k]);});
  window.addEventListener('blur',()=>keys.clear());
  let pointer=null;
  canvas.addEventListener('pointerdown',e=>{if(!input.enabled)return;const box=canvas.getBoundingClientRect();const p={x:e.clientX-box.left,y:e.clientY-box.top,id:e.pointerId,start:performance.now(),moved:false};
    if(e.pointerType==='touch'&&p.x<box.width*.5&&p.y>box.height*.4){input.joystick={cx:p.x,cy:p.y,x:p.x,y:p.y};p.joy=true;}pointer=p;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const box=canvas.getBoundingClientRect();const x=e.clientX-box.left,y=e.clientY-box.top;if(Math.hypot(x-pointer.x,y-pointer.y)>8)pointer.moved=true;if(pointer.joy&&input.joystick){input.joystick.x=x;input.joystick.y=y;}});
  const end=e=>{if(!pointer||pointer.id!==e.pointerId)return;if(!pointer.joy&&!pointer.moved)input.tap={x:pointer.x,y:pointer.y};if(pointer.joy)input.joystick=null;pointer=null;};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  input.poll=()=>{
    let x=0,y=0;if(keys.has('left'))x-=1;if(keys.has('right'))x+=1;if(keys.has('up'))y-=1;if(keys.has('down'))y+=1;
    if(input.joystick){const dx=input.joystick.x-input.joystick.cx,dy=input.joystick.y-input.joystick.cy,len=Math.hypot(dx,dy);if(len>10){x=dx/Math.max(len,40)*Math.min(1,len/40);y=dy/Math.max(len,40)*Math.min(1,len/40);}}
    const len=Math.hypot(x,y);input.axis=len>1?[x/len,y/len]:[x,y];
    const out={axis:input.axis,interact:input.interact,cancel:input.cancel,menu:input.menu,tap:input.tap,joystick:input.joystick};
    input.interact=false;input.cancel=false;input.menu=null;input.tap=null;return out;
  };
  input.clear=()=>{keys.clear();input.interact=false;input.cancel=false;input.menu=null;input.tap=null;};
  return input;
}
