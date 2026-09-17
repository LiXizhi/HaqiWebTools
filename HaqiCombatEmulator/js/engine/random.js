// Explicit per-battle random state. Deterministic in Node and browser workers.
export function seedNumber(value) {
  let h=2166136261;
  for(const c of String(value)) h=Math.imul(h^c.charCodeAt(0),16777619);
  return h>>>0;
}
export function rng(seed) {return {state:seedNumber(seed),draws:0};}
export function randomInt(r, min, max) {
  if(!Number.isInteger(min)||!Number.isInteger(max)||max<min) throw new Error('Invalid random bounds');
  r.state=(r.state+0x6D2B79F5)>>>0;
  let t=r.state;
  t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
  r.draws++;
  return min+Math.floor(((t^(t>>>14))>>>0)/4294967296*(max-min+1));
}
export function shuffle(cards,r) {
  // Original Player:ShuffleDeck assigns random weights, descending.
  return cards.map((key,i)=>({key,i,w:randomInt(r,1,999999)})).sort((a,b)=>b.w-a.w||a.i-b.i).map(x=>x.key);
}
