export const PIP_COLORS={normal:'#66d2ff',power:'#f2c35d'};
export function energyMarkup(unit){
 return `<span class="pip-count pip-normal" style="color:${PIP_COLORS.normal}">● 普通魔力 ${unit.pips}</span><span class="pip-count pip-power" style="color:${PIP_COLORS.power}">◆ 超级魔力 ${unit.powerPips}</span>`;
}
