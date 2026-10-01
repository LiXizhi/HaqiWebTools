"""Chapter classification and document routing; read-only fixtures."""
import importlib.util
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('story_export_chapters', ROOT / 'scripts/export_story.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ChapterTests(unittest.TestCase):
    def classify(self, dependencies):
        return module.quest_chains({q: {'requires': p} for q, p in dependencies.items()})

    def test_four_is_minimum(self):
        chains, side = self.classify({1: [], 2: [1], 3: [2], 4: [3], 5: [], 6: [5], 7: [6]})
        self.assertEqual(chains[0]['questIds'], [1, 2, 3, 4])
        self.assertEqual(side, [5, 6, 7])

    def test_fanout_and_short_offshoots_are_side_quests(self):
        chains, side = self.classify({1: [], 2: [1], 3: [1], 4: [1], 5: [1]})
        self.assertFalse(chains)
        self.assertEqual(side, [1, 2, 3, 4, 5])
        chains, side = self.classify({1: [], 2: [1], 3: [2], 4: [3], 5: [1]})
        self.assertEqual(chains[0]['questIds'], [1, 2, 3, 4])
        self.assertEqual(side, [5])

    def test_parallel_chapters_and_merge(self):
        chains, side = self.classify({1: [], 2: [1], 3: [2], 4: [3], 10: [], 11: [10], 12: [11], 13: [12]})
        self.assertEqual([c['id'] for c in chains], ['C1', 'C10'])
        chains, side = self.classify({1: [], 2: [], 3: [1, 2], 4: [3], 5: [4]})
        self.assertEqual(chains[0]['roots'], [1, 2])
        self.assertFalse(side)

    def test_cycles_do_not_become_fake_chapters(self):
        with self.assertRaises(ValueError):
            self.classify({1: [2], 2: [1]})

    def test_actual_partition_level_order_and_links(self):
        exporter = module.Exporter().build()
        outputs = exporter.outputs()
        index = module.read('docs/story/story-index.json')
        chapters = index['questChapters']
        ids = [q for c in chapters for q in c['questIds']] + index['sideQuestIds']
        self.assertEqual(len(ids), 427)
        self.assertEqual(len(set(ids)), 427)
        levels = [(c['levelMin'] is None, c['levelMin'] or 0, c['roots'][0]) for c in chapters]
        self.assertEqual(levels, sorted(levels))
        self.assertNotRegex(outputs['story-master.md'], r'\[S\d+-L\d+\]')
        for c in chapters:
            self.assertGreaterEqual(c['longestPath'], 4)
            self.assertIn(c['document'], outputs)
            self.assertIn(f']({c["document"]})', outputs['story-master.md'])
        headings = {name: set(re.findall(r'^### \[(S\d+)\]', text, re.M)) for name, text in outputs.items() if name.endswith('.md')}
        for scene in exporter.scenes:
            self.assertEqual([name for name, scene_ids in headings.items() if scene['id'] in scene_ids], [scene['document']])
        for name, text in outputs.items():
            self.assertEqual((module.OUT / name).read_text(encoding='utf8'), text)


if __name__ == '__main__':
    unittest.main()
