export const DEFAULT_DECK_CAPACITY=40;
export const MAX_CARD_COPIES=6;
// Uniform sampling without replacement: probability of at least one copy.
export function openingChance(total,copies,draws){
  if(![total,copies,draws].every(Number.isInteger)||total<0||copies<0||copies>total||draws<0)throw new Error('无效抽牌概率参数');
  draws=Math.min(draws,total);if(!total||!copies||!draws)return 0;
  if(draws>total-copies)return 1;
  let miss=1;for(let i=0;i<draws;i++)miss*=(total-copies-i)/(total-i);
  return 1-miss;
}
