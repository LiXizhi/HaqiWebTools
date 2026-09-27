import {petAppearanceStage} from './adventure_pets_core.js';
import {petInteractionParams} from './adventure_pet_interactions_core.js';
// Called in depth order by the world renderer. Uses existing pet sheets only.
export function drawSocialPet(ctx,assets,row,effects,time,reduced,at=Date.now()){
    const {pet,position}=row;if(!pet)return;
    const effect=effects.findLast(e=>e.ids.includes(pet.id)&&e.until>at);
    const phase=(time/1000)+(effect?.ids.indexOf(pet.id)||0)*Math.PI;
    const scale=row.scale||1,size=64*scale;
    const playing=!!effect;
    const hop=reduced?0:playing?Math.abs(Math.sin(phase*5))*9:row.moving?Math.abs(Math.sin(row.phase))*5:Math.sin(phase*2)*1.5;
    ctx.save();ctx.translate(position.x,position.y);
    ctx.fillStyle='#294c3733';ctx.beginPath();ctx.ellipse(0,0,18*scale,5*scale,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(reduced||!playing?0:Math.sin(phase*4)*5,-hop);ctx.scale(row.facing||1,1);
    const drawn=assets.drawPet(ctx,pet.speciesId,petAppearanceStage(pet,assets.content),-size/2,-size+4,size,size);
    if(!drawn){ctx.fillStyle='#bbd5a1';ctx.beginPath();ctx.ellipse(0,-size*.4,size*.22,size*.32,0,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    ctx.restore();
}

// No overhead social text. Both pets briefly show marks/hearts while together.
export function drawPetSocialEffects(ctx,assets,rows,effects,time,reduced,at){
    const byId=new Map(rows.map(row=>[row.pet.id,row])),used=new Set(),p=petInteractionParams(assets.content);
    ctx.save();ctx.textAlign='center';ctx.font='12px "Microsoft YaHei",sans-serif';
    const bubble=(x,y,w,line)=>{ctx.fillStyle='#fff9ed';ctx.strokeStyle='#bca47d';ctx.beginPath();ctx.roundRect(x-w/2,y,w,27,7);ctx.fill();ctx.stroke();ctx.fillStyle='#66432d';ctx.fillText(line,x,y+18);};
    for(const row of rows)if(row.pet.ownerId===null)bubble(row.position.x,row.position.y+5,58,'待领养');
    for(const effect of [...effects].reverse()){
        const key=[...effect.ids].sort().join('|');if(effect.until<=at||used.has(key))continue;used.add(key);
        const pets=effect.ids.map(id=>byId.get(id)).filter(Boolean);if(!pets.length)continue;
        if(pets.length!==2||Math.hypot(pets[0].position.x-pets[1].position.x,pets[0].position.y-pets[1].position.y)>p.interactionDistance)continue;
        if(effect.kind!=='proximity'||effect.babyId)for(const row of pets){
            if(used.has(row.pet.id))continue;used.add(row.pet.id);
            const y=row.position.y-64*(row.scale||1)-14,x=row.position.x,count=Math.min(p.marksRequired,effect.status?.available||0);
            for(let i=0;i<p.marksRequired;i++){ctx.fillStyle=i<count?'#e5839b':'#fff4da';ctx.fillRect(x-p.marksRequired*9+i*18,y,15,6);}
            ctx.save();ctx.translate(x,y-15-(reduced?0:Math.sin(time/300)*3));ctx.scale(9,9);ctx.fillStyle='#e9859a';ctx.beginPath();ctx.moveTo(0,.7);ctx.bezierCurveTo(-1.6,-.2,-.7,-1.4,0,-.6);ctx.bezierCurveTo(.7,-1.4,1.6,-.2,0,.7);ctx.fill();ctx.restore();
        }
    }
    ctx.restore();
}
