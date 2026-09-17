# 数据导出器规格（`scripts/export_data.mjs`）

## 用法

```bash
cd web/HaqiCombatSim
npm run export                       # 默认 --config ../../config/Aries --out data --version both
node scripts/export_data.mjs --config /path/to/config/Aries --out data --version teen
```

- Node ≥ 20；**零依赖**（XML 用 `scripts/lib/xml_lite.mjs`，CSV 手写切分）。
- 输出 `data/kids/` 与 `data/teen/`（gitignored）。`data/sample/` 为手写示例，不由导出器覆盖。
- XML 解析放在可测试的 `scripts/lib/xml_lite.mjs`（`tests/xml_lite.test.mjs`），`export_data.mjs` 负责各文件的字段映射与 IO。

## 输入与输出

| 输入（相对 `config/Aries/`） | kids | teen | 输出 |
|------|------|------|------|
| `Cards/CardList.xml` / `CardList.teen.xml` → 每个 `<card datafile>` | ✓ | ✓ | `cards.json` |
| `Cards/CharmWardList.xml` / `.teen.xml` | ✓ | ✓ | `charms.json` |
| `Cards/CombatThreatConfig.xml` / `.teen.xml` | – | – | （PvP 不用威胁值，未导出） |
| `Combat/MobStatsByGearScore.xml` / `.teen.xml` | 本机无 kids 版 → 空 `{}`，引擎用等级公式 | ✓ | `stats_by_gear.json` |
| `Combat/deck_attacker_ai/Aggressive{School}.csv`（kids / teen 共用） | ✓ | ✓ | `ai_decks.json` |
| `Combat/MobAIDeckByGearScore.xml` / `.teen.xml` | 本机无 kids 版 → 空 `{}` | ✓ | `ai_deck_by_gear.json` |
| `HP/HP_level_mapping.xml` | ✓ | ✓ | `hp_table.json` |
| `Others/kids_skill_extendcost.txt` / `teen_skill_extendcost.txt` | ✓ | ✓ | `gsid_map.json` |
| — | | | `manifest.json` |

实测结果（2026-09-16）见 [qa-report.md](qa-report.md)「Phase 1 导出器」：kids 701 卡 / teen 1272 卡（teen 列表中 41 个 datafile 缺失，记入 `manifest.counts.cardsMissing`）。

## 解析规则

### cards.json
- 与 `card_server.lua` `Card:CreateCardTemplate` (L655-724) 一致：
  - `key` ← `/card/key/@name`；`spellName` ← `/card/spell/@name`
  - `type, target, pipcost, accuracy, hitchance, spellSchool, requireLevel, canLearn` ← `/card/basics/@*`；`spellSchool` 缺省 `balance`；数值属性 `Number()`
  - `params` ← `/card/params/@*`：能转数字的转数字，否则保留字符串；键名保持 XML 原名（`damage_min`）并额外提供 camelCase 别名由引擎侧处理（导出保持原名，避免双写）
- CardList 中被注释的 `<card>` 不导出。
- `datafile` 不存在 → 记入 `manifest.missingDatafiles`。
- `teen` 版 accuracy 在 Lua 中被强制 100（见研究结论），导出保留 XML 原值，由引擎按 version 处理，并在 `lua-mapping.md` 登记。

### charms.json
- `<charmlist>/<charm>`、`<wardlist>/<ward>`、miniaura、globalaura 各节点；`id` 为键；所有属性数值化（`positive="true"` → boolean）。
- 字段：`boost_damage, boost_accuracy, school, positive, dispel_school, focus_prism, icon_gsid, desc` 等原样保留。

### ai_decks.json
- 从 `DeckAttackerAITemplates*.xml` 列出 CSV；每个 CSV：
  - 第一行第一列为 style 名（如 `AggressiveFire`），其余列为条件键。
  - 每行：`key, target, base_weight, 条件权重...`；空单元格跳过；`-1000` 等负值保留（引擎剔除）。
  - 输出 `{ [style]: { school, cards: [ { key, target, baseWeight, conditions: { colName: weight } } ] } }`。
- 条件键语义（引擎需实现的判定，来自 CSV 表头）：
  `no_aura, caster_school_damage_aura, other_school_damage_aura, caster_low_hp / medium / high, caster_with_globalshield, target_is_{school}, caster_with_{school}_shield, target_with_{school}_shield, caster_with_1_damageboost, caster_with_2+_damageboost, caster_with_1_damagetrap, caster_with_2+_damagetrap, caster_with_1+_healboost, caster_with_1+_healweakness, caster_with_1+_damageweakness, caster_pips_10+, target_low_hp / medium / high, target_with_globalshield, target_with_{school}_defend_miniaura, target_with_1_damageboost, target_with_2+_damageboost, target_with_1_damagetrap, target_with_2+_damagetrap, target_with_1+_healboost, target_with_1+_healweakness, target_with_1+_damageweakness, target_pips_6+`。
  low/medium/high HP 阈值在实施时从 `mob_server.lua GetCardAndTarget_Deck_Attacker` 核对并写入 `lua-mapping.md`。

### stats_by_gear.json
- `<group school>/<stats gearscore_from gearscore_to ...>`；注意文件注释：匹配 GS = 用户实际 GS + 1000，导出时同时给 `fromRaw/toRaw` 与 `from/to`（减 1000）。

### ai_deck_by_gear.json
- `cards="(22113+4)(22331+4)..."` → `[ { gsid: 22113, count: 4 }, ... ]`；再用 gsidMap 补 `key`，找不到 `key: null`。

### manifest.json
```json
{
  "version": "teen",
  "exportedAt": "2026-09-16T12:00:00+08:00",
  "cardCount": 1374,
  "typeHistogram": { "SingleAttack": 120, "...": 0 },
  "supportedTypes": ["..."],
  "unsupportedTypes": { "SomeType": 12 },
  "missingDatafiles": [],
  "gsidMap": { "22113": "Fire_DOTAttack_LevelX" },
  "unmapped": [43113]
}
```
`supportedTypes` 由导出器从 `js/combat_cards_core.js` 导出的 `SUPPORTED_TYPES` 常量读取，保证 manifest 与引擎一致。

### gsid 映射（尽力）
1. `*_skill_extendcost.txt`（GBK 编码，需转码）：`skill_gsid` 列 + `ex_name` 列形如 `Get_22121_thisClass_CardQualification_Storm_SingleAttack_Level1` → 去前缀得 cardkey。
2. 单卡 XML `params.icon_gsid` 作为反向线索（同一 icon 多张卡时不唯一，仅在唯一时采用）。
3. 品质变体：`41xxx / 42xxx / 43xxx` 对应 `_Green / _Blue / _Purple`（实施时用样本验证，不成立则不启用）。

## 示例数据集 `data/sample/`
手写，结构同上，用于测试与无数据演示：
- 五系各 6~8 张：1 费 / 2 费 / 4 费单攻、群攻、治疗（life / death 多一张）、本系 blade、本系 shield、一张 DOT。
- `charms.json` 含对应 blade / shield / weakness。
- `stats_by_gear.json` 每系 1 个区间；`ai_decks.json` 每系一份简化权重；`hp_table.json` 用公式生成。
- `manifest.json` 标记 `"sample": true`。
