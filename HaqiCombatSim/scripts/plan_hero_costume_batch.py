"""Build independent costume-edit requests from fixed gender base atlases.

This creates a plan only; it neither generates art nor registers/uploads outputs.
All variants in a batch share the same versioned reference for their gender.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build_plan():
    definitions = []
    for filename in ('prompts.json', 'no-cape-prompts.json'):
        definitions.extend(json.loads((ROOT / 'art-references/body-variants' / filename).read_text(encoding='utf-8')))
    references = {}
    for gender in ('male', 'female'):
        local = f'assets/hero-preview/{gender}-walk-ref.webp'
        references[gender] = {'local': local, 'sha256': hashlib.sha256((ROOT / local).read_bytes()).hexdigest(),
                             'motionReview': json.loads((ROOT / f'art-references/walk-reference/{gender}-walk-ref.json').read_text(encoding='utf-8'))['status']}
    requests = []
    for spec in definitions:
        reference = references[spec['gender']]
        requests.append({'id': spec['id'], 'name': spec['name'], 'gender': spec['gender'],
                         'reference': dict(reference), 'design': spec['design'],
                         'prompt': '仅修改参考图中角色的服装：' + spec['design'] +
                         '。保留参考图全部动作、朝向、身体比例、脖子位置和帧排列。服装轮廓可以改变，肢体姿势不变。'
                         '7列4行，前6列走路，最后1列站立；各行正面、左侧、右侧、背面。不要头，透明背景。',
                         'output': f"assets/hero-preview/{spec['id']}-walk-cycle.webp"})
    return {'version': 1, 'mode': 'independent-edits-from-fixed-base',
            'references': references, 'requests': requests,
            'rules': ['Reference inputs are the fixed gender base only, never another costume or failed generation.',
                      'Review base motion once before batch generation; costume prompts do not redesign motion.',
                      'Retry a failed costume from the same base and design, not from the failed image.',
                      'Record actual reference hash and prompt for every generation; packing base is not proof of generation reference.',
                      'A base revision creates a new batch; do not mix reference hashes within one batch.']}


if __name__ == '__main__':
    plan = build_plan()
    target = ROOT / 'art-references/body-variants/fixed-base-batch.json'
    target.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Planned {len(plan["requests"])} independent costume edits; no images generated.')
