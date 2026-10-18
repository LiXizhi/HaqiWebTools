"""Run with python -m unittest discover -s tests -p home_art_packing_test.py."""
import importlib.util
import unittest
from pathlib import Path
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('home_pack', Path(__file__).resolve().parents[1] / 'scripts/prepare_home_art.py')
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)

class PackingTests(unittest.TestCase):
    def test_rejects_opaque_sources(self):
        for mode in ['RGB', 'RGBA']:
            with self.assertRaises(ValueError):
                pack.transparent_objects(Image.new(mode, (400, 400), 'white'))

    def test_preserves_objects_crossing_nominal_grid_and_disconnected_parts(self):
        image = Image.new('RGBA', (400, 400))
        draw = ImageDraw.Draw(image)
        for row in range(4):
            for col in range(4):
                draw.rectangle((col*100+20, row*100+30, col*100+70, row*100+70), fill=(255,255,255,255))
        draw.rectangle((30, 70, 50, 110), fill=(255,255,255,255))
        draw.rectangle((75, 35, 90, 55), fill=(200,100,50,160))
        objects = pack.transparent_objects(image)
        self.assertEqual(len(objects), 16)
        first, box = objects[0]
        self.assertEqual(box, (20,30,91,111))
        self.assertEqual(first.getpixel((15,75)), (255,255,255,255))
        self.assertEqual(first.getpixel((60,10)), (200,100,50,160))
        self.assertEqual(first.getpixel((60,70))[3], 0)

if __name__ == '__main__':
    unittest.main()
