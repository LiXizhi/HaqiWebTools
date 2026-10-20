"""Shared Chinese-key vocabulary writer; no runtime WordNet dependency."""
import re


def select_common_keys(keys, frequencies, required=(), limit=2000):
    """Frequency-ranked shared budget, retaining explicit game vocabulary."""
    keys = list(keys)
    keep = set(keys).intersection(required)
    if len(keep) > limit:
        raise ValueError('Required vocabulary exceeds the shared key budget')
    ranked = sorted(keys, key=lambda key: (-frequencies.get(key, 0), key))
    for key in ranked:
        if len(keep) >= limit:
            break
        keep.add(key)
    # Preserve source order so primary forms and existing learning identities stay stable.
    return dict.fromkeys(key for key in keys if key in keep)


def compact_bridge_rows(keys, table):
    """Group identical ordered form lists; each Chinese key remains independent."""
    groups = {}
    for key in keys:
        forms = tuple(table.get(key, []))
        groups.setdefault(forms, []).append(key)
    return '\n'.join(','.join(group) + '||' + ','.join(forms)
                     for forms, group in groups.items()) + '\n'


def compact_chinese_keys(keys, tables):
    """Group keys with the same known translations across every language."""
    groups = {}
    for key in keys:
        signature = tuple(tuple(table.get(key, [])) for table in tables.values())
        # Missing translations alone are not evidence that words belong together.
        identity = signature if any(signature) else key
        groups.setdefault(identity, []).append(key)
    return '\n'.join(','.join(group) for group in groups.values()) + '\n'


def write_bridge(out, selected, notices, frequencies, required=()):
    keys = dict.fromkeys(selected['zh'])
    tables = {lang: {} for lang in selected if lang != 'zh'}
    for lang, chosen in selected.items():
        if lang == 'zh':
            continue
        for word, row in chosen.items():
            # Keep explicit Chinese gloss alternatives, not transitive synset links.
            meaning_text = row['meaning']
            if lang == 'en':
                meaning_text = {'a': '一个', 'an': '一个', 'the': '这个', 'under': '下面'}.get(word, meaning_text)
            meanings = re.split(r'[；;,，/]', meaning_text)
            for meaning in meanings:
                key = meaning.strip()
                if not re.fullmatch(r'[\u3400-\u9fff]+', key):
                    continue
                keys[key] = None
                bucket = tables[lang].setdefault(key, [])
                forms = [] if lang == 'en' and word in {'a', 'an', 'the'} else row['forms']
                for form in [word, *forms]:
                    if form not in bucket:
                        bucket.append(form)
    keys = select_common_keys(keys, frequencies, required)
    tables = {lang: {key: forms for key, forms in table.items() if key in keys}
              for lang, table in tables.items()}
    (out / 'word_zh.txt').write_text(compact_chinese_keys(keys, tables), encoding='utf8')
    for lang, table in tables.items():
        (out / f'word_{lang}.txt').write_text(
            compact_bridge_rows(keys, table),
            encoding='utf8')
    (out / 'word-LICENSE.txt').write_text(
        '\n\n'.join(f'# {lang}\n{notice}' for lang, notice in notices.items()) + '\n',
        encoding='utf8')
    return keys, tables
