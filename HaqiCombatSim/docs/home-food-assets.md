# 家园英语 L1 食物道具

2026-10-26。已接入十二件物品与七十二个作者情境；不是完整 L1。

- 本地资源：[WebP](../assets/adventure/home/home-food-3c62d4ff0dde.webp)，768×576、141034 字节。
- 永久资源：[Keepwork CDN](https://cdn.keepwork.com/keepwork/cdn/haqi/home/home-food-3c62d4ff0dde.webp)，已校验 CORS `*` 与 SHA-256 一致。
- [来源、完整生成提示词、裁剪与编码](../data/adventure/home/home-food-art.json)；原生 image_gen，transparent_background=true。
- [准备脚本](../scripts/prepare_home_food_art.py)：输入原生 RGBA 源图，使用逐件核验的完整边界重排；先尝试无损，超出预算再高质量有损。不抠白、不盲切四等分。脚本只打包本地资源，不上传或自动接入目录。
- [作者稿](story/drafts/english-home-foods.md)；[课程覆盖账本](curriculum/en-l1-vocabulary.md)。

原图、打包 WebP 均检查浅色、深色与草地底色。完整熟鱼与奶瓶间有极低 alpha 像素连接，已分别核验边界，保留各自完整轮廓。图集十二格独立，蛋与米饭的白色部分保留。

目录采用现有厨房餐厅分类、顶层道具和永久 CDN 加载，支持摆放、移动及标签。没有新增消耗、烹饪或喂食逻辑。中文召唤支持新增根／碗／盘／杯／瓶量词。orange-fruit 指橙子；熟鱼、烤鸡只覆盖本轮食物词义。

验证边界：目录裁剪／渲染测试覆盖全部十二格；桌面和手机实际找物、错误目标不计数、标签写入与刷新恢复测试覆盖苹果和橙子。其余道具的逐个浏览器交互与真人语音／儿童试玩尚待补充。仅图集资源上传 CDN，网页代码未发布；未复制外部 Git 镜像、未提交或推送。
