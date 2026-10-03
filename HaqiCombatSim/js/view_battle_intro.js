import {monsterGearScore} from './combat_power_core.js';
import {drawSchoolIcon} from './card_renderer.js';
import {tr,fill} from './locale_runtime.js';

const SCHOOLS={fire:['烈火','#ff9a59'],ice:['寒冰','#85dbf7'],storm:['风暴','#c5a0ff'],life:['生命','#9ae2aa'],death:['死亡','#c699ee']};
const element=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=tr(text);return n;};
export function createBattleIntroView(root,{skip}){
    let screen,rows=[],assets,skipButton;
    return {
        open(model){
            assets=model.assets;rows=[];
            root.classList.add('visible','battle-intro-overlay');
            screen=element('section','battle-intro-screen');screen.dataset.count=String(model.roster.length);screen.style.setProperty('--count',model.roster.length);
            screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label',tr('对手登场'));screen.tabIndex=-1;
            const header=element('header','battle-intro-heading');
            header.append(element('p','battle-intro-eyebrow','魔法对决'),element('h2','','对手登场'));
            const lineup=element('div','battle-intro-lineup');
            for(const [index,row]of model.roster.entries()){
                const [school,color]=SCHOOLS[row.school]||['未知系别','#e3d7bb'];
                const panel=element('article','battle-intro-opponent');panel.style.setProperty('--school',color);panel.style.setProperty('--side',index%2?1:-1);
                const ordinal=element('span','battle-intro-number',String(index+1).padStart(2,'0'));ordinal.setAttribute('aria-hidden','true');
                const portrait=element('canvas','battle-intro-portrait');portrait.width=512;portrait.height=512;portrait.setAttribute('aria-hidden','true');
                const banner=element('div','battle-intro-banner');
                const icon=element('canvas','battle-intro-school');icon.width=64;icon.height=64;icon.setAttribute('aria-hidden','true');drawSchoolIcon(icon.getContext('2d'),row.school,32,32,48);
                const labels=element('div','battle-intro-labels');labels.append(element('h3','',row.name),element('p','',`${tr('战力')} ${monsterGearScore(row.template)}`),element('p','',fill('等级 {level} · {school}',{level:row.level,school:tr(school)}).text));
                banner.append(icon,labels);panel.append(ordinal,portrait,banner);lineup.append(panel);rows.push({panel,portrait,row,loaded:false});
            }
            const footer=element('footer','battle-intro-footer');footer.append(element('span','','准备迎战'));
            skipButton=element('button','secondary battle-intro-skip','跳过登场');skipButton.type='button';skipButton.onclick=skip;footer.append(skipButton);
            const progress=element('div','battle-intro-progress');progress.setAttribute('aria-hidden','true');
            const curtain=element('div','battle-intro-curtain');curtain.setAttribute('aria-hidden','true');
            screen.append(header,lineup,footer,progress,curtain);root.append(screen);skipButton.focus({preventScroll:true});
            screen.addEventListener('keydown',e=>{
                e.stopPropagation();
                if(e.key==='Escape'){e.preventDefault();skip();}
                if(e.key==='Tab'){e.preventDefault();skipButton.focus({preventScroll:true});}
            });
            screen.addEventListener('keyup',e=>e.stopPropagation());
        },
        update(frame){
            if(!screen)return;
            screen.style.setProperty('--curtain',frame.curtain);screen.style.setProperty('--exit',frame.exit);screen.style.setProperty('--progress',frame.progress);
            for(const [i,item]of rows.entries()){
                item.panel.style.setProperty('--entry',frame.rows[i].entry);item.panel.style.setProperty('--banner',frame.rows[i].banner);
                if(item.loaded)continue;
                const c=item.portrait.getContext('2d');c.clearRect(0,0,512,512);
                item.loaded=!!assets.drawMonster?.(c,item.row.template,12,12,488,488);
                // Slow or failed CDN loads never block entry; keep an elemental seal visible.
                if(!item.loaded)drawSchoolIcon(c,item.row.school,256,256,160);
            }
        },
        close(){screen?.remove();screen=null;rows=[];assets=null;root.classList.remove('battle-intro-overlay','visible');},
    };
}
