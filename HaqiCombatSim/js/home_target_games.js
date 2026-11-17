import {canonicalWord} from './word_lexicon_core.js';

// Separate authored beginner lessons share the existing art, action bindings and
// evidence checks. English curriculum IDs and progress are never translated.
export const HOME_TARGET_WORDS=`书|本|책
椅子|椅子|의자
桌子|テーブル|탁자
球|ボール|공
杯|カップ|컵
水|水|물
坐|座る|앉아요
睡觉|寝る|자요
吃|食べる|먹어요
喝|飲む|마셔요
玩|遊ぶ|놀아요
读|読む|읽어요
走路|歩く|걸어요
跑|走る|달려요
站|立つ|서요
跳|ジャンプ|점프
开|開ける|열어요
关|閉める|닫아요
画|描く|그려요
旁边|隣|옆
一|一つ|하나
二|二つ|둘
三|三つ|셋
四|四つ|넷
五|五つ|다섯
六|六つ|여섯
七|七つ|일곱
八|八つ|여덟
九|九つ|아홉
十|十個|열`.split('\n').map(line=>line.split('|'));

export function homeTargetGames(index){
 const language=index.language;if(!['ja','ko','zh'].includes(language))throw Error('家园课程语言不支持');
 const column=language==='ja'?1:language==='ko'?2:0;
 const text=key=>HOME_TARGET_WORDS.find(row=>row[0]===key)?.[column];
 const games=[];
 const finalConsonant=word=>(word.codePointAt(word.length-1)-0xac00)%28!==0;
 const object=word=>word+(finalConsonant(word)?'을':'를');
 const copula=word=>word+(finalConsonant(word)?'이에요':'예요');
 function add(id,mode,key,action,prompt,answer,extra={}){
  const word=canonicalWord(index,text(key));if(!word)throw Error('家园课程缺少所选语言词条：'+key);
  games.push({id:`${language}-home-${id}`,mode,words:[word],action,
   intro:`和伙伴一起完成家园的小任务。本轮词语：${text(key)}（${key}）。先回应，再实际完成动作。`,
   opening:'和我一起玩一会儿吧。',prompt,answer,
   reply:language==='ja'?'ありがとう。一緒にやってみよう！':language==='ko'?'고마워요. 같이 해 봐요!':'谢谢，一起试试吧！',
   introduces:[{word,meaning:key}],...extra});
 }
 const line=(ja,ko,zh)=>language==='ja'?ja:language==='ko'?ko:zh;
 const action=(kind,itemIds,extra={})=>({kind,itemIds,...extra});
 const objects=[['book','书'],['chair','椅子'],['table','桌子'],['ball','球'],['cup','杯']];
 for(const [id,key] of objects){const noun=text(key);
  const answer=line(`これは${noun}です。`,`이것은 ${copula(noun)}.`,`这是${noun}。`);
  add(`find-${id}`,'find',key,action('find',[id]),line('これは何ですか？','이것은 무엇인가요?','这是什么？'),answer);
  add(`arrange-${id}`,'arrange',key,action('move',[id]),line(`${noun}を動かしてください。`,`${object(noun)} 옮겨 주세요.`,`请移动${noun}。`),line(`${noun}を動かします。`,`${object(noun)} 옮길게요.`,`我来移动${noun}。`));
  add(`write-${id}`,'write',key,action('label',[id]),line('名前を書いてください。','이름을 써 주세요.','请写出物品名称。'),noun);
  for(const mode of ['read','listen'])add(`${mode}-${id}`,mode,key,action('find',[id]),line(`${noun}を見つけてください。`,`${object(noun)} 찾아 주세요.`,`请找到${noun}。`),answer,{introduces:undefined,intro:mode==='listen'?'听伙伴的请求，在两件真实物品中做出选择。':'读伙伴的请求，在两件真实物品中做出选择。',opening:'帮我找件物品吧。'});
 }
 add('talk-book','talk','书',action('talk',['book','chair']),line('これは何ですか？','이것은 무엇인가요?','这是什么？'),line('これは本です。','이것은 책이에요.','这是书。'),{replyGloss:'谢谢你告诉我，我们一起看看吧。'});
 const motions=[['walk','走路','椅子まで歩く。','의자까지 걸어요.','走到椅子旁。'],['run','跑','椅子まで走る。','의자까지 달려요.','跑到椅子旁。'],['stand','站','椅子のそばに立つ。','의자 옆에 서요.','站到椅子旁。'],['jump','跳','ジャンプしてください。','점프!','跳一下。']];
 for(const [mode,key,ja,ko,zh] of motions)add(mode,mode,key,action(mode,['chair','table']),line('何をしますか？','무엇을 할까요?','你准备做什么？'),line(ja,ko,zh));
 for(const [id,key,open] of [['open','开',true],['close','关',false]])add(`door-${id}`,'door',key,action('door',['build-wood-door','build-stone-door'],{open}),line('ドアをどうしますか？','문을 어떻게 할까요?','你准备怎样操作这扇门？'),line(`ドアを${text(key)}。`,`문을 ${text(key)}.`,`${text(key)}门。`));
 add('draw','draw','画',action('draw',['paper']),line('何をしますか？','무엇을 할까요?','你准备做什么？'),line('絵を描く。','그림을 그려요.','画一幅画。'));
 const care=[['sit','坐',['chair']],['sleep','睡觉',['bed']],['eat','吃',['bread-basket','table']],['drink','喝',['cup','kettle']],['ball','玩',['ball']],['read','读',['book']]];
 for(const [activity,key,ids] of care)add(`care-${activity}`,'care',key,action('pet-use',ids,{activity}),line('一緒に何をしますか？','같이 무엇을 할까요?','我们一起做什么？'),line(`一緒に${text(key)}。`,`같이 ${text(key)}.`,`一起${text(key)}。`));
 for(const turn of [0,1])add(`turn-sit-${turn}`,'turn','坐',action('pet-use',['chair'],{activity:'sit'}),line('一緒に座る？','같이 앉아요?','一起坐下吗？'),line('一緒に座る。','같이 앉아요.','一起坐。'),{pair:`${language}-home-sit`,turn});
 for(let amount=1;amount<=10;amount++){
  const key=HOME_TARGET_WORDS[HOME_TARGET_WORDS.length-11+amount][0],number=text(key);
  add(`count-${amount}`,'count',key,action('find',['book']),line('本はいくつありますか？','책은 몇 권인가요?','这里有多少本书？'),line(`${number}です。`,`${copula(number)}.`,`${number}本。`),{count:{amount,target:'quantity',spokenNumber:number}});
 }
 add('place-next-to','place','旁边',action('move',['ball']),line('ボールを椅子の隣に置いてください。','공을 의자 옆에 놓아 주세요.','把球放到椅子旁边。'),line('椅子の隣に置きます。','의자 옆에 놓을게요.','放到椅子旁边。'),{position:{kind:'next to',anchorItemIds:['chair']}});
 return {version:1,language,policy:{maxNewWordsPerVisit:2},games,arcs:[]};
}
