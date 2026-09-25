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
node scripts/scan_locale.mjs
```

`--paths` selects another manifest. `--check` exits 1 when any static string is missing from the base dictionary or any base key is absent from the scanned sources.

## Read the report

- **源码有、词典没有**: a static Chinese string literal or JSON value is not a key in `en.txt`.
- **词典有、源码没有**: an `en.txt` key did not appear as a static string. If the line says it appears inside a dynamic sentence, the UI builds that key with a variable; leave the key.
- **动态句子**: templates with `${}`. The runtime key is the filled sentence, so do not paste the template into the dictionary.
- Other `*.txt` files in `data/adventure/locale/` are diffed against `en.txt`. A missing `ja.txt` or `ko.txt` is expected.

JSON line numbers are occurrence order, not file lines.

## Change the file list

Edit `scan-paths.json` only.

- `files`: exact paths, `.js` or `.json`.
- `dirs`: one directory plus `include` globs (`view_adventure_*.js`). No recursion.
- `json`: a JSON file, the object keys to collect (`name`, `title`), and optional `under` ancestor keys so only that part of the file is read. NPC names and quest text are already listed. `"enabled": false` skips an entry. Do not enable a whole `data/adventure` directory.

## Update a dictionary

Do this only when the user asks to update locale files.

1. Add player-visible static strings that the report lists as missing. Skip logs, thrown errors, debug labels, and strings the player never sees.
2. Append to `data/adventure/locale/en.txt` under a `# path/to/file.js` comment for the source file. A line that begins with `#` and contains no `|` is a comment, not a key. Keep existing lines and their translations. When the user wants no translation yet, append `中文||` with the right side empty. Otherwise append `中文||English`. The separator is the longest unique run of `|` on that line. Write a newline inside a key as `\n`.
3. Do not delete a stale key unless the user confirms it is gone from the UI.
4. Do not write dynamic templates as keys.
5. When `ja.txt` or `ko.txt` exists, add the same Chinese keys and run `node scripts/diff_locale.mjs data/adventure/locale/en.txt data/adventure/locale/ja.txt`.
6. Run `node scripts/scan_locale.mjs` again and `node --test tests/locale_scan.test.mjs tests/locale_core.test.mjs`.
