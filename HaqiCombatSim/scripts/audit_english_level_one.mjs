import fs from 'node:fs';
import {homeComprehensionExposesTarget} from '../js/home_language_game_core.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildWordIndex,parseWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';

// Author supply only. Never reads player records or grants learning evidence.
export function auditEnglishLevelOne(curriculum,home,courses,index){
 const issues=[],games=new Map(),steps=new Map();
 for(const game of home.games){if(games.has(game.id))issues.push(`重复家园身份：${game.id}`);else games.set(game.id,game);}
 for(const course of courses.courses.filter(c=>c.language==='en'))for(const step of course.steps||[]){
  const id=`${course.id}/${step.id}`;if(steps.has(id))issues.push(`重复岛屿步骤：${id}`);else steps.set(id,{course,step});
 }
 const targets=(words,id)=>{const found=[];for(const word of words||[]){const target=canonicalWord(index,word);if(!target)issues.push(`未规范化目标：${id}/${word}`);else found.push(target);}return new Set(found);};
 const gameTargets=new Map([...games].map(([id,g])=>[id,targets(g.words,id)]));
 const stepTargets=new Map([...steps].map(([id,{step}])=>[id,targets(step.words,id)]));
 const words=curriculum.words.map(word=>{
  const id=word.entryId,homeIds=[...gameTargets].filter(([,ids])=>ids.has(id)).map(([key])=>key),islandIds=[...stepTargets].filter(([,ids])=>ids.has(id)).map(([key])=>key);
  const checkRef=(ref,kind)=>{
   const key=kind==='home'?ref.storyId:`${ref.courseId}/${ref.stepId}`,map=kind==='home'?gameTargets:stepTargets;
   if(!map.get(key)?.has(id))issues.push(`失效词条引用：${id} → ${kind}:${key}`);
   if(kind==='home'&&ref.file!=='data/adventure/curriculum/english-home-practice.json')issues.push(`未知家园来源：${id} → ${ref.file}`);
  };
  const refs=word.coverage?.homeVariants||[],registered=new Set(refs.map(r=>r.storyId));
  if(registered.size!==refs.length)issues.push(`重复家园引用：${id}`);
  refs.forEach(ref=>checkRef(ref,'home'));
  homeIds.filter(key=>!registered.has(key)).forEach(key=>issues.push(`遗漏家园引用：${id} → ${key}`));
  const existing=word.existingSteps||[],registeredSteps=new Set(existing.map(r=>`${r.courseId}/${r.stepId}`));
  if(registeredSteps.size!==existing.length)issues.push(`重复岛屿引用：${id}`);
  existing.forEach(ref=>checkRef(ref,'island'));
  islandIds.filter(key=>!registeredSteps.has(key)).forEach(key=>issues.push(`遗漏岛屿引用：${id} → ${key}`));
  if(word.coverage?.authoredIntroduction){const ref=word.coverage.authoredIntroduction;checkRef(ref,ref.storyId?'home':'island');}
  const selected=homeIds.map(key=>games.get(key)),modes=[...new Set(selected.map(g=>g.mode))].sort();
  const listening=selected.filter(g=>g.mode==='listen'||g.listenAction===true).map(g=>g.id),reading=selected.filter(g=>g.mode==='read').map(g=>g.id),writing=selected.filter(g=>g.mode==='write').map(g=>g.id);
  const uncuedListening=listening.filter(id=>!homeComprehensionExposesTarget(games.get(id),index)),uncuedReading=reading.filter(id=>!homeComprehensionExposesTarget(games.get(id),index));
  const introductions=selected.filter(g=>g.introduces?.some(w=>canonicalWord(index,w.word)===id)).map(g=>g.id);
  const visualNaming=selected.filter(g=>g.bodyRecall===true&&g.mode==='find'&&g.action?.bodyPart===id).map(g=>g.id);
  const gaps=[];
  if(!islandIds.length)gaps.push('无岛屿明确目标');
  if(!homeIds.length)gaps.push('无家园作者情境');
  if(!introductions.length&&!word.coverage?.authoredIntroduction)gaps.push('无登记首次教学');
  if(homeIds.length<12)gaps.push(`家园机会少于12（${homeIds.length}）`);
  if(!listening.length)gaps.push('无独立听后选择作者情境');
  if(!reading.length)gaps.push('无独立读后选择作者情境');
  if(listening.length&&!uncuedListening.length)gaps.push('听力开场直接提示目标，需改写');
  if(reading.length&&!uncuedReading.length)gaps.push('阅读开场直接提示目标，需改写');
  if(!writing.length)gaps.push('无标签写作作者情境');
  // Modes/arc IDs do not prove distinct everyday contexts or separated visits.
  gaps.push('四次会话与三种生活情境待逐词审核','无提示主动表达与四技能迁移待教学验证');
  return {id:word.id,entryId:id,word:word.word,meaning:word.meaning,homeOpportunities:homeIds.length,homeIds,islandIds,introductions,modes,listening,reading,uncuedListening,uncuedReading,guidedWriting:writing,visualNaming,gaps};
 });
 return {version:1,scope:'英语 L1 作者内容供给；不是玩家熟练度或教学验收',complete:false,
  summary:{coreWords:words.length,homeGames:games.size,homeCovered:words.filter(w=>w.homeIds.length).length,islandCovered:words.filter(w=>w.islandIds.length).length,atLeast12HomeOpportunities:words.filter(w=>w.homeOpportunities>=12).length,listeningSupplied:words.filter(w=>w.listening.length).length,readingSupplied:words.filter(w=>w.reading.length).length,uncuedListeningSupplied:words.filter(w=>w.uncuedListening.length).length,uncuedReadingSupplied:words.filter(w=>w.uncuedReading.length).length,guidedWritingSupplied:words.filter(w=>w.guidedWriting.length).length,visualNamingSupplied:words.filter(w=>w.visualNaming.length).length},
  issues,words};
}

export function renderEnglishLevelOneAudit(report){
 const s=report.summary,lines=['# 英语 L1 逐词内容供给检查','',`本报告由 \`node scripts/audit_english_level_one.mjs\` 从正式 JSON 生成。只统计明确目标，不把台词里的顺带出现算教学；不同玩法不自动算不同生活情境。`,'',
 `当前：${s.coreWords} 个核心词，${s.homeGames} 个家园情境；家园覆盖 ${s.homeCovered} 词，岛屿明确目标覆盖 ${s.islandCovered} 词。${s.atLeast12HomeOpportunities} 词具备至少12个不同家园作者机会。`,'',
 `听后选择玩法供给 ${s.listeningSupplied} 词，读后选择玩法供给 ${s.readingSupplied} 词，标签写作供给 ${s.guidedWritingSupplied} 词。听读仍需真实可辨认选项，写作仍可能有示范；这些不是孩子已经通过的能力。`,'',
 `其中作者开场与说明未直接出现目标英文或中文词义的听后选择覆盖 ${s.uncuedListeningSupplied} 词、读后选择覆盖 ${s.uncuedReadingSupplied} 词。仅为静态词义提示检查，仍需实际选项、物品标签及语义线索审核；不证明独立理解。`,'',
 `看图自主命名供给 ${s.visualNamingSupplied} 词，支持说出或输入；提示使用和重试单独记录。此数值不是已通过的独立表达能力，也不代替跨图迁移。`,'',
 '**完整 L1 尚未证明完成。** 四次会话、三种生活情境、无提示主动表达、独立四技能迁移及儿童体验均需进一步逐词验证。文字卡和跟说入口不代替这些证据。','',
 '## 数据引用问题','',...(report.issues.length?report.issues.map(x=>`- ${x}`):['未发现失效、遗漏或重复的逐词作者引用。']),'','## 逐词缺口','',
 '| 词 | 家园机会 | 岛屿步骤 | 听后选择 | 读后选择 | 标签写作 | 看图命名 | 供给缺口（所有词另需会话、情境及教学验证） |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |'];
 for(const w of report.words)lines.push(`| ${w.word} | ${w.homeOpportunities} | ${w.islandIds.length} | ${w.listening.length} | ${w.reading.length} | ${w.guidedWriting.length} | ${w.visualNaming.length} | ${w.gaps.slice(0,-2).join('；')||'数量指标有供给，仍待质量验证'} |`);
 return lines.join('\n')+'\n';
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url)),read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
 const index=buildWordIndex(parseWordLexicon(fs.readFileSync(path.join(root,'data/adventure/locale/word_en.txt'),'utf8'),'en'));
 const report=auditEnglishLevelOne(read('data/adventure/curriculum/english-level-one.json'),read('data/adventure/curriculum/english-home-practice.json'),read('data/adventure/island-language-courses.json'),index);
 const markdown=renderEnglishLevelOneAudit(report),target=path.join(root,'docs/curriculum/en-l1-coverage-report.md');
 if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8').replaceAll('\r\n','\n')!==markdown){console.error('逐词供给报告已过期，请先运行 audit_english_level_one.mjs');process.exitCode=1;}}
 else fs.writeFileSync(target,markdown);
 fs.mkdirSync(path.join(root,'tmp'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/english-level-one-audit.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report.summary));
 if(report.issues.length){console.error(report.issues.join('\n'));process.exitCode=1;}
 if(process.argv.includes('--require-complete')){console.error('完整课程未通过：内容数量检查不能代替会话、情境和教学证据。');process.exitCode=1;}
}
