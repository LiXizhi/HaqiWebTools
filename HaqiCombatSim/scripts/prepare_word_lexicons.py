"""Reproducible authoring import. Runtime never downloads these sources or uses Python.
Requires wordfreq for offline selection only; caches inputs under tmp/word-lexicons.
"""
import collections, hashlib, json, pathlib, re, urllib.request
from concurrent.futures import ThreadPoolExecutor
from wordfreq import get_frequency_dict
from word_bridge_format import write_bridge
FREQUENCIES = {lang: get_frequency_dict(lang) for lang in ['en','zh','ja','ko']}
def zipf_frequency(word, lang, **kwargs):
    return FREQUENCIES[lang].get(word, 0)

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / 'tmp/word-lexicons'
OUT = ROOT / 'data/adventure/locale'
CACHE.mkdir(parents=True, exist_ok=True)
SOURCE_REV = '406bf83b3c507a3d1f26e88252d5d66893fd36bf'
BASE = f'https://raw.githubusercontent.com/omwn/omw-data/{SOURCE_REV}/wns/'
SOURCES = {'en': ('eng', 'wn-data-eng.tab'), 'zh': ('cow', 'wn-data-cmn.tab'), 'ja': ('jpn', 'wn-data-jpn.tab'), 'ko': ('wikt', 'wn-wikt-kor.tab')}

def download(item):
    lang, (folder, name) = item
    result = []
    for remote, local in [(name, lang+'.tab'), ('LICENSE', lang+'-LICENSE.txt'), ('citation.bib', lang+'-citation.txt')]:
        target = CACHE / local
        if not target.exists():
            target.write_bytes(urllib.request.urlopen(BASE+folder+'/'+remote, timeout=90).read())
        result.append(target)
    print('source', lang, flush=True)
    return lang, result

files = dict(ThreadPoolExecutor(4).map(download, SOURCES.items()))
lex = {}; synsets = {}
for lang, paths in files.items():
    entries = collections.defaultdict(set); syn = collections.defaultdict(list)
    for line in paths[0].read_text(encoding='utf8').splitlines():
        parts = line.split('\t')
        if len(parts) != 3 or not (parts[1].endswith(':lemma') or parts[1]=='lemma'): continue
        sense, _, word = parts; word = word.replace('_', ' ').strip()
        if lang=='en' and word!=word.lower(): continue
        word=word.lower()
        # COW marks grammatical suffixes as e.g. 大+的 / 公开+地, not literal plus signs.
        if lang=='zh':word=word.replace('+的','').replace('+地','').replace('+','')
        pattern = {'en': r"[a-z]+(?:['-][a-z]+)*", 'zh': r'[\u3400-\u9fff]{1,8}', 'ja': r'[\u3040-\u30ff\u3400-\u9fffー]{1,16}', 'ko': r'[가-힣]{1,16}'}[lang]
        if not re.fullmatch(pattern, word): continue
        entries[word].add('wn30:'+sense); syn['wn30:'+sense].append(word)
    lex[lang] = entries; synsets[lang] = syn
    print('lemmas', lang, len(entries), flush=True)

# All local corrections are authored separately and take precedence over imported lemmas.
overrides = json.loads((ROOT/'data/adventure/dictionary/word-overrides.json').read_text(encoding='utf8'))
glosses=json.loads((ROOT/'data/adventure/dictionary/tree-glosses.json').read_text(encoding='utf8'))['meanings']
explicit_forms={lang:{form for row in overrides[lang] for form in row['forms']} for lang in SOURCES}
explicit_forms['en'].update(form for forms in overrides['englishIrregular'].values() for form in forms if form not in {'saw','left','found','rose'})
selected = {}
for lang, entries in lex.items():
    excluded=set(overrides.get('excluded',{}).get(lang,[]))
    eligible = [(word, senses) for word, senses in entries.items() if word not in excluded and any(s in synsets['zh'] for s in senses)]
    # Frequency is a selection aid, not a proficiency claim. Do not import names or multiword sentences.
    eligible.sort(key=lambda row: (-zipf_frequency(row[0], lang, wordlist='best'), row[0]))
    chosen = {row['text']: row.copy() for row in overrides[lang]}
    for word, senses in eligible:
        if len(chosen) >= 2000: break
        if word in chosen or word in explicit_forms[lang]: continue
        meanings = sorted({z for s in senses for z in synsets['zh'].get(s, [])}, key=lambda z: (-zipf_frequency(z, 'zh'), len(z), z))
        chosen[word] = {'text': word, 'meaning': glosses.get(word,'；'.join(meanings[:3])) if lang=='en' else '；'.join(meanings[:3]), 'forms': [], 'senses': sorted(senses), 'pos': ''.join(sorted({s[-1] for s in senses}))}
    selected[lang] = chosen

# Only dictionary-backed noun/verb inflections are generated offline. No runtime suffix guesses.
irregular = overrides.get('englishIrregular', {})
for word, row in selected['en'].items():
    forms = set(row['forms'])
    if word in irregular: forms.update(irregular[word])
    elif row.get('pos') != 'function' and ('v' in row.get('pos', '') or 'n' in row.get('pos', '')):
        plural = word[:-1]+'ies' if re.search(r'[^aeiou]y$', word) else word+'es' if re.search(r'(s|x|z|ch|sh)$', word) else word+'s'
        forms.add(plural)
        if 'v' in row.get('pos', ''):
            past = word+'d' if word.endswith('e') else word[:-1]+'ied' if re.search(r'[^aeiou]y$', word) else word+'ed'
            ing = word[:-2]+'ying' if word.endswith('ie') else word[:-1]+'ing' if word.endswith('e') and not word.endswith(('ee','ye','oe')) else word+'ing'
            forms.update([past, ing])
    row['forms'] = sorted(f for f in forms-{word} if f in irregular.get(word,[]) or f in row['forms'] or zipf_frequency(f,'en')>0)

manifest = {'formatVersion': 2, 'description': '所有语言共用中文键；中文表为逗号分隔中文键列表，非中文表为逗号分隔中文键||逗号分隔词形，相同词形列表合并，空值表示尚无译词。许可证见locale/word-LICENSE.txt。', 'sources': {}}
notices = {}
for lang, chosen in selected.items():
    folder, name = SOURCES[lang]; paths = files[lang]
    notice = paths[1].read_text(encoding='utf8')+'\n'+paths[2].read_text(encoding='utf8')
    if lang!='zh':notice+='\nChinese gloss labels:\n'+files['zh'][1].read_text(encoding='utf8')+'\n'+files['zh'][2].read_text(encoding='utf8')
    header = '# Haqi common vocabulary v1\n# Adapted from Open Multilingual Wordnet: '+BASE+folder+'/'+name+'\n'
    header += '# Changes: frequency selection, Chinese gloss labels, explicit forms, local corrections.\n'
    header += '# Selection ranking: wordfreq 3.1.1 by Robyn Speer, https://github.com/rspeer/wordfreq ; no frequency scores shipped.\n'
    header += '# '+notice.replace('\n', '\n# ')+'\n'
    if lang == 'ko': header += '# Adapted Korean word data: CC BY-SA 3.0 https://creativecommons.org/licenses/by-sa/3.0/ ; Wiktionary contributors.\n'
    notices[lang] = header
    manifest['sources'][lang]={'url':BASE+folder+'/'+name,'sha256':hashlib.sha256(paths[0].read_bytes()).hexdigest(),'entries':len(chosen),'forms':sum(len(r['forms']) for r in chosen.values())}
    print('written',lang,len(chosen),flush=True)
keys, tables = write_bridge(OUT, selected, notices, FREQUENCIES['zh'],
                            required=[row['text'] for row in overrides['zh']])
manifest['selection'] = {'limit': 2000, 'ranking': 'wordfreq 3.1.1 Chinese frequency',
                         'required': 'word-overrides.json zh entries',
                         'unit': 'expanded Chinese keys, shared by all languages'}
for lang, source in manifest['sources'].items():
    source['keys'] = len(keys)
    source['translatedKeys'] = len(keys) if lang == 'zh' else len(tables[lang])
(ROOT/'data/adventure/dictionary/word-sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
