---
name: locale-scan
description: >-
  Scan the Haqi adventure UI allowlist for Chinese strings missing from or
  stale in data/adventure/locale dictionaries such as en.txt. Use when
  updating translations, adding ja.txt or ko.txt, finding untranslated UI
  copy, or the user mentions locale scan, en.txt, unknown strings, or
  changed translation keys.
---

# Locale scan

Chinese sentences are the dictionary keys. Format and modules: `docs/locale.md`.

The file list is `.cursor/skills/locale-scan/scan-paths.json`. Do not scan the whole repo. `HaqiCombatSim.html` views (`view_battle.js`, `view_params.js`, `view_batch.js`, `view_advisor.js`) stay off the list until that page loads locale files.

## Run

From `web/HaqiCombatSim`:

```text
npm run locale:audit
npm run locale:check
```

统一报告位于 `tmp/locale-audit/latest.json`，只读。`locale:check` 在缺英文、语言未对齐、非允许空值、英文残留汉字、占位符不一致或配置文件缺失时失败；动态拼句和旧键单列人工复查，不删除旧译文。原始 `scan_locale.mjs` 保留作详细源码诊断，它的 `--check` 包括旧键及已知误报，不用作全局翻译完成标准。

`--paths` selects another manifest. `--check` exits 1 when any static string is missing from the base dictionary or any base key is absent from the scanned sources.

## Check the running page

`scripts/verify_en_locale.mjs` walks the English adventure UI and lists Chinese that is still visible. Use it after dictionary or `setText` changes, and when a screenshot still shows Chinese.

From `web/HaqiCombatSim`, with Playwright installed outside the repo:

```text
HAQI_URL=http://127.0.0.1:8788/Haqi.html PLAYWRIGHT_ROOT=$TEMP/pw-haqi/node_modules node scripts/verify_en_locale.mjs
```

`HAQI_URL` defaults to `http://127.0.0.1:8765/Haqi.html`. `PLAYWRIGHT_ROOT` is the directory that contains `playwright/package.json`. The script opens a new character, switches to English, and prints JSON of leftover Chinese on the settings, HUD, world map, and check-in screens. It exits 1 when any remain, apart from the name `小哈奇` and the language names. It does not open every shop, so a shop screenshot can still need a manual pass. Do not save over the player's real checkpoint.

## Read the report

- **源码有、词典没有**: a static Chinese string literal or JSON value is not a key in `en.txt`.
- **词典有、源码没有**: an `en.txt` key did not appear as a static string. If the line says it appears inside a dynamic sentence, the UI builds that key with a variable; leave the key.
- **动态句子**: templates with `${}` need review. Convert visible copy to `fill('句子 {count}', {count})` before translation; the full placeholder pattern becomes the dictionary key. Do not paste raw `${}` templates into the dictionary.
- UI dictionaries are checked against `en.txt`. Separate `learning.*.txt` course dictionaries do not share the UI key set.

JSON line numbers are occurrence order, not file lines.

### Known false positives

These stay in the report after a full translation pass. Do not add them; they are never used as dictionary keys.

- `js/view_adventure.js` mount emoji keyword table. The names are matched with `String.includes` to pick an emoji and are never rendered.
- `data/adventure/npc-catalog.json` `subtitle` values. `view_adventure_npc.js` strips `()`/`（）` before the lookup, so the paren-free key is the real one and it is already in the dictionary.
- Code fragments used only in comparisons, such as `出战单位` in `adventure_app.js` `error.message.includes(...)`.
- Fragments concatenated into a longer key at runtime, such as `。网页版：放入宠物食槽，饥饿时自动食用。` appended to a pet-food description. Item descriptions are rendered without `tr()`, so the fragment is never a key on its own.

## Change the file list

Edit `scan-paths.json` only.

- `files`: exact paths, `.js` or `.json`.
- `dirs`: one directory plus `include` and `exclude` globs. No recursion. New `js/view_*.js` files are discovered automatically; excluded simulator/debug files remain out of scope.
- `json`: a JSON file, the object keys to collect (`name`, `title`), and optional `under` ancestor keys so only that part of the file is read. NPC names and quest text are already listed. `"enabled": false` skips an entry. Do not enable a whole `data/adventure` directory.
- `ignore`: scoped `file` plus exact `text` or `pattern`, with a reason. A matching phrase in another file still needs translation.
- `languages`: supported UI dictionaries for the completion audit and `others` batch mode. `allowedEmpty` lists historical internal empty values with reasons; do not add visible UI text here.

## Update a dictionary

Do this only when the user asks to update locale files.

1. Add player-visible static strings that the report lists as missing. Skip logs, thrown errors, debug labels, and strings the player never sees.
2. Append to `data/adventure/locale/en.txt` under a `# path/to/file.js` comment for the source file. A line that begins with `#` and contains no `|` is a comment, not a key. Keep existing lines and their translations. When the user wants no translation yet, append `中文||` with the right side empty. Otherwise append `中文||English`. The separator is the longest unique run of `|` on that line. Write a newline inside a key as `\n`.
3. Do not delete a stale key unless the user confirms it is gone from the UI.
4. Do not write raw `${}` dynamic templates as keys. Translate named `fill` patterns before substitution.
5. When `ja.txt` or `ko.txt` exists, add the same Chinese keys and run `node scripts/diff_locale.mjs data/adventure/locale/en.txt data/adventure/locale/ja.txt`.
6. Run `node scripts/scan_locale.mjs` again and `node --test tests/locale_scan.test.mjs tests/locale_core.test.mjs`.

## Repeat a global translation pass

Use the incremental workflow in `docs/locale.md`: audit, prepare English in a fresh batch directory, translate, merge, then prepare `others`, translate, merge and check. `scripts/translate_locale_batches.mjs` uses explicitly configured environment credentials and a chat-completions endpoint; no machine-specific account-note paths are required. Validated outputs can resume; malformed existing outputs stop the run. All outputs must validate before merging, and existing filled translations remain intact. Do not use legacy full-dictionary overwrite scripts for an incremental pass.

When the user adds content, existing registered JSON arrays need no configuration change. New story/scene JSON files need explicit `fields`/`under` registration after checking the runtime author source. Keep Earth city content, teen, generated reports and historical archives out of scope. A static scan cannot establish that every DOM/Canvas call uses `tr`/`setText`/`fill`; review changed views and run appropriate runtime checks.
