// Preserve the grabbed point with continuous world coordinates at every zoom level.
export function homeFurnitureDragPosition(origin, start, current, scale) {
 return {
  x:origin.x+(current.sx-start.sx)/scale,
  y:origin.y+(current.sy-start.sy)/scale
 };
}
