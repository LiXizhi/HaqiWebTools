// Search normalization is independent of spelling-answer normalization.
export function normalizeDictionarySearch(value,language){
    let text=String(value??'').normalize('NFKC').toLowerCase().trim();
    // Copying a word from a sentence often includes quotes or punctuation.
    // Strip only the edges; apostrophes and hyphens inside words stay meaningful.
    text=text.replace(/^[\s"'\p{Ps}\p{Pe}\p{Pi}\p{Pf},.!?。！？:;]+|[\s"'\p{Ps}\p{Pe}\p{Pi}\p{Pf},.!?。！？:;]+$/gu,'');
    if(language==='zh')text=text.replace(/u:|v/g,'ü').normalize('NFD').replace(/[\u0300\u0301\u0304\u030c]/g,'').normalize('NFC').replace(/([a-zü])[1-5](?=\s|$)/g,'$1');
    return text.replace(/\s+/g,' ');
}
export function searchDictionary(data,query){
    const q=normalizeDictionarySearch(query,data.language);if(!q)return String(query??'').trim()?[]:[...data.entries];
    const terms=q.split(' '),normalize=value=>normalizeDictionarySearch(value,data.language);
    return data.entries.map((entry,index)=>{
        const word=normalize(entry.text),pronunciation=normalize(entry.pronunciation),meaning=normalize(entry.meaning);
        const forms=(entry.forms||[]).map(normalize),alternatives=data.language==='en'?(entry.spellingAlternatives||[]).map(item=>normalize(item.text)):[];
        const fields=[word,pronunciation,meaning,...forms,...alternatives.filter(value=>value===q),...(entry.words||[]).map(normalize),normalize(entry.example),normalize(entry.translation)];
        if(!terms.every(term=>fields.some(field=>field.includes(term))))return null;
        const rank=word===q?0:forms.includes(q)||alternatives.includes(q)||pronunciation===q?1:word.startsWith(q)?2:meaning===q?3:4;
        return {entry,index,rank};
    }).filter(Boolean).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(row=>row.entry);
}

// A suggestion is never an answer correction. Limit to one missing, extra,
// replaced or adjacent-swapped letter in a single English search term.
export function suggestDictionaryWords(data,query){
    const q=normalizeDictionarySearch(query,data.language);
    if(data.language!=='en'||!/^[a-z]{3,32}$/.test(q)||searchDictionary(data,q).length)return [];
    return data.entries.filter(entry=>nearSearchWord(normalizeDictionarySearch(entry.text,'en'),q)||suggestDictionaryForm(entry,q)).slice(0,3);
}
function nearSearchWord(word,q){
        if(Math.abs(word.length-q.length)>1)return false;
        let i=0;while(i<Math.min(q.length,word.length)&&q[i]===word[i])i++;
        if(q.length===word.length)return q.slice(i+1)===word.slice(i+1)||(q[i]===word[i+1]&&q[i+1]===word[i]&&q.slice(i+2)===word.slice(i+2));
        return q.length<word.length?q.slice(i)===word.slice(i+1):q.slice(i+1)===word.slice(i);
}
export function suggestDictionaryForm(entry,query){
    const q=normalizeDictionarySearch(query,'en');
    if(!/^[a-z]{3,32}$/.test(q))return '';
    return (entry.forms||[]).find(form=>nearSearchWord(normalizeDictionarySearch(form,'en'),q))||'';
}

