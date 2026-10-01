"""Content integrity tests; no game or generated files are written."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('story_export', ROOT / 'scripts/export_story.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StoryExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.export = module.Exporter().build()
        cls.outputs = cls.export.outputs()

    def test_reproducible_and_no_draft_overwrite(self):
        self.assertEqual(self.outputs, module.Exporter().build().outputs())
        self.assertNotIn('story-samples.md', self.outputs)
        self.assertNotIn('story-design.md', self.outputs)
        for name, text in self.outputs.items():
            self.assertEqual((module.OUT / name).read_text(encoding='utf8'), text)

    def test_quest_and_active_story_coverage(self):
        scenes = self.export.scenes
        original = [s for s in scenes if s['key'].startswith('original:')]
        self.assertEqual(len(original), len(self.export.catalog['quests']))
        self.assertEqual(sum(s['kind'] == 'obsolete' for s in original), 257)
        self.assertEqual(sum(s['kind'] == 'current' and 'questId' in s for s in scenes), 427)
        self.assertEqual(sum(s['key'].startswith('journey:') for s in scenes), 18)
        self.assertEqual(sum(s['key'].startswith('conversation:') and s['kind'] == 'current' for s in scenes), 66)

    def test_source_and_author_validation(self):
        bad = copy.deepcopy(self.export)
        writable = next(l for s in bad.scenes for l in s['lines'] if l['writable'])
        writable['text'] = '错误地挪到了另一个字段'
        with self.assertRaises(AssertionError):
            bad.validate()

    def test_phase_and_dependency_order(self):
        current = self.export.ordered('current')
        positions = {s['questId']: i for i, s in enumerate(current) if 'questId' in s}
        for i, s in enumerate(current):
            for dep in s['requires']:
                if dep in positions:
                    self.assertLess(positions[dep], i)
        s = next(s for s in self.export.scenes if s['key'] == 'original:63014')
        phases = [l['phase'] for l in s['lines']]
        self.assertLess(phases.index('接取'), phases.index('指定交谈'))
        self.assertLess(phases.index('指定交谈'), phases.index('交付'))

    def test_insert_reorder_and_tombstones(self):
        e = module.Exporter().build()
        s = next(s for s in e.scenes if s['key'] == 'chapter:63013')
        expected = {l['text']: l['id'] for l in next(s for s in self.export.scenes if s['key'] == 'chapter:63013')['lines']}
        inserted = {**s['lines'][0], 'key': 'new-insertion', 'text': '测试插入，不能占用任何旧编号。'}
        s['lines'].insert(1, inserted)
        s['lines'].reverse()
        e.assign_lines()
        for l in s['lines']:
            if l['text'] in expected:
                self.assertEqual(l['id'], expected[l['text']])
        self.assertNotIn(inserted['id'], expected.values())
        # Retired IDs must not be allocated to new content at an old key.
        old_id = inserted['id']
        e.active_line_ids = {l['id'] for l in s['lines'] if l is not inserted}
        inserted['text'] = '另一个新段落'
        e.assign_lines()
        self.assertNotEqual(inserted['id'], old_id)

    def test_sample_slots_and_three_levels(self):
        variants = module.read('docs/story/sample-variants.json')
        scenes = {s['id']: s for s in self.export.scenes}
        for sample in variants['scenes']:
            self.assertEqual(set(sample['lines']), {l['id'] for l in scenes[sample['id']]['lines']})
            for texts in sample['lines'].values():
                self.assertEqual(len(texts), 3)
                self.assertTrue(all(isinstance(t, str) and t.strip() for t in texts))

    def test_noise_and_rewards(self):
        self.assertNotIn('script/apps/', self.outputs['story-master.md'])
        s = next(s for s in self.export.scenes if s['key'] == 'chapter:63013')
        self.assertEqual(s['rewards'], self.export.chapter['quests'][-1]['rewards'])
        reward = self.export.rewards(s['rewards'])
        self.assertIn('经验 × 1000', reward)
        self.assertIn('仙豆 × 200', reward)
        s = next(s for s in self.export.scenes if s['key'] == 'conversation:camp:11:36211.beginner1')
        self.assertEqual(len(s['lines']), 7)  # no invisible opening/nonfinal responses


if __name__ == '__main__':
    unittest.main()
