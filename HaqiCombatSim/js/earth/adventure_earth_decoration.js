// Original Canvas art for biome details absent from the shared bitmap atlas.
// Normalized geometry keeps snow and wheat aligned with sprite depth/occlusion.
export function drawEarthBiomeDecoration(ctx,o){
    if(!['snowTree','snowMound','wheat'].includes(o.earthDecoVariant))return false;
    ctx.save();ctx.translate(o.x-o.size/2,o.y-o.size*.88);ctx.scale(o.size,o.size);
    const polygon=(points,color)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
    ctx.fillStyle='rgba(42,62,78,.18)';ctx.beginPath();ctx.ellipse(.5,.87,.34,.065,0,0,Math.PI*2);ctx.fill();
    if(o.earthDecoVariant==='snowTree'){
        ctx.fillStyle='#695444';ctx.fillRect(.465,.64,.07,.23);
        for(const [top,bottom,half] of [[.31,.8,.36],[.18,.62,.28],[.06,.43,.19]]){
            polygon([[.5,top],[.5+half,bottom],[.5,bottom-.035],[.5-half,bottom]],'#315e59');
            polygon([[.5,top],[.5+half*.82,bottom-.095],[.5+half*.42,bottom-.13],[.5+.035,bottom-.07],[.5-half*.3,bottom-.14],[.5-half*.82,bottom-.095]],'#d2e2ec');
            polygon([[.5,top],[.5+half*.55,bottom-.18],[.5,bottom-.2],[.5-half*.7,bottom-.13]],'#f5faff');
        }
    }else if(o.earthDecoVariant==='snowMound'){
        ctx.fillStyle='#cedee9';ctx.beginPath();ctx.ellipse(.5,.85,.36,.2,0,Math.PI,Math.PI*2);ctx.closePath();ctx.fill();
        ctx.fillStyle='#f5faff';ctx.beginPath();ctx.ellipse(.46,.81,.29,.17,0,Math.PI,Math.PI*2);ctx.closePath();ctx.fill();
    }else{
        ctx.strokeStyle='#9d762e';ctx.lineWidth=.018;
        for(let i=0;i<7;i++){
            const x=.2+i*.1,top=.23+(i%3)*.06;
            ctx.beginPath();ctx.moveTo(x,.85);ctx.lineTo(x-.03,top);ctx.stroke();
            polygon([[x,.66],[x-.11,.49],[x-.02,.57]],'#b8ac48');
            for(let j=0;j<4;j++){
                const y=top+j*.055;
                ctx.fillStyle=j%2?'#eac86b':'#d9af50';ctx.beginPath();ctx.ellipse(x-.03+(j%2?.025:-.025),y,.025,.044,j%2?.5:-.5,0,Math.PI*2);ctx.fill();
            }
        }
    }
    ctx.restore();return true;
}
