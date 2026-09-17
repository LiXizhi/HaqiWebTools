// Smooth follow camera in map pixel space with integer snapping for crisp pixel art.
export function createCamera(worldMap) {
  const cam={x:0,y:0,width:800,height:600,zoom:1};
  cam.resize=(width,height)=>{cam.width=width;cam.height=height;cam.zoom=width<700?0.8:1;};
  cam.follow=(x,y,dt,snap=false)=>{
    const vw=cam.width/cam.zoom,vh=cam.height/cam.zoom;
    const tx=Math.min(Math.max(0,x-vw/2),Math.max(0,worldMap.width-vw)),ty=Math.min(Math.max(0,y-vh/2),Math.max(0,worldMap.height-vh));
    if(snap){cam.x=tx;cam.y=ty;return;}
    const k=Math.min(1,dt*6);cam.x+=(tx-cam.x)*k;cam.y+=(ty-cam.y)*k;
  };
  cam.toScreen=(x,y)=>[(x-cam.x)*cam.zoom,(y-cam.y)*cam.zoom];
  cam.toWorld=(sx,sy)=>[sx/cam.zoom+cam.x,sy/cam.zoom+cam.y];
  cam.visible=(x,y,margin=48)=>{const [sx,sy]=cam.toScreen(x,y);return sx>-margin&&sy>-margin&&sx<cam.width+margin&&sy<cam.height+margin;};
  return cam;
}
