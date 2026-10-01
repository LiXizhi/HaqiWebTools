#!/usr/bin/env python3
"""Explicitly render the authored sample-variants.json; never edit the author file."""
import argparse
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1] / 'docs/story'


def render():
    index = json.loads((BASE / 'story-index.json').read_text(encoding='utf8'))
    variants = json.loads((BASE / 'sample-variants.json').read_text(encoding='utf8'))
    scenes = {s['id']: s for s in index['scenes']}
    rows = ['# 中文三档改写样章', '', '> 全部为未应用的编辑稿。三个样章组包含四个来源场景：毕业与启程、冰封的回信、青龙入门交流。奖励不随档位变化。', '',
            '三档不是按年龄分组，也不直接等同英语等级。低档保留相同情节信息，高档增加表达层次。原版未迁移场景只供未来恢复时参考。', '',
            '作者源为 sample-variants.json，按稳定编号修改；普通故事导出不会覆盖本稿。进阶不意味着单句必须更长。未来翻译后需实测20秒录音上限；本轮没有真人试听或学习效果验证。', '']
    for sample in variants['scenes']:
        scene = scenes[sample['id']]
        assert set(sample['lines']) == {line['id'] for line in scene['lines']}, f'{scene["id"]} 来源槽位变化，先人工核对'
        rows += [f'## [{scene["id"]}] {sample["title"]}', '', '**事实锁定**：' + sample['facts'], '', '**配音意图**：' + sample['intent'], '', '### 原文', '']
        for line in scene['lines']:
            rows += [f'[{line["id"]}] {line["speaker"]}：{line["text"].strip()}', '']
        for i, level in enumerate(['入门', '基础', '进阶']):
            rows += [f'### {level}', '']
            for line in scene['lines']:
                rows += [f'[{line["id"]}] {line["speaker"]}：{sample["lines"][line["id"]][i]}', '']
        rows += ['**奖励与接入**：' + (scene.get('rewardNote') or '原任务奖励保持原样，见故事总稿同编号场景。'), '']
    rows += ['## 编辑检查', '', '- 四个场景三档条目与来源逐条对应；没有新增玩家发言或奖励节点。',
             '- 毕业后才祝贺通过；启程保留导师、船长、伍迪的阶段顺序。',
             '- 回信没有把入场写成任务完成；暖石仍是既有叙述，不新增交互承诺。',
             '- 入门交流仍是三轮，不将示例姓名固定进玩家身份。',
             '- 原文未显示的回应及被通用按钮替代的回答不列入样章；编号空缺保留，不压缩重排。',
             '- 本组检验在原有事实下的表达分级，更大幅度的悬念重编见故事设计；不能为了反转增加未实现的事件。', '']
    return '\n'.join(rows) + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = render()
    target = BASE / 'story-samples.md'
    if args.check:
        if target.read_text(encoding='utf8') != result:
            raise SystemExit('样章展示稿与作者源不一致')
        print('三档样章与作者源一致。')
    else:
        target.write_text(result, encoding='utf8', newline='\n')
