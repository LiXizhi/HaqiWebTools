import {createCardFace} from './view_adventure_card.js';
import {showHanziAnimation} from './view_hanzi_animation.js';
import {dictionaryEntryStatus,dictionaryDailyProgress,dictionarySpellingClue} from './dictionary_core.js';
import {searchDictionary,suggestDictionaryWords,suggestDictionaryForm,normalizeDictionarySearch} from './dictionary_search_core.js';
import {createDictionaryTutor} from './view_dictionary_tutor.js';
import {spellingScaffold,exampleTutorQuestion,formTutorQuestion} from './dictionary_tutor_core.js';
import {createCloseButton} from './view_adventure_controls.js';
import {createHanziWriting} from './view_hanzi_writing.js';
import {connectHanziAnimation} from './hanzi_animation_bridge.js';
import {displayLocale,learningPair,textFor} from './locale.js';
import {tr} from './locale_runtime.js';

const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
const button=(text,fn,cls='secondary')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
export function createDictionaryView(root,cb){
    let dismissPlayer=()=>{},disconnectAnimation=()=>{},animationSerial=0;
    const browsing=new Map(),tutorDrafts=new Map(),practiceDrafts=new Map();
    let tutorEntryButtons=[],attemptHelp=null,tutorKey=null,practiceKey=null,savePracticeDraft=()=>{};
    let dailyProgress=null,revealFocusedInput=()=>{};
    let shell,body,notice,completionHost,writing,frame,frameTrigger,tutor,revealEntry=()=>{},showMeaningAccepted=()=>{},showPracticeFeedback=()=>{},showWritingFeedback=()=>{},setContextBusy=()=>{},showContextFeedback=()=>{},setSpeechState=()=>{},setSpeechError=()=>false,setLearningStatus=()=>{},setRecordingState=()=>{},cleanup=()=>{};
    function dismissFrame(){dismissPlayer();dismissPlayer=()=>{};disconnectAnimation();disconnectAnimation=()=>{};if(!frame)return;frame.remove();frame=null;for(const child of shell.children){child.inert=false;child.removeAttribute('aria-hidden');}(body?.querySelector('.dictionary-completion button')||frameTrigger)?.focus({preventScroll:true});frameTrigger=null;}
    function clear(){dismissPlayer();dismissPlayer=()=>{};disconnectAnimation();disconnectAnimation=()=>{};tutorEntryButtons=[];attemptHelp=null;savePracticeDraft();savePracticeDraft=()=>{};practiceKey=null;if(tutor&&tutorKey)tutorDrafts.set(tutorKey,tutor.snapshot());tutorKey=null;dailyProgress=null;showMeaningAccepted=()=>{};showPracticeFeedback=()=>{};setRecordingState=()=>{};completionHost=null;setLearningStatus=()=>{};setSpeechState=()=>{};setSpeechError=()=>false;showContextFeedback=()=>{};setContextBusy=()=>{};showWritingFeedback=()=>{};revealEntry=()=>{};tutor=null;writing?.dispose();writing=null;frame?.remove();frame=null;cleanup();cleanup=()=>{};revealFocusedInput=()=>{};}
    function base(title,headExtra=null,onDismiss=cb.close){
        clear();shell=el('section','modal dictionary-shell');shell.lang='zh-CN';shell.setAttribute('role','dialog');shell.setAttribute('aria-modal','true');shell.setAttribute('aria-label','语言字典');shell.tabIndex=-1;
        const head=el('header','modal-header');head.append(el('h2','',title));if(headExtra)head.append(headExtra);head.append(createCloseButton(onDismiss,'关闭字典'));
        notice=el('p','dictionary-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
        body=el('div','modal-body dictionary-body');shell.append(head,notice,body);root.replaceChildren(shell);shell.focus();
        let resizeFrame=0;const currentBody=body;
        const keepInputVisible=()=>{
            cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{
                resizeFrame=0;const input=document.activeElement;
                if(!currentBody.isConnected||!currentBody.contains(input)||!input.matches('input,textarea')||input.closest('[inert]'))return;
                const bounds=currentBody.getBoundingClientRect(),rect=input.getBoundingClientRect(),viewport=window.visualViewport;
                const top=Math.max(bounds.top,viewport?.offsetTop||0)+8,bottom=Math.min(bounds.bottom,viewport?(viewport.offsetTop+viewport.height):window.innerHeight)-8;
                if(bottom<=top)return;
                const submit=input.nextElementSibling,submitRect=submit?.matches('button:not(:disabled)')&&!submit.hidden?submit.getBoundingClientRect():null;
                const end=submitRect&&submitRect.bottom-rect.top<=bottom-top?Math.max(rect.bottom,submitRect.bottom):rect.bottom;
                if(end>bottom)currentBody.scrollTop+=end-bottom;
                else if(rect.top<top)currentBody.scrollTop-=top-rect.top;
            });
        };
        revealFocusedInput=keepInputVisible;
        window.addEventListener('resize',keepInputVisible);window.visualViewport?.addEventListener('resize',keepInputVisible);
        cleanup=()=>{cancelAnimationFrame(resizeFrame);window.removeEventListener('resize',keepInputVisible);window.visualViewport?.removeEventListener('resize',keepInputVisible);};
        shell.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.stopPropagation();if(frame)dismissFrame();else onDismiss();}if(e.key==='Tab'){const nodes=[...(frame||shell).querySelectorAll('button,input,textarea,select,iframe,summary,a[href],[tabindex]')].filter(n=>{if(n.disabled||n.tabIndex<0||n.closest('[inert]')||!n.getClientRects().length)return false;for(let ancestor=n.parentElement;ancestor;ancestor=ancestor.parentElement){if(ancestor.tagName==='DETAILS'&&!ancestor.open&&!ancestor.querySelector(':scope > summary')?.contains(n))return false;}return true;});const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===shell)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
    }
    function message(text){if(notice)notice.textContent=text;}
    function choices(container,items,answer){const group=el('div','dictionary-choices');for(const text of items)group.append(button(text,()=>answer(text)));container.append(group);}
    function home({assets,battleCards=[],data,row,warning,now}){
        const saved=browsing.get(data.language)||{query:'',filter:'all',scroll:0,anchor:null};browsing.set(data.language,saved);
        const startTask=kind=>{saved.scroll=0;saved.anchor=null;cb.task(kind);};
        let battleOnly=false;
        const tabs=el('nav','gui-tabs dictionary-lang-tabs');
        const battleTab=button('战斗文字卡',()=>{battleOnly=true;list();body.scrollTop=0;for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab===battleTab));});battleTab.setAttribute('aria-pressed','false');tabs.append(battleTab);
        for(const [id,name] of [['zh','中文 · 汉字'],['en','英文 · Word']]){const b=button(name,()=>{saved.scroll=battleOnly?0:body.scrollTop;saved.anchor=null;cb.language(id);});b.setAttribute('aria-pressed',String(id===data.language));tabs.append(b);}
        base('字典',tabs);
        const hero=el('section','dictionary-hero'),p=row.plan,progress=dictionaryDailyProgress(p),nextKind=progress.next;
        hero.append(el('h3','sr-only',data.title),el('p','dictionary-daily-progress',`今日进度 ${progress.completed} / ${progress.total}`));
        if(nextKind)hero.append(button(p.completed.length||p.contextDone?'继续今日学习':'开始今日学习',()=>startTask(nextKind),'primary dictionary-start'));
        else hero.append(el('p','dictionary-done','今天的学习完成了。去冒险吧，也可以再翻翻喜欢的字词。'));
        body.append(hero);
        const tasks=el('div','dictionary-tasks');
        for(const [kind,title,ids] of [['review','温故知新',p.review],['fresh','认识新朋友',p.fresh],['context','今天会用了',[p.target]]]){
            const done=kind==='context'?Number(p.contextDone):ids.filter(id=>p.completed.includes(id)).length,card=el('article','dictionary-task');
            card.append(el('h3','',title),el('strong','',`${done} / ${ids.length}`));
            const go=button(ids.length?(done===ids.length?'今日已完成':'开始学习'):(kind==='review'?'暂无需复习':'已学完'),()=>startTask(kind),'dictionary-task-action');go.disabled=!ids.length||done===ids.length;card.append(go);tasks.append(card);
        }
        const more=el('details','dictionary-more');more.append(el('summary','','学习奖励'),button('查看语言加成与阶段奖励',cb.rewards));
        tasks.append(more);body.append(tasks);
        const battleShelf=el('section','dictionary-battle-shelf');
        battleShelf.append(el('h3','',`可进入战斗的文字卡 ${battleCards.length} / 10`),el('p','','中英合并的最近练习，最多 10 张。点击卡牌可继续练习。'));
        const cards=el('div','dictionary-battle-cards');
        for(const row of battleCards){
            const card=assets?.dataset.cards[row.baseCardKey];if(!card)continue;
            const base=assets.effects.cards[card.key]?.base,face=createCardFace({el:(tag,cls,...children)=>{const n=el(tag,cls);n.append(...children);return n;},name:row.title,cost:card.pipcost,cooldown:card.params.cooldown??0,description:row.description,
                draw:c=>assets.skillArt.drawCard(c,card,{name:row.title,description:row.description,cooldown:card.params.cooldown??0,wordCard:true}),retry:base?()=>assets.skillArt.ensure(base):undefined});
            const item=button('',()=>cb.wordEntry(row),'dictionary-battle-card');item.setAttribute('aria-label',`练习文字卡：${row.title}`);item.append(face);cards.append(item);
        }
        battleShelf.append(cards);if(!battleCards.length)battleShelf.append(el('p','dictionary-battle-empty','练习字词后，文字卡会出现在这里；不足 10 张时不会补入陌生字词。'));
        body.prepend(battleShelf);
        const search=el('input');search.type='search';search.enterKeyHint='search';search.placeholder=data.language==='zh'?'搜索汉字、拼音（如 shui）或词义':'搜索单词、中文词义或例句';search.setAttribute('aria-label','搜索字典');search.value=saved.query;
        const filters=el('nav','gui-tabs dictionary-filter-tabs'),grid=el('div','dictionary-grid'),results=el('p','dictionary-search-status');results.setAttribute('role','status');const clearSearch=()=>{search.value='';saved.query='';saved.anchor=null;list();search.focus();};const reset=button('清除搜索',clearSearch);let filter=saved.filter,suggestedMatches=false;
        const expandSearch=button('在全部条目中查看',()=>{filter='all';saved.filter='all';saved.anchor=null;for(const n of filters.children)n.setAttribute('aria-pressed',String(n===filters.firstElementChild));list();search.focus();});
        function list(){grid.replaceChildren();const q=search.value.trim(),searchChanged=hero.hidden!==!!q;for(const section of [hero,tasks,more])section.hidden=battleOnly||!!q;battleShelf.hidden=!battleOnly;for(const section of [toolbar,results,grid])section.hidden=battleOnly;if(searchChanged&&!battleOnly)revealFocusedInput();let rows=searchDictionary(data,q);const suggested=q&&!rows.length;suggestedMatches=!!suggested;if(suggested)rows=suggestDictionaryWords(data,q);const unfilteredCount=rows.length;if(filter==='due')rows=rows.filter(e=>dictionaryEntryStatus(row.entries[e.id],now).due);if(filter==='animation')rows=rows.filter(e=>e.animation);if(filter==='recent')rows=rows.filter(e=>row.entries[e.id]?.views>0).sort((a,b)=>row.entries[b.id].lastViewedAt-row.entries[a.id].lastViewedAt);
            const filteredEmpty=!!q&&!rows.length&&unfilteredCount>0&&filter!=='all';expandSearch.hidden=battleOnly||!filteredEmpty;
            results.textContent=filteredEmpty?`当前筛选下没有结果；全部条目中有 ${unfilteredCount} 个${suggested?'相近词':'匹配'}。`:suggested&&rows.length?'没有精确匹配。你想找的是不是：':q?`找到 ${rows.length} 个条目`:'';reset.hidden=!q;
            for(const e of rows){
                const entryRow=row.entries[e.id],status=dictionaryEntryStatus(entryRow,now),practiced=!!entryRow?.learned,mastery=practiced?Math.min(3,Math.max(1,(entryRow.stage||0)+1,entryRow.reviews||1)):0;
                const b=button('',()=>{saved.query=search.value;saved.filter=filter;saved.scroll=body.scrollTop;saved.anchor=e.id;cb.entry(e.id);},`dictionary-word secondary ${practiced?'is-collected':'is-unlearned'}${status.due?' is-due':''}`);
                b.dataset.entryId=e.id;b.dataset.mastery=String(mastery);
                const ornament=el('span','dictionary-card-ornament');ornament.setAttribute('aria-hidden','true');
                const pips=el('span','dictionary-card-pips');for(let i=0;i<3;i++)pips.append(el('i',i<mastery?'is-filled':'',i<mastery?'◆':'◇'));ornament.append(pips);
                if(e.animation)ornament.append(el('span','dictionary-animation-mark','✦'));
                const glyph=el('strong','dictionary-card-glyph',e.text);glyph.lang=data.language==='en'?'en':'zh-CN';
                b.append(ornament,glyph,el('small','dictionary-card-pronunciation',e.pronunciation),el('span','dictionary-card-meaning',e.meaning));
                const matchedForm=data.language==='en'&&!suggested&&(e.forms||[]).find(form=>normalizeDictionarySearch(form,'en')===normalizeDictionarySearch(q,'en'));if(matchedForm)b.append(el('small','dictionary-form-match',`词形：${matchedForm} → ${e.text}`));
                const suggestedForm=data.language==='en'&&suggested&&suggestDictionaryForm(e,q);if(suggestedForm)b.append(el('small','dictionary-form-match',`可能的词形：${suggestedForm} → ${e.text}`));
                const alternative=data.language==='en'&&(e.spellingAlternatives||[]).find(item=>normalizeDictionarySearch(item.text,'en')===normalizeDictionarySearch(q,'en'));if(alternative)b.append(el('small','dictionary-alternative-match',`相关表达：${alternative.text} → ${e.text}`));
                grid.append(b);
            }
            if(!rows.length&&!filteredEmpty)grid.append(el('p','dictionary-empty',!q&&filter==='due'?'现在没有到期的字词，可以认识新词或自由翻看。':!q&&filter==='recent'?'还没有查看记录，打开一个喜欢的字词吧。':'暂时没有找到。试试单个字、单词的一部分，或中文词义。'));}
        for(const [id,label] of [['all','全部条目'],['recent','最近查看'],['due','可以复习'],...(data.language==='zh'?[['animation','有动画']]:[])]){const b=button(label,()=>{filter=id;saved.filter=id;saved.anchor=null;for(const n of filters.children)n.setAttribute('aria-pressed',String(n===b));list();});b.setAttribute('aria-pressed',String(id===filter));filters.append(b);}
        search.onkeydown=event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='Escape'&&search.value){event.preventDefault();event.stopPropagation();clearSearch();return;}if(event.key!=='Enter'||!search.value.trim())return;event.preventDefault();const matches=grid.querySelectorAll('button.dictionary-word');if(matches.length===1&&!suggestedMatches)matches[0].click();else if(matches.length){matches[0].focus({preventScroll:true});matches[0].scrollIntoView({block:'nearest'});}};
        search.oninput=()=>{saved.query=search.value;saved.anchor=null;list();};
        const toolbar=el('div','dictionary-toolbar');toolbar.append(search,reset,filters);
        body.append(toolbar,results,expandSearch,grid);list();message(warning||'');body.scrollTop=saved.scroll;if(saved.anchor){const target=[...grid.children].find(n=>n.dataset.entryId===saved.anchor);target?.focus({preventScroll:true});}
    }
    function entry({data,speechRate=1,entry:e,tutorHistory=[],tutorMode,review,phase,mode,options,warning,views,progress,learning}){
        const learningNote=el('p','dictionary-learning-status');learningNote.setAttribute('role','status');
        base(data.language==='zh'?'汉字 · '+e.text:mode==='spell'?'Word · 回忆拼写':'Word · '+e.text,learningNote,cb.home);practiceKey=data.language+':'+e.id+':'+mode;const practiceDraft=practiceDrafts.get(practiceKey);
        if(progress)body.append(el('p','dictionary-daily-progress',`今日已完成 ${progress.completed} / ${progress.total} · 还剩 ${progress.remaining} 项`));
        setLearningStatus=value=>{learningNote.textContent=value?(['未练习','待初次练习'].includes(value.label)?value.label:value.label+' · '+value.detail):'';learningNote.title=value?.detail||'';};setLearningStatus(learning);
        if(practiceDraft)body.append(el('small','dictionary-draft-note','已恢复本次打开字典时的练习草稿，尚未提交。'));
        const layout=el('div','dictionary-entry'),copy=el('section',`dictionary-page dictionary-card-showcase ${data.language==='zh'?'is-zh':'is-en'}`),practice=el('section','dictionary-page dictionary-practice-panel');completionHost=practice;
        const exampleEl=el('p','dictionary-example',e.example);
        copy.append(el('div',data.language==='zh'?'dictionary-glyph':'dictionary-english',e.text),el('p','dictionary-pronunciation',e.pronunciation),el('h3','',e.meaning),exampleEl);
        if(e.translation)copy.append(el('p','dictionary-translation',e.translation));
        copy.querySelector('div').lang=data.language==='en'?'en':'zh-CN';exampleEl.lang=data.language==='en'?'en':'zh-CN';
        const distinctWords=(e.words||[]).filter(w=>w!==e.meaning&&w!==e.text);
        if(distinctWords.length){const wordsRow=el('p','dictionary-words');for(const w of distinctWords)wordsRow.append(el('span','dictionary-word-chip',w));copy.append(wordsRow);}
        if(e.coaching?.tip)copy.append(el('p','dictionary-memory-tip','✦ '+e.coaching.tip));
        const source=browsing.get(data.language),query=source?.query||'';
        const searchForm=data.language==='en'&&!progress&&source?.anchor===e.id&&((e.forms||[]).find(form=>normalizeDictionarySearch(form,'en')===normalizeDictionarySearch(query,'en'))||(!searchDictionary(data,query).length&&suggestDictionaryForm(e,query)));
        let formNote=null;
        if(searchForm&&e.formNotes?.[searchForm]){
            formNote=el('aside','dictionary-search-form-note');const explainForm=button('请小老师讲讲这个词形',()=>{tutor?.open({scroll:true});cb.tutor(formTutorQuestion(e,searchForm),'explain');});tutorEntryButtons.push(explainForm);const note=e.formNotes[searchForm],sample=el('blockquote','',note.example),translation=el('small','',note.translation);sample.lang='en';translation.lang='zh-CN';sample.append(translation);formNote.append(el('p','',note.explanation),sample,explainForm);formNote.hidden=review||phase==='recall'||mode==='spell';copy.append(formNote);
        }
        const alternative=data.language==='en'&&!progress&&source?.anchor===e.id&&(e.spellingAlternatives||[]).find(item=>normalizeDictionarySearch(item.text,'en')===normalizeDictionarySearch(query,'en'));
        if(alternative&&!formNote){formNote=el('aside','dictionary-search-form-note dictionary-search-alternative-note');formNote.append(el('p','',alternative.explanation));formNote.hidden=review||phase==='recall'||mode==='spell';copy.append(formNote);}
        const chunks=el('details','dictionary-example-chunks'),chunkButtons=[];let activeChunk=null;
        if(data.language==='en'&&e.exampleChunks?.length){
            chunks.append(el('summary','','读懂这句话'));const list=el('dl');
            for(const chunk of e.exampleChunks){const term=el('dt'),listen=button(chunk.text,()=>activeChunk===chunk.text?cb.stopSpeech():cb.tutorSpeak(chunk.text),'secondary dictionary-chunk-listen');term.lang='en';listen.setAttribute('aria-label','朗读短语：'+chunk.text);term.append(listen);chunkButtons.push({button:listen,text:chunk.text});list.append(term,el('dd','',chunk.meaning));}
            const explain=button('请小老师讲讲这句话',()=>{tutor?.open({scroll:true});cb.tutor(exampleTutorQuestion(e),'explain');});
            tutorEntryButtons.push(explain);
            chunks.append(list,explain);chunks.hidden=review||phase==='recall'||mode==='spell';copy.append(chunks);
        }
        revealEntry=()=>{if(formNote)formNote.hidden=false;chunks.hidden=false;exampleAudio.textContent='听例句';copy.querySelector(data.language==='zh'?'.dictionary-glyph':'.dictionary-english').textContent=e.text;copy.querySelector(data.language==='zh'?'.dictionary-glyph':'.dictionary-english').lang=data.language==='en'?'en':'zh-CN';for(const n of copy.querySelectorAll('h3,p'))n.hidden=false;exampleEl.textContent=e.example;};
        const audio=el('div','dictionary-audio'),wordAudio=button('听发音',cb.speak),exampleAudio=button((review||(data.language==='en'&&phase==='recall'))?'听例句提示':'听例句',cb.speakExample),stopAudio=button('停止朗读',cb.stopSpeech),audioStatus=el('small','dictionary-entry-audio-status');audioStatus.setAttribute('role','status');setSpeechError=text=>{audioStatus.textContent=text;return true;};stopAudio.hidden=true;
        const speed=el('select','dictionary-speech-rate');speed.setAttribute('aria-label','朗读速度');for(const [value,label] of [['1','正常速度'],['0.8','慢速朗读']]){const option=el('option','',label);option.value=value;speed.append(option);}speed.value=String(speechRate);speed.onchange=()=>{cb.speechRate(Number(speed.value));tutor?.speechRate(Number(speed.value));};
        audio.append(wordAudio,exampleAudio,stopAudio,speed);setSpeechState=(value,text,phase)=>{activeChunk=value?text:null;for(const item of chunkButtons){const current=value&&item.text===text;item.button.disabled=value&&!current;item.button.setAttribute('aria-label',(current?'停止朗读短语：':'朗读短语：')+item.text);item.button.setAttribute('aria-pressed',String(current));}wordAudio.disabled=value;exampleAudio.disabled=value;speed.disabled=value;stopAudio.hidden=!value;audioStatus.textContent=value?(phase==='playing'?'正在朗读…':'正在准备朗读…'):'';};copy.append(audio,audioStatus);
        if((review||phase==='recall')&&mode!=='spell'&&!(data.language==='zh'&&!review)){
            const hints=[...copy.querySelectorAll('h3,p')].filter(n=>!n.classList.contains('dictionary-pronunciation'));for(const n of hints)n.hidden=true;
            copy.append(button('查看词义提示',()=>{cb.hint();for(const n of hints)n.hidden=false;chunks.hidden=false;}));
        }
        if(data.language==='zh'&&e.coaching?.sourceUrl){const source=el('a','','查看字源资料（新窗口）');source.href=e.coaching.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';source.onclick=()=>cb.hint();const note=el('p','dictionary-source');note.append(source);copy.append(note);}
        if(e.animation)copy.append(button('有动画 · 看看这个字的故事',()=>{
            if(frame)return;writing?.pauseDemonstration();frameTrigger=document.activeElement;const holder=el('section','dictionary-film');
            const note=el('p','','动画正在加载。如未显示，可以关闭动画继续写字。');
            const iframe=el('iframe');iframe.title=e.text+'的动画故事';iframe.sandbox='allow-scripts allow-same-origin';iframe.referrerPolicy='no-referrer';iframe.src=e.animation;
            const uiLocale=displayLocale()||document.documentElement.lang||'zh-CN',pair=learningPair(),subLocale=pair?.enabled&&pair.target&&pair.target!=='zh-CN'?pair.target:uiLocale;
            const translate=(text,loc)=>loc&&loc!=='zh-CN'?(textFor(text,loc)!==text?textFor(text,loc):loc===uiLocale?tr(text):text):text;
            disconnectAnimation=connectHanziAnimation(iframe,{entryId:e.id,sessionId:`dictionary:${++animationSerial}`,locale:uiLocale,subtitleLocale:subLocale,translate,onWritten:()=>{note.textContent='笔顺完成了。';cb.animationWrite?.();},onComplete:()=>{}});
            iframe.onload=()=>{note.textContent='动画是艺术联想。关闭后可继续练习。';};iframe.onerror=()=>{note.textContent='动画暂不可用，关闭后仍可继续练习。';};holder.append(note);shell.append(holder);frame=holder;for(const child of shell.children)if(child!==holder){child.inert=true;child.setAttribute('aria-hidden','true');}dismissPlayer=showHanziAnimation(iframe,{close:dismissFrame});
        }));
        practice.append(el('h3','',phase==='learn'?'先认识，再试一试':mode==='write'?'按笔顺写一写':mode==='spell'?'回忆拼写':'选出它的意思'));
        const practiceFeedback=el('p','dictionary-practice-feedback');practiceFeedback.setAttribute('role','status');practiceFeedback.setAttribute('aria-live','polite');attemptHelp=button('请小老师讲讲',()=>{cb.explainAttempt();tutor?.returnAvailable(true);tutor?.open();});attemptHelp.hidden=true;practice.append(practiceFeedback,attemptHelp);showPracticeFeedback=text=>{practiceFeedback.textContent=text;attemptHelp.hidden=!text;if(!text)tutor?.returnAvailable(false);};
        if(data.language==='zh'){
            let meaningStep,meaningNote;if(mode==='meaning-write'){meaningStep=el('div');meaningNote=el('p','','先选词义，再完成书写。');meaningNote.setAttribute('role','status');meaningStep.append(meaningNote);choices(meaningStep,options,text=>cb.choice(text));practice.append(meaningStep);}
            const canvas=el('canvas','dictionary-writing');canvas.setAttribute('aria-label','用手指或鼠标按笔顺书写');practice.append(canvas);
            const progress=el('p','dictionary-writing-progress'),feedback=el('p','dictionary-writing-feedback'),repair=button('',()=>{}),inspectStroke=button('',()=>{}),repairTools=el('div','dictionary-tools');repairTools.append(inspectStroke,repair);repairTools.hidden=true;
            progress.setAttribute('role','status');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');repair.hidden=true;inspectStroke.hidden=true;
            let clearedStrokes=null,clearButton=null;
            const changed=count=>{cb.writeDraftChanged?.();if(count>0){clearedStrokes=null;if(clearButton)clearButton.textContent='清空';}progress.textContent=`已写 ${count} / ${e.strokes.medians.length} 笔`;feedback.textContent='';repair.hidden=true;inspectStroke.hidden=true;repairTools.hidden=true;nextStroke.disabled=count>=e.strokes.medians.length;};
            showMeaningAccepted=()=>{showPracticeFeedback('');if(!meaningStep)return;for(const b of meaningStep.querySelectorAll('button'))b.disabled=true;meaningNote.textContent='词义已答对，接下来按笔顺写一遍。';practice.querySelector('h3').textContent='按笔顺写一写';revealEntry();canvas.focus();};
            let demonstrating=false,demoPaused=false;const demoStatus=el('p','dictionary-demo-status'),demoButton=button('笔顺示范',()=>{if(demonstrating){writing.stopDemonstration();canvas.focus();}else{cb.hint();writing.demonstrate();}});demoStatus.setAttribute('role','status');
            const pauseDemo=button('暂停示范',()=>demoPaused?writing.resumeDemonstration():writing.pauseDemonstration());pauseDemo.hidden=true;
            const nextStroke=button('下一笔怎么写',()=>{cb.hint();writing.demonstrate({strokeIndex:writing.strokes.length});});
            writing=createHanziWriting(canvas,e.strokes,{hint:false,keyboard:true,preserveOnDemo:true,demoStrokeMs:650,onChange:changed,onDemo:(active,stroke,total,paused=false)=>{demonstrating=active;demoPaused=paused;pauseDemo.hidden=!active;pauseDemo.textContent=paused?'继续示范':'暂停示范';if(!active&&document.activeElement===pauseDemo)demoButton.focus({preventScroll:true});demoButton.textContent=active?'停止示范，继续写':'笔顺示范';demoStatus.textContent=active?`${paused?'已暂停在':'正在示范'}第 ${stroke} / ${total} 笔`:'示范已结束，可以接着写。';}});changed(0);
            if(practiceDraft?.strokes?.length)writing.restore(practiceDraft.strokes);const draftKey=practiceKey;savePracticeDraft=()=>{const strokes=writing.strokes;if(strokes.length)practiceDrafts.set(draftKey,{strokes});else practiceDrafts.delete(draftKey);};
            showWritingFeedback=value=>{feedback.textContent=value.message;repair.hidden=value.fromStroke===null;inspectStroke.hidden=repair.hidden;repairTools.hidden=repair.hidden;if(value.fromStroke!==null){inspectStroke.textContent=`看看第 ${value.fromStroke+1} 笔`;inspectStroke.onclick=()=>{canvas.scrollIntoView({block:'center'});canvas.focus({preventScroll:true});cb.hint();writing.demonstrate({strokeIndex:value.fromStroke});};repair.textContent=`从第 ${value.fromStroke+1} 笔重写`;repair.onclick=()=>{const count=writing.strokes.length;for(let i=value.fromStroke;i<count;i++)writing.undo();canvas.focus();};}};
            practice.append(progress,feedback,repairTools);
            let hintVisible=false;const hintButton=button('显示笔画提示',()=>{hintVisible=!hintVisible;if(hintVisible)cb.hint();writing.hint(hintVisible);hintButton.textContent=hintVisible?'隐藏笔画提示':'显示笔画提示';hintButton.setAttribute('aria-pressed',String(hintVisible));});hintButton.setAttribute('aria-pressed','false');
            clearButton=button('清空',()=>{if(clearedStrokes){const restore=clearedStrokes;clearedStrokes=null;writing.restore(restore);clearButton.textContent='清空';}else{const strokes=writing.strokes;if(!strokes.length){writing.clear();return;}clearedStrokes=strokes;writing.clear();clearButton.textContent='撤销清空';}});
            const tools=el('div','dictionary-tools');tools.append(demoButton,pauseDemo,nextStroke,hintButton,clearButton,button('撤销',()=>writing.undo()),button('完成书写',()=>cb.write(writing.strokes),'primary'));practice.append(tools,demoStatus);
        }else if(mode==='spell'){
            // Hide the spelling during recall; clues keep the meaning available.
            copy.querySelector('.dictionary-english').textContent='想一想这个词';copy.querySelector('.dictionary-english').lang='zh-CN';copy.querySelector('.dictionary-pronunciation').hidden=true;
            exampleEl.textContent=dictionarySpellingClue(e);
            const input=el('input');input.lang='en';input.autocapitalize='none';input.setAttribute('autocorrect','off');input.enterKeyHint='done';input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','英文拼写');input.maxLength=80;
            input.value=practiceDraft?.text||'';const draftKey=practiceKey;savePracticeDraft=()=>{if(input.value)practiceDrafts.set(draftKey,{text:input.value});else practiceDrafts.delete(draftKey);};
            const edited=()=>{showPracticeFeedback('');cb.spellDraftChanged?.();};input.oninput=edited;
            const submit=()=>cb.spell(input.value);input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229&&!input.disabled){event.preventDefault();submit();}};
            const spelling=el('div','dictionary-spelling'),submitButton=button('提交拼写',submit,'primary'),answer=el('section','dictionary-answer-hint');answer.hidden=true;
            const renderFeedback=showPracticeFeedback;
            showPracticeFeedback=text=>{
                const continuing=document.activeElement===input||document.activeElement===submitButton;
                renderFeedback(text);
                if(text&&continuing&&!input.disabled){input.focus({preventScroll:true});revealFocusedInput();}
            };
            let scaffoldStep=0;const scaffoldNote=el('p','dictionary-spelling-scaffold');scaffoldNote.setAttribute('role','status');scaffoldNote.hidden=true;
            const scaffold=button('给一点字母提示',()=>{cb.hint();const clue=spellingScaffold(e.text,++scaffoldStep);scaffoldNote.textContent=`开头是 ${clue.prefix}，后面还有 ${clue.remaining} 个字母。`;scaffoldNote.hidden=false;scaffold.disabled=clue.exhausted;scaffold.textContent=clue.exhausted?'字母提示已用完':'再提示一个字母';input.focus();});scaffold.hidden=[...e.text].length<2;
            const retry=button('收起答案，再试一次',()=>{answer.hidden=true;edited();scaffoldStep=0;scaffoldNote.textContent='';scaffoldNote.hidden=true;scaffold.hidden=[...e.text].length<2;scaffold.disabled=false;scaffold.textContent='给一点字母提示';input.disabled=false;submitButton.disabled=false;input.value='';input.focus();});
            answer.append(el('p','','这个词是'),el('strong','dictionary-english',e.text),retry);answer.querySelector('strong').lang='en';
            const reveal=button('查看答案',()=>{cb.hint();message('');edited();input.value='';input.disabled=true;submitButton.disabled=true;scaffoldNote.hidden=true;scaffold.hidden=true;answer.hidden=false;retry.focus();});
            spelling.append(input,submitButton,scaffold,reveal,scaffoldNote,answer);practice.append(spelling);
        }else if(phase==='learn'){
            practice.append(button('准备好了，试着回忆',cb.recall,'primary dictionary-recall'));
        }else choices(practice,options,cb.choice);
        layout.append(copy,practice);body.append(layout);tutorKey=data.language+':'+e.id;tutor=createDictionaryTutor(practice,cb.tutor,cb.tutorFallback,{...tutorDrafts.get(tutorKey),...(phase==='recall'&&tutorHistory.length?{open:false}:{}),history:tutorHistory,mode:tutorMode,language:data.language,speechRate,onSpeechRate:value=>{speed.value=String(value);cb.speechRate(value);},onSpeak:cb.tutorSpeak,onStop:cb.stopSpeech,onRetry:cb.tutorRetry,onReturn:()=>{const target=practice.querySelector('.dictionary-spelling input:not(:disabled),.dictionary-choices button:not(:disabled)');if(target){target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}}});message(warning||'');
    }
    function context({entry:e,question,options,online,warning,draft='',progress}){
        base('今天会用了',null,cb.home);if(progress)body.append(el('p','dictionary-daily-progress',`今日已完成 ${progress.completed} / ${progress.total} · 还剩 ${progress.remaining} 项`));body.append(el('p','dictionary-context',question),el('p','','目标字词：'+e.text+' · '+e.meaning));
        const feedback=el('p','dictionary-context-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');body.append(feedback);let feedbackText='';showContextFeedback=text=>{feedbackText=text||'';feedback.textContent=feedbackText?'小老师：'+feedbackText:'';};
        if(online){const answer=el('textarea');answer.maxLength=500;answer.rows=3;answer.placeholder='写下你的回答';answer.setAttribute('aria-label','情境题回答');answer.value=draft;const edited=()=>{if(feedbackText){feedback.textContent='上次回答的建议：'+feedbackText;revealFocusedInput();}cb.contextDraft(answer.value);};answer.oninput=edited;
            let recording='idle',judging=false,completed=false;
            const submit=button('提交回答',()=>cb.contextAnswer(answer.value),'primary'),record=button('语音输入',()=>recording==='recording'?cb.finishRecording():cb.record(text=>{answer.value=text;edited();})),cancelRecord=button('改用文字',cb.cancelRecording);
            const controls=()=>{answer.disabled=judging||completed||recording!=='idle';submit.disabled=answer.disabled;record.disabled=judging||completed||['starting','finishing'].includes(recording);record.textContent=recording==='recording'?'结束录音':recording==='starting'?'准备麦克风…':recording==='finishing'?'整理识别结果…':'语音输入';cancelRecord.hidden=recording==='idle';submit.textContent=completed?'回答已完成':judging?'正在理解…':'提交回答';};
            setContextBusy=(value,done=false)=>{const wasJudging=judging;judging=value;completed=done;controls();if(wasJudging&&!value&&!done){answer.focus();revealFocusedInput();}};setRecordingState=value=>{const previous=recording;recording=value;controls();if(value==='idle'&&previous!=='idle'&&!judging&&!completed){answer.focus();revealFocusedInput();}};controls();
            body.append(answer,submit,record,cancelRecord,button('改做选择题',cb.fallback));
        }else{if(draft){const saved=el('details','dictionary-context-draft');saved.open=true;saved.append(el('summary','','刚才的回答（仅保留在本次页面）'),el('blockquote','',draft),el('p','','刚才写的话留在这里供你回看。下面选择题答对后也能完成今天的任务。'));body.append(saved);}choices(body,options,cb.contextChoice);
            let pendingChoice=null;
            setContextBusy=(value,done=false)=>{const buttons=[...body.querySelectorAll('.dictionary-choices button')];if(value)pendingChoice=buttons.find(b=>b===document.activeElement)||null;for(const b of buttons)b.disabled=value||done;if(!value&&!done)pendingChoice?.focus();};
        }
        message(warning||'');
    }
    return {home,entry,context,message,speechError:text=>setSpeechError(text),tutorSpeechError:(text,feedback)=>tutor?.speechError(text,feedback)||false,practiceFeedback:text=>showPracticeFeedback(text),meaningAccepted:()=>showMeaningAccepted(),recordingState:value=>setRecordingState(value),learningStatus:value=>setLearningStatus(value),dailyProgress:p=>{dailyProgress=p;for(const n of body.querySelectorAll('.dictionary-daily-progress'))n.textContent=p.remaining?`今日已完成 ${p.completed} / ${p.total} · 还剩 ${p.remaining} 项`:`今日 ${p.total} 项已完成`;},speechState:(value,text,phase)=>{setSpeechState(value,text,phase);tutor?.speechState(value,text,phase);},contextBusy:(value,done)=>{if(value)showContextFeedback('');setContextBusy(value,done);},contextFeedback:text=>showContextFeedback(text),writingFeedback:value=>showWritingFeedback(value),tutorMode:value=>tutor?.mode(value),tutorInterrupted:question=>{if(attemptHelp)attemptHelp.disabled=false;for(const b of tutorEntryButtons)b.disabled=false;tutor?.interrupted(question);},tutorPending:(text,options)=>{if(attemptHelp)attemptHelp.disabled=true;for(const b of tutorEntryButtons)b.disabled=true;tutor?.pending(text,options);},tutorRepairing:()=>tutor?.repairing(),tutorPreview:text=>tutor?.preview(text),tutorReply:value=>{if(attemptHelp)attemptHelp.disabled=false;for(const b of tutorEntryButtons)b.disabled=false;tutor?.reply(value);},success(text,{saved=true}={}){
        if(saved){savePracticeDraft=()=>{};practiceDrafts.delete(practiceKey);body.querySelector('.dictionary-draft-note')?.remove();}body.querySelector('.dictionary-completion')?.remove();showWritingFeedback({message:'笔顺完成了。',fromStroke:null});revealEntry();message('');showPracticeFeedback('');writing?.disable(true);
        for(const b of body.querySelectorAll('.dictionary-choices button,.dictionary-tools button,.dictionary-spelling input,.dictionary-spelling button'))b.disabled=true;
        const panel=el('section','dictionary-completion'),result=el('p','',text),next=button(!saved?'重试保存':dailyProgress?.remaining===0?'查看今日成果':'继续今日任务',!saved?cb.retrySave:cb.next,'primary');result.setAttribute('role','status');panel.append(result);if(saved&&dailyProgress?.remaining===0)panel.append(el('p','dictionary-done','今天的学习完成了。可以去冒险，也可以继续自由翻看字典。'));panel.append(next);if(!saved)panel.append(button('返回今日任务',cb.home));
        if(completionHost)completionHost.prepend(panel);else body.append(panel);
        if(!frame&&!document.activeElement?.closest('.dictionary-tutor'))next.focus();
    },close(){clear();tutorDrafts.clear();practiceDrafts.clear();root.replaceChildren();},suspend(){writing?.pauseDemonstration();dismissFrame();}};
}
