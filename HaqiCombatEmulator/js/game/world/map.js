// World <-> map-image coordinate calibration from config/Aries/WorldMaps anchors.
// Pure math; no DOM. Map space is the pixel space of the original CDN map image.
function solve3(rows) {
  // Least squares for p = a*x + b*z + c over rows [x,z,p]. Normal equations, 3x3 Gaussian elimination.
  const M=[[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  for(const [x,z,p] of rows){const v=[x,z,1];for(let i=0;i<3;i++){for(let j=0;j<3;j++)M[i][j]+=v[i]*v[j];M[i][3]+=v[i]*p;}}
  for(let i=0;i<3;i++){let pivot=i;for(let r=i+1;r<3;r++)if(Math.abs(M[r][i])>Math.abs(M[pivot][i]))pivot=r;[M[i],M[pivot]]=[M[pivot],M[i]];
    if(Math.abs(M[i][i])<1e-12)throw new Error('地图锚点退化，无法拟合');
    for(let r=0;r<3;r++)if(r!==i){const f=M[r][i]/M[i][i];for(let c=i;c<4;c++)M[r][c]-=f*M[i][c];}}
  return [M[0][3]/M[0][0],M[1][3]/M[1][1],M[2][3]/M[2][2]];
}
export function fitAffine(anchors) {
  if(!Array.isArray(anchors)||anchors.length<3)throw new Error('至少需要 3 个地图锚点');
  const ax=solve3(anchors.map(a=>[a.world[0],a.world[1],a.map[0]])),ay=solve3(anchors.map(a=>[a.world[0],a.world[1],a.map[1]]));
  const toMap=(wx,wz)=>[ax[0]*wx+ax[1]*wz+ax[2],ay[0]*wx+ay[1]*wz+ay[2]];
  const det=ax[0]*ay[1]-ax[1]*ay[0];
  if(Math.abs(det)<1e-12)throw new Error('地图锚点不可逆');
  const toWorld=(px,py)=>{const x=px-ax[2],y=py-ay[2];return [(x*ay[1]-ax[1]*y)/det,(ax[0]*y-ay[0]*x)/det];};
  const residuals=anchors.map(a=>{const [mx,my]=toMap(a.world[0],a.world[1]);return Math.hypot(mx-a.map[0],my-a.map[1]);});
  return {toMap,toWorld,coefficients:{x:ax,y:ay},maxResidual:Math.max(...residuals),meanResidual:residuals.reduce((a,b)=>a+b,0)/residuals.length,pixelsPerUnit:Math.sqrt(Math.abs(det))};
}
// The source anchors are hand-placed (LocalMap interpolates them piecewise) and carry ~10–45 px of
// noise on the 1024 px image; a leave-one-out check showed local residual correction does not beat
// the plain affine fit, so the affine is used as-is and walkable areas are carved around entities.
export function createWorldMap(world,{width=1024,height=512,scale=3}={}) {
  const fit=fitAffine(world.anchors);
  const toMap=(wx,wz)=>{const [x,y]=fit.toMap(wx,wz);return [x*scale,y*scale];};
  const toWorld=(px,py)=>fit.toWorld(px/scale,py/scale);
  const born=world.bornPos?.x!=null?toMap(world.bornPos.x,world.bornPos.z):[width*scale/2,height*scale/2];
  return {name:world.name,title:world.title??world.label,image:world.mapImage,imageWidth:width,imageHeight:height,scale,width:width*scale,height:height*scale,toMap,toWorld,born,fit,
    clamp:(x,y)=>[Math.min(width*scale-1,Math.max(0,x)),Math.min(height*scale-1,Math.max(0,y))]};
}
