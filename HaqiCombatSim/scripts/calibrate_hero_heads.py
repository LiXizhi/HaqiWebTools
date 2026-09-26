"""Apply reviewed anatomical neck anchors without modifying atlas pixels.

Coordinates are local to each 144px cell; the hair silhouette is not a neck.
Also called by both head packers so re-export cannot erase calibration.
"""
import json, hashlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PROFILE=ROOT/'art-references/hero-head-anchors.json'

def calibrate(manifest):
    profiles=json.loads(PROFILE.read_text(encoding='utf-8'))
    manifest['headCalibration']=hashlib.sha256(PROFILE.read_bytes()).hexdigest()[:10]
    for key,profile in profiles['heads'].items():
        head=manifest['heads'].get(key)
        if not head: continue
        assert len(profile['anchors'])==len(head['frames'])==16,key
        for frame,anchor in zip(head['frames'],profile['anchors']):
            if anchor is not None: frame['neck']=anchor
        head['anchorProfile']='art-references/hero-head-anchors.json#'+key
    return manifest

if __name__=='__main__':
    path=ROOT/'data/hero-preview.json'
    manifest=calibrate(json.loads(path.read_text(encoding='utf-8')))
    text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    path.write_text(text,encoding='utf-8')
    (ROOT/'data/adventure/hero-art.json').write_text(text,encoding='utf-8')
