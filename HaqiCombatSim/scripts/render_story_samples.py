#!/usr/bin/env python3
"""Explicitly render the authored sample-text.json; never edit the author file."""
import argparse
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1] / 'docs/story'


def render():
    index = json.loads((BASE / 'story-index.json').read_text(encoding='utf8'))
    variants = json.loads((BASE / 'sample-text.json').read_text(encoding='utf8'))
    scenes = {s['id']: s for s in index['scenes']}
    rows = ['# 中文简明改写样章', '', '> 全部为未应用的编辑稿。三个样章组包含四个来源场景：毕业与启程、冰封的回信、青龙入门交流。保留原有任务事实与奖励。', '',
            '面向学习第二语言几个月到一年的人，包括小学生。统一使用常用词、短句和清楚的因果；保留故事悬念，不增加语言难度档位。原版未迁移场景只供未来恢复时参考。', '',
            '作者源为 sample-text.json，按稳定编号修改；普通故事导出不会覆盖本稿。玩家台词尽量一口气说完，不用长句表现深度。未来翻译后需实测20秒录音上限；本轮没有真人试听或学习效果验证。', '']
    for sample in variants['scenes']:
        scene = scenes[sample['id']]
        assert set(sample['lines']) == {line['id'] for line in scene['lines']}, f'{scene["id"]} 来源槽位变化，先人工核对'
        rows += [f'## [{scene["id"]}] {sample["title"]}', '', '**事实锁定**：' + sample['facts'], '', '**配音意图**：' + sample['intent'], '', '### 原文', '']
        for line in scene['lines']:
            rows += [f'[{line["id"]}] {line["speaker"]}：{line["text"].strip()}', '']
        rows += ['### 简明改写', '']
        for line in scene['lines']:
            text = sample['lines'][line['id']]
            assert isinstance(text, str) and text.strip(), '每个编号只保留一份简明文字'
            rows += [f'[{line["id"]}] {line["speaker"]}：{text}', '']
        rows += ['**奖励与接入**：' + (scene.get('rewardNote') or '原任务奖励保持原样，见故事总稿同编号场景。'), '']
    rows += ['## 编辑检查', '', '- 四个场景的简明文字与来源逐条对应；没有新增玩家发言或奖励节点。',
             '- 毕业后才祝贺通过；启程保留导师、船长、伍迪的阶段顺序。',
             '- 回信没有把入场写成任务完成；暖石仍是既有叙述，不新增交互承诺。',
             '- 入门交流仍是三轮，不将示例姓名固定进玩家身份。',
             '- 原文未显示的回应及被通用按钮替代的回答不列入样章；编号空缺保留，不压缩重排。',
             '- 本组检验在原有事实下的简明表达，更大幅度的悬念重编见故事设计；不能为了反转增加未实现的事件。', '']
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
        print('简明样章与作者源一致。')
    else:
        target.write_text(result, encoding='utf8', newline='\n')
