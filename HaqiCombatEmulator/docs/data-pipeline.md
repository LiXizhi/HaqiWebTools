# 数据管线

`scripts/import_data.py` 是开发期只读转换器。运行时仅 fetch 随项目附带的 JSON。转换器不执行 Lua、eval 或仓库脚本，不读取账户数据库。

## 输入与输出

| 输入 | 输出用途 |
|---|---|
| `config/Aries/Cards/CardList.xml` / `.teen.xml` | 按原顺序加载卡牌，重复 key 后者覆盖 |
| 每个 CardList 引用的 XML | key、spell、basics、params、源路径 |
| `CharmWardList[.teen].xml` | charms、wards、mini/global aura |
| `Database/globalstore[.teen].db.mem` | 物品目录、stats、槽位、套装、卡牌名称 |
| `ItemSet/AllItemSetAttr[_Teen].xml` | 套装阈值属性 |
| `Others/globalstore.addonlevel.{kids,teen}.xml` | 强化属性 |
| `WorldData[_Teen]/HaqiTown_RedMushroomArena_NvN.Arenas_Mobs.xml` | 1–4 人 PvP 配置 |
| RuneList、DragonTotemStats、DeckAttackerAITemplates、CombatPet_Teen | 辅助原始树，保留待移植数据 |
| card/player/arena_server.lua | 原规则来源哈希 |

`data/{kids,teen}/ruleset.json` 为运行包；`source-records.json` 保存按加载顺序的完整卡牌 XML 和完整 GlobalStore 行（包括尚未映射的原字段）。`data/manifests/{version}.json` 保存每个源文件 SHA-256、卡牌加载顺序、转换器 SHA-256、重复覆盖与缺项。原 XML 数值/布尔按源加载语义转换，表达式字符串保持字符串。青年版卡牌 accuracy 按原加载器置为 100。

## GlobalStore 解码

`.mem` 文件先 Base64 解码，再逐字节 XOR 重复密钥 `Copyright@ParaEngine, LiXizhi` **加末尾 NUL**。结果是 Lua 数据表字面量。受限解析器只接受数组表、字符串、数字、布尔与 nil，不支持执行语句。

1 起始索引的原行映射：gsid=1、icon=4、assetkey=13、template=19。template 的名称=1、描述=2、属性对=3–22、slot=23、class=24、subclass=25、itemset=31。完整行另存，不丢弃其他字段。

## 本次审计

| 版本 | 列表条目 | 有效卡牌 | 重复 key | 物品 | 缺失引用 |
|---|---:|---:|---:|---:|---:|
| kids | 706 | 701 | 5 | 4,768 | 1（机器人模板文件） |
| teen | 1,314 | 1,272 | 1 | 5,548 | 41（卡牌文件） |

缺失文件具体路径见 manifests。儿童模板缺失不阻止本地自行实现的战术机器人；请求任何不存在卡牌都会阻止编译。青年缺失不能用儿童卡牌或零值替代。覆盖清单区分源数据缺项和效果实现缺项。

## 更新流程

```sh
npm run data:import
npm run data:audit
npm run check
npm test
npm run test:browser
```

检查 manifests 差异，确认来源和加载覆盖，重新运行基准。配置 hash 变化后旧战报/补丁不能直接导入新版本。`data:audit` 检查本地可用源文件哈希；发行静态文件夹没有仓库原数据时会报告 absent，不伪称已校验源文件。

源 config / Database 是本机仓库的忽略目录。不要提交整个数据库或无关资源；本项目仅提交所需转换产物。用户 JSON 配置和数值补丁通过应用导出，正式服应用补丁不在本轮范围。
