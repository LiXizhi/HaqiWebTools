// Walkable mask derived from the CDN island map (sea, parchment, clouds and transparent pixels block),
// carved open around every gameplay point so nothing sits in an unreachable pocket.
// Optional hand-tuned override: assets/masks/<world>.png where red pixels block and green pixels open.
export function classifyPixel(r,g,b,a) {
  if(a<100)return 0;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max-min;
  if(b>g&&b>r+25&&b>120)return 0;                       // sea / lakes
  if(r>170&&g>140&&b<175&&r-b>35&&sat<130&&g>b)return 0;  // parchment scroll
  if(r>225&&g>225&&b>225)return 0;                       // clouds and snow caps
  if(max<40)return 0;                                    // shadows / border ink
  return 1;
}
export function buildMask(pixels,width,height,classify=classifyPixel) {
  const mask=new Uint8Array(width*height);
  for(let i=0;i<width*height;i++)mask[i]=classify(pixels[i*4],pixels[i*4+1],pixels[i*4+2],pixels[i*4+3]);
  return mask;
}
export function carve(mask,width,height,points,radius) {
  for(const [px,py] of points){const cx=Math.round(px),cy=Math.round(py);for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){if(x*x+y*y>radius*radius)continue;const mx=cx+x,my=cy+y;if(mx>=0&&my>=0&&mx<width&&my<height)mask[my*width+mx]=1;}}
  return mask;
}
export function applyOverride(mask,width,height,pixels) {
  for(let i=0;i<width*height;i++){const r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2],a=pixels[i*4+3];if(a<100)continue;if(r>150&&g<100&&b<100)mask[i]=0;else if(g>150&&r<100&&b<100)mask[i]=1;}
  return mask;
}
export function createCollision(mask,width,height,scale) {
  const walkable=(x,y)=>{const mx=Math.floor(x/scale),my=Math.floor(y/scale);if(mx<0||my<0||mx>=width||my>=height)return false;return mask[my*width+mx]===1;};
  // Axis-separated slide so the player glides along coastlines instead of sticking.
  const move=(x,y,dx,dy,radius=4)=>{
    const clear=(nx,ny)=>walkable(nx,ny)&&walkable(nx-radius,ny)&&walkable(nx+radius,ny)&&walkable(nx,ny+radius)&&walkable(nx,ny-radius*.5);
    let nx=x,ny=y;
    if(dx&&clear(x+dx,y))nx=x+dx;
    if(dy&&clear(nx,y+dy))ny=y+dy;
    return [nx,ny];
  };
  return {walkable,move,mask,width,height,scale};
}
export function readPixels(image,width,height) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,width,height);
  return ctx.getImageData(0,0,width,height).data;
}
