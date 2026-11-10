# 森林精灵界面资源

2026-11-10，根据用户选定的 B 风格制作。三张素材均为无文字透明 WebP，边框及主次按钮独立，运行时使用九宫格拉伸，文字保留真实 DOM，支持翻译、换行和键盘操作。

- 清单：data/adventure/forest-ui.json，含尺寸、原图裁剪、SHA-256、CDN 地址。
- 主按钮绿色，次按钮奶油色。同组等宽，基础高度 56px；长文字自动增高。单个对白主按钮最大宽度 320px。
- 图案只留在端部，正文留安全内边距；关闭按钮沿用现有组件。
- 默认从 CDN 加载，三张均解码成功后整体启用；失败沿用原皮肤。原有图标图集保留。
- 此轮覆盖共享弹窗、NPC 对话和主次按钮；角色选择、专用家园工具、战斗 HUD 等独立组件并非全部重绘。
- 只上传新美术到 CDN，未发布本地游戏代码。

## 生成提示词

### frame

ONE standalone reusable woodland fantasy UI panel frame. Landscape rectangle ratio 3:2 filling canvas with small transparent margin. Curved light honey carved wood border, rich handpainted raised wood grain, small lush leaves and tiny blue bellflowers ONLY at four corners within corner 15% regions, small mushrooms bottom left. Large COMPLETELY EMPTY flat pale cream parchment interior. No text, no buttons, no characters, no portrait subdivision, no labels, no icons, no backdrop. Designed for nine-slice CSS border-image: straight center edges must be uninterrupted extendable wood bands, corner ornamentation cannot intrude far into central text area. True transparent exterior, opaque cream center.

### primary

ONE standalone blank primary UI button. Wide rounded rectangle 4:1 width:height, small transparent margin, uniform softly bevelled carved honey wood rim, rich deep fresh leaf green center with subtle texture, tiny carved leaf accent confined to far left end and small curling vine far right end. Center 65 percent completely blank for dynamic text. No writing, no symbols in center, no backdrop, no surrounding UI. Soft dimensional handpainted game art. Ends and rim suitable for nine slice stretch, center edges straight.

### secondary

ONE standalone blank secondary UI button, same construction and proportions as forest primary button. Wide rounded rectangle 4:1 width:height, small transparent margin, uniform softly bevelled carved honey wood rim, warm light cream center with subtle paper texture, tiny carved leaf accent confined to far left end and small curling vine far right end. Center 65 percent completely blank for dynamic text. No writing, no symbols in center, no backdrop, no surrounding UI. Soft dimensional handpainted game art. Ends and rim suitable for nine slice stretch, center edges straight.

