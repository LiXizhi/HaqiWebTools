# 技能特效

2026-09-17 实施：当前 `Haqi.html` 冒险数据内全部45张技能卡。完整 kids/teen 模拟器卡库不在此次45张范围内，PvP页面未更改。原版卡面提供视觉意象，本实现是新制作的2D演出，不声称复刻原3D粒子或骨骼动画。

## 方案与完成状态

- [x] 单一配置：`data/adventure/spell-effects.json`，45个原card key逐一登记，没有未知卡静默回退。
- [x] Canvas粒子、法阵、冰剑、陨石、雷电、藤蔓、旋风、护盾、强化、陷阱、治疗、吸血。
- [x] 海狮（登场/攻击两个姿态）、火凤、火魔、幽灵、土猿、疾猫、冰兽召唤；图集角色采用位移、旋转、缩放驱动，不是骨骼动画。
- [x] `cast`事件驱动演出；失败只显示消散粒子，数值仍由原战斗事件更新。
- [x] 专用种子生成视觉粒子，与战斗RNG隔离。浏览器减少动态效果偏好自动简化演出。
- [x] 独立 `HaqiEffects.html` 逐卡选择、暂停、时间轴、循环与简化模式，不读写游戏存档。
- [x] 本地透明WebP、永久Keepwork CDN、哈希/CORS验证与配置测试。

## 配置格式

`palettes`按学派设置主色、亮色、暗色；`timeline`定义普通/召唤攻击起点与命中点（0–1）。`frames`是图集像素裁剪矩形。生成图集不是严格等距网格，因此使用明确裁剪，不调用通用4×2 tile切片。

`cards[原card key]`包含：`name`、`kind`、`duration`毫秒、`count`粒子上限、`scale`、原定义`source`。召唤类另外设置`summon`与`attack`。`summons`指定资源ID、登场/攻击frame、基础显示尺寸。例如海狮冰剑使用`seaLion`和`swords`，2600ms。

在JSON中修改卡牌参数即可，不需要构建。新增效果种类在`spell_effects.js`实现绘制，并在`spell_effects_core.js`登记、验证。缺失卡牌、非法种类、召唤引用、时间轴和粒子数量会阻止资源加载并显示恢复提示。粒子数量不超过160；帧采样基于归一化进度，不依赖帧率；缓存最多129组后清理。手机按画布尺寸缩放。

`spell_effects_core.js`只有验证/视觉种子/时长解析；`spell_effects.js`只调用传入Canvas context，不改变游戏状态。`adventure_app.js`为cast选择配置时长；`adventure_renderer.js`按caster/target映射位置。存档无需迁移，加载战斗仍重演引擎决定，不保存瞬时粒子。

## 美术

`assets/adventure/webp/summons.webp`：2026-09-17通过图像生成工具制作的8姿态透明图集，1774×887，lossless WebP。七种召唤角色，海狮有两个姿态；动画由代码实现。完整CDN URL、字节数、SHA-256及来源在`media.json`，使用已登记的Maisi上传技能上传。没有新增第三方运行库。

准备命令支持保留已验证WebP；原始PNG不纳入Git。若需要重做图集，提供`assets/adventure/summons.png`，然后执行资源准备、CDN发布计划与核验命令，并更新frames。

## 预览

运行静态服务后打开 `http://127.0.0.1:8791/HaqiEffects.html`。追加 `?assets=cdn` 检查线上素材模式；默认仍是本机local、线上CDN。主入口仍为 `Haqi.html`。
