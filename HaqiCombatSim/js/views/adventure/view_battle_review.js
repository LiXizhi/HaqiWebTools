// Product visibility rule: only a defeat with substantive recorded content
// offers a review. Frame counts and missing-data notices are not review content.
export function defeatReviewNotes(review,winner){
    if(winner!=='far'||!review||review.result==='win'||review.result==='draw')return [];
    return [...new Set([
        ...(review.diagnoses||[]).slice(0,3).map(item=>item.text),
        ...(review.presentation?.highlights||[]),
        review.presentation?.detail,
    ].filter(text=>typeof text==='string'&&text.trim()).map(text=>text.trim()))];
}

export function renderDungeonWatchRetry(story,el){
    if(!story)return null;
    const details=el('details','battle-watch-retry',el('summary','','和茜茜想想下一步'),
        el('p','',story.reply),el('p','',story.tip),el('p','',story.recovery),el('p','',story.progress));
    details.dataset.storyId=story.id;
    return details;
}
