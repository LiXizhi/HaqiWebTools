# 城市街景统一美术与摄影机（2026-10-04）

本约定用于城市副本静态街景，用户后续明确的视角/风格要求优先。主题与真实地点来源独立；艺术样板不宣称实景测绘。

## 摄影机与尺度

- 摄影机位于场景正前方，轻微俯视，约10–15度；建筑正面朝画面下方。
- 建筑只露出薄薄的屋顶顶面、女儿墙内侧和檐口，屋顶约占建筑高度6–10%。垂直线保持竖直，正面横线保持水平。禁止完全扁平的建筑立面，也禁止转成斜向三分之四、大片侧墙或等距玩具屋。
- 路灯保持竖直，灯罩露一点顶部；候车亭正面展开，屋顶露一点顶面，两根前柱对齐，不能出现巨大侧玻璃面。
- 桌子、长椅、花池、货筐和店面使用相同轻微俯视，桌前沿/花池正面水平，只露少量上表面。圆形物件的顶部椭圆保持一致。
- 树木以植物自然形态绘制，树池的石材/砖墙正面与建筑一致。地面材质供世界平面铺贴，不当作直立物件重画。
- 仅现实世界城市副本中的NPC与行人使用已登记的换装角色，禁止为该范围生成新的单张人物图。不得扩展到魔法哈奇岛屿或现实世界地表NPC；这些场景的原NPC形象、对话头像和预加载路径保持原样。
- 建筑、道具均等比缩放；门口能容纳角色，候车亭内部能容纳站立角色，桌面与长椅按人物尺度检查，灯杆碰撞只用实际杆底，树木碰撞用树池而不是整个树冠。
- 制作后按正式18单位圆形脚底检查门前、楼间、长椅、候车与养护路线；不能只检查点中心。高设施需要遮挡时设置occludes，底板和挂件同组淡化，不以取消碰撞解决遮挡。居民应站在对应门前、休息点或出口旁，保留身份与奖励。

## 共用英文提示词（直接使用，并附下面的主体规格）

```text
Production transparent cutout sprite atlas for a refined realistic hand-painted South China everyday neighborhood 2D game. Unified camera: centered FRONT-FACING view, very slightly looking down about 12 degrees. Fronts face the viewer; vertical poles and walls remain upright, facade horizontals level. Show a SMALL amount of top surface: shallow roofs behind parapets, bench seats, shelter roof tops, planter soil and crate tops. Front dominant; no diagonally turned three-quarter isometric views or large side walls. Upper-left diffuse natural daylight. Authentic slightly weathered plaster, ceramic tile, brick, wood, painted metal, cloth and botanical details in restrained natural colors. Believable daily-use scale. No people, no readable baked text, no numbers, real brands, watermarks, floor islands, outside cast shadows or painted checkerboard. Every whole object stays within its specified grid cell, with generous completely transparent gutters. Genuine transparent RGBA, no colored or blurred background. Runtime text will be drawn on blank sign panels; runtime casts and bakes shadows. All subjects must look coherent when combined into one walkable street scene.
```

## 分组主体提示词

建筑：4列×3行，12种三层为主的华南住宅店屋。乳白阳台、旧砖、蓝色瓷砖、浅灰公寓、晾衣阳台、白色水箱楼、桃色抹灰、浅绿楼、绿色店屋、灰色陶瓷砖、米白旧楼、红砖住宅。门窗尺度一致；屋顶露一小片，适量水箱、植物和修补。地面齐平，底层简单门口，为可替换店面留空间。没有楼梯、独立地台或斜侧墙。

店面：4列×3行，早餐、面馆、杂货、水果、修车、茶饮、花店、家常菜、烘焙、五金、书店、裁缝。正面朝前，招牌底板上方固定，空白文字区域；柜台只有少量顶部可见，门口齐平。使用原创中文店名，文字运行时配置。禁止把门脸斜转，与楼体结合后不能留下悬空侧柱。

公共设施：5列×4行，木长椅、石长椅、绿灯杆、灰灯杆、分类桶；井盖、排水格栅、浅坡道、矮栏杆、路桩；方向牌、菜单板、告示板、广告板、候车亭；自行车架、停放踏板车、消火栓、配电柜、锥桶。每个设施正面略俯视。候车亭须强调 `STRICT FRONT, wide shallow roof top visible, straight posts, symmetrical front layout, no large side glass panel`。细灯杆不得裁掉脚底。井盖和排水沟是平面物件，单独标记，不制造悬空投影。

生活杂物：4列×4行，蒸笼架、果筐、菜筐、饮料箱；圆桌凳、方桌凳、手推车、竹篮；空调、晾衣、浅雨棚、空白红横幅；浅瓦檐、卷闸门、货架、空白墙牌。手推车须强调 `front-facing symmetrical two wheels, horizontal platform front, a thin top visible, centered handle behind, no diagonal side panel`。严格16格；额外物件单开新图，不能挤成错列或带背景。

绿植：4列×3行，榕树圆树池、阔叶树砖树池、棕榈方池、羊蹄甲圆池；长方花池、绿篱池、三角梅盆、小门口盆栽；蕉叶花池、蕨类盆、方盆灌木、矮草花池。池壁正面水平，只露少量土面，禁止斜转池壁和独立方形地台。

楼间连接：4列×3行，院墙铁门、花园门、维修小门、砖墙；浅顶遮雨棚、水电表墙、侧门、藤蔓围栏；水表管、储物卷闸、蕨类矮墙、开放巷口门架。屋檐和墙帽略露顶面，墙体正面不斜。巷口门架内部透明，碰撞只放两边实际柱脚；关门或实墙不能横断通路。

生活细节：4列×4行，严格16格。第1行备用红塑料小凳、窄木报刊架、三只到货纸箱、金属低架蓝洗盆；第2行拖把桶、两把收拢雨伞的伞架、绿金属浇水壶、正面壁挂笼罩风扇；第3行挂墙扫帚/簸箕架、两只布购物袋、墙挂盘水管、空白检修告示牌；第4行封口油漆桶与小刷子、蓝绿色住宅信箱、收拢手推货车、小木鞋架与普通凉鞋。提示词附加 `STRICT FRONT hand truck, symmetrical two wheels, horizontal shallow platform; CLOSED umbrellas; completely blank notice and mailbox name panels; no glossy 3D sheen`。所有长柄完整留在格内；显式裁剪时检查拖把、扫帚和手推车把手，不裁掉头部，不带入邻格。报刊只使用模糊封面，不生成商标或可读报纸文章。对应英文主体及源图记录在scripts/sources/city-living/art-direction.json。

## 组合与验收

先道路和连续地面，后楼体，再按每个间隙宽度布置连通小巷、院墙或附墙管表。所有空隙有用途，不随机塞满。主巷和十字通路保留完整宽度，店门用齐平门前小路接街道，不重复摆独立阶梯。

同一主街优先统一灯具型号和行道树种，公园可混合植物；不要为展示素材而每隔一个物件换一种风格。行道树使用真实树池和比人物更高的成年树冠，放大后重新核验底座碰撞与路口净宽。候车亭、停车架、垃圾桶拥有适当铺装和维护空间；候车步道从侧边到前方，不穿亭体、不伸入机动车道。静态停车标线和窄排水带可用原生Canvas烘焙，不必生成额外图片。

检查单图透明通道、完整轮廓、裁剪、视角和尺寸，再检查实际游戏四观察点及手机宽度。不接受候车亭斜视、手推车斜视、门脸与上层接合悬空、行人站在小巷导致整栋楼错误淡化。不能用“测试通过”代替画面检查。

通过图集打包器维护裁剪与脚底锚点；单WebP≤200000字节。永久Keepwork CDN仅用实际上传结果，GET核验哈希、透明通道、裁剪和CORS。保留本地WebP、来源、源图哈希及完整提示词版本；素材不进网站发行包。用户当前选择仅上传CDN，不复制镜像，不提交/推送/发布游戏。


家具尺度与通路：长椅、自行车架、手推车和菜单板按人物尺度等比缩放。店外陈设的实际底座须留在本店门面内侧，不能以视觉空隙代替可走净宽；放大后逐点检查完整楼间小巷，18单位脚底半径不能擦碰菜单、盆栽或货架。每个门前和每处长椅前登记落脚点并连接真实铺装，不用大块无用途铺装填满草坪。


招牌文字验收：底板必须提供完整归一化挂点。窄菜单保留经营文案作者分行，不自动拆成一字一行；单段长名称只在底板足够宽高时自动换行，超过三行明确省略号，配置中仍保留完整原文。实际截图同时检查单段长名、两行菜单与四行告示，避免用排版函数测试代替画面检查。


店前组合审查：菜单板文字应在实际人物尺度可辨；果筐、饮料箱和货架不要过小。五金陈设用货品，不把市政配电柜当五金库存。门脸已画出的管表、空调与晾衣不重复叠加；额外住宅管表放墙脚，不能遮门牌。检修区要有从公共小巷抵达的实际小路和等待点，牌子与路锥不能封死维修入口。


住宅小院生活细节：4列×2行严格八格。第1行装折叠浅色毛巾的矮编织洗衣篮；带中央龙头的奶油色长方陶瓷水槽与对称黑金属脚；绑绳直立卷起的旧竹席；无背景墙的壁挂素陶盆垂蕨。第2行闭盖蓝绿收水桶及正面低龙头；带少量橙果的小柑橘树和浅椭圆陶盆；正面铜色罩笼壁灯及平背板、无光晕；闭盖蓝色保温送货箱、正面锁扣、无轮子和品牌。共用摄影机、柔光与材质提示词继续使用。每个主体完整留在显式裁剪内，尤其水槽龙头和蕨叶；PNG可能有alpha为0的彩色底，核验alpha而非预览底色，不做颜色抠图。洗衣篮/卷席在住宅，水槽沿墙脚，蕨盆/壁灯挂墙，收水桶在园艺维护区，柑橘在庭院，保温箱在烘焙送货区。
