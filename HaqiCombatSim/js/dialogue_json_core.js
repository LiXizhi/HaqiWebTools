// Extract one complete model object; prose/code fences after it are not JSON.
// Never merge extra objects or repair truncated reward/evaluation data.
export function parseDialogueJson(value){
    const text=String(value??'').trim();
    const start=text.indexOf('{');
    let depth=0,quoted=false,escaped=false;
    if(start>=0)for(let i=start;i<text.length;i++){
        const char=text[i];
        if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
        if(char==='"'){quoted=true;continue;}
        if(char==='{')depth++;
        if(char==='}'&&--depth===0){
            try{return JSON.parse(text.slice(start,i+1));}catch{break;}
        }
    }
    throw Error('对话回复格式不完整，请重试。');
}


// UI preview only; complete JSON still gates persistence and rewards.
export function dialogueReplyPreview(value){
    const text=String(value??''),match=/"reply"\s*:\s*"/.exec(text);
    if(!match)return '';
    let result='';
    for(let i=match.index+match[0].length;i<text.length;i++){
        const char=text[i];if(char==='"')break;
        if(char!=='\\'){result+=char;continue;}
        const escaped=text[++i];if(escaped===undefined)break;
        if(escaped==='u'){
            const hex=text.slice(i+1,i+5);if(!/^[0-9a-f]{4}$/i.test(hex))break;
            result+=String.fromCharCode(parseInt(hex,16));i+=4;
        }else{
            const chars={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};
            if(!Object.hasOwn(chars,escaped))break;result+=chars[escaped];
        }
    }
    return result;
}
