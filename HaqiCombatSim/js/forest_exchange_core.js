// Deliberately bounded dialogue intents: an item name alone is not a handover.
// No inference from substrings, and no English fallback for a missing target.
const LINES={
 en:{boots:['Here are the boots.','I found the boots.','Take these boots.','These boots are for you.','Here you are, the boots.'],note:['Here is the note.','I found the note.','Take this note.','This note is for you.','Here you are, the note.']},
 ja:{boots:['ブーツをどうぞ。','ブーツを見つけました。','このブーツを受け取ってください。','はい、ブーツです。'],note:['メモをどうぞ。','メモを見つけました。','このメモを受け取ってください。','はい、メモです。']},
 ko:{boots:['부츠 여기 있어요.','부츠를 찾았어요.','이 부츠를 받으세요.','부츠를 가져왔어요.'],note:['메모 여기 있어요.','메모를 찾았어요.','이 메모를 받으세요.','메모를 가져왔어요.','쪽지를 찾았어요.']},
 'zh-CN':{boots:['靴子给你。','这是靴子。','我找到靴子了。','我把靴子带来了。'],note:['便签给你。','这是便签。','我找到便签了。','我把便签带来了。','便条给你。']},
};
const normal=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/[.,!，。！、]/gu,'').replace(/\s+/gu,'').trim();
export function forestExchangeLines(save,word){return LINES[save.languageLearning?.target]?.[word]||null;}
export function forestExchangeMatches(save,word,text){return forestExchangeLines(save,word)?.some(line=>normal(line)===normal(text))||false;}
export function forestExchangeId(word,language){return `forest:camp-patrol-supplies:exchange-${word}:${language}:1`;}
