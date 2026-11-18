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
