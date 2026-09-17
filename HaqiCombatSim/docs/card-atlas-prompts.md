# 九格技能图集生成记录

使用内置 imagegen，根据原版卡面主体重新绘制；不是原始纹理的像素复原。原版来源完整条目、文件哈希及名称随 data/adventure/card-atlas.json 的 cells[].original 保存。九格依次为坚固壁垒、冰剑凛空、海狮冰剑、火焰爆、火凤焚天、雷神之剑、静水灵体、灵木刺阵、吸血幽灵。

## 首轮提示词

Create ONE production-ready transparent RGBA sprite atlas for a Chinese fantasy card game, stylized-concept painted game art. The five attached original Haqi card images are reference images: frost shield, ice shards, sea lion, phoenix, and ghost swarm. The other four skills are described below from their original card art. Redraw only their central skill subject with richer clean colorful painterly 3D-like volume, faithful silhouette and identity, isolated from all card frames. This is a new sprite sheet, not a sheet of cards.
STRICT LAYOUT: square canvas, EXACT 3 columns by 3 rows of equal-sized square cells. Nine separate subjects, one centered in each cell, entirely inside its own cell with at least 12 percent clear padding on all four edges. Uniform visual occupancy about 72 percent of cell. No visible grid lines. True transparent background, no checkerboard, no solid rectangular backgrounds. Keep all glow bounded inside its cell; crisp readable silhouettes suitable for 100px card art and 250px animated spell sprites. No titles, no numbers, no letters, no banners, no badges, no card frames.
Row 1 left to right: (1) blue silver shield with angular silver rim, deep navy face and ornate bright cyan symmetrical frost rune as in original reference, frontal three-quarter tiny angle; (2) three distinct faceted cyan ice crystals/shards in a sweeping diagonal cluster as in original ice sword art, no metal sword; (3) friendly but powerful blue-purple sea lion with cream belly, open mouth and proud raised head, emerging above several blue ice crystals, retain walrus-like fantasy creature identity.
Row 2 left to right: (4) vivid compact orange yellow fire eruption/vertical flame burst, bright core and sparse embers; (5) brilliant golden-orange phoenix with raised spread wings and trailing flame tail, complete distinct bird silhouette, original phoenix identity; (6) branching violet and gold lightning strike, three forked luminous bolts forming one coherent cluster, no literal metal sword.
Row 3 left to right: (7) emerald green circular healing sigil with bold rounded green plus in middle, gold-green concentric ornament, no readable text, floating on transparency; (8) three emerald-green tapered leaf/spike discs in layered horizontal formation, match original thorn formation central motif; (9) three pale smoky ghost/wisp heads with wispy trailing tails curling diagonally upward, faint crimson violet aura, expressive spooky faces, retain original spirit swarm.
All nine use the same polished early-2010s family-friendly Chinese fantasy MMORPG illustration style, jewel colors, sculptural highlights, clean antialiased alpha edges. Transparent empty gutters separate every subject. Do not copy the UI or any Chinese text from references.

## 留白修订提示词

Edit this transparent sprite atlas to fix sprite packing ONLY. Retain the exact nine distinct subjects, order, colors, shapes, illustration style and actual transparent alpha background. Output a SQUARE 3 by 3 grid with nine equal SQUARE cells. VERY IMPORTANT: shrink EVERY subject to 70% of its cell width and height, and center it exactly in its own cell. There must be a wide fully transparent gutter surrounding each sprite, all glows included. Nothing should be near a cell border. Rows 1/2/3 and columns 1/2/3 must be precisely equal. Preserve whole silhouettes; no cropping. Do not draw grid lines, text, boxes, background or checkerboard. Make ghosts slightly friendlier by softening mouths but preserve their three-wisp cluster. This sheet must work by exact equal 3x3 slicing, so absolutely no artwork crosses x=one third, x=two thirds, y=one third or y=two thirds. Large 15 percent margin INSIDE EACH CELL on every side.

## 使用边界

每格为一个静态技能主体，卡面和动画共用相同裁剪。动画仅以位移、缩放、旋转和粒子组合验证可复用性，不是逐帧角色动画。软光边缘的精确留白仍受生成结果影响，正式扩展前应检查每格边缘。准备脚本按整图等比缩小，边长始终为3的倍数，最大200,000字节；不改变卡牌背景小于24,000字节的独立预算。

