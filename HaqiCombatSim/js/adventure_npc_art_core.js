// A separate small WebP for every distinct original NPC appearance.
export function installNpcArt(content,manifest) {
    for(const npc of content.npcCatalog.npcs){
        const binding=manifest.instances[npc.instanceId];
        if(!binding)throw Error('缺少居民图片配置：'+npc.name);
        npc.artVisible=binding.visible;
        if(binding.visible){
            const entry=manifest.entries[binding.portrait?.id];
            if(!entry||!Number.isInteger(entry.size)||entry.size<=0||entry.size>=48000||!entry.local.endsWith('.webp'))throw Error('居民图片必须小于48KB：'+npc.name);
            if(!Number.isInteger(entry.width)||!Number.isInteger(entry.height)||entry.width<256||entry.height<256)throw Error('居民图片分辨率必须至少256×256：'+npc.name);
            npc.portrait={...binding.portrait};
        }
        if(content.npcs[npc.id]?.instanceId===npc.instanceId){
            content.npcs[npc.id].artVisible=npc.artVisible;
            content.npcs[npc.id].portrait=npc.portrait;
        }
    }
}
