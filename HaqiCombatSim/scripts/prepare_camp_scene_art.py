"""Convert and pack Magic Camp scene atlases (buildings, trees, props) with clean RGBA alpha and <=200KB WebP budget."""
import argparse, collections, hashlib, json
from pathlib import Path
from PIL import Image
from prepare_environment_art import prepare, ROOT

def remove_white_background(src_path: Path, out_png: Path, cols: int, rows: int) -> Path:
    img = Image.open(src_path).convert('RGBA')
    w, h = img.size
    px = img.load()

    for r in range(rows):
        for c in range(cols):
            x0 = round(c * w / cols)
            y0 = round(r * h / rows)
            x1 = round((c + 1) * w / cols)
            y1 = round((r + 1) * h / rows)
            cw, ch = x1 - x0, y1 - y0

            visited = bytearray(cw * ch)
            queue = collections.deque()

            def is_bg_candidate(R, G, B):
                mx = max(R, G, B)
                mn = min(R, G, B)
                sat = mx - mn
                lum = (R * 299 + G * 587 + B * 114) // 1000
                # Pure/near white or very faint neutral cast shadow on white
                if lum >= 238 and sat <= 20:
                    return True
                if lum >= 205 and sat <= 14:
                    return True
                return False

            for bx in range(cw):
                for by in (0, 1, ch - 2, ch - 1):
                    idx = by * cw + bx
                    if not visited[idx]:
                        visited[idx] = 1
                        queue.append((bx, by))
            for by in range(ch):
                for bx in (0, 1, cw - 2, cw - 1):
                    idx = by * cw + bx
                    if not visited[idx]:
                        visited[idx] = 1
                        queue.append((bx, by))

            # Also clear enclosed pure-white structural cutouts (e.g. between fence rails, pier posts, tent ropes, root stems)
            for cy in range(4, ch - 4):
                for cx in range(4, cw - 4):
                    R, G, B, _ = px[x0 + cx, y0 + cy]
                    if R >= 249 and G >= 249 and B >= 249 and max(R, G, B) - min(R, G, B) <= 6:
                        idx = cy * cw + cx
                        if not visited[idx]:
                            visited[idx] = 1
                            queue.append((cx, cy))

            while queue:
                cx, cy = queue.popleft()
                R, G, B, _ = px[x0 + cx, y0 + cy]
                if not is_bg_candidate(R, G, B):
                    continue
                visited[cy * cw + cx] = 2  # Confirmed exterior background / shadow
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < cw and 0 <= ny < ch:
                        nidx = ny * cw + nx
                        if not visited[nidx]:
                            visited[nidx] = 1
                            queue.append((nx, ny))

            # Apply transparency to exterior background and feather 1px boundary
            for cy in range(ch):
                for cx in range(cw):
                    state = visited[cy * cw + cx]
                    R, G, B, A = px[x0 + cx, y0 + cy]
                    lum = (R * 299 + G * 587 + B * 114) // 1000
                    sat = max(R, G, B) - min(R, G, B)
                    if state == 2:
                        if lum >= 240 and sat <= 18:
                            px[x0 + cx, y0 + cy] = (0, 0, 0, 0)
                        else:
                            # Soft neutral contact shadow fades smoothly to transparent
                            shadow_alpha = max(0, min(110, int((242 - lum) * 2.6)))
                            if shadow_alpha < 14:
                                px[x0 + cx, y0 + cy] = (0, 0, 0, 0)
                            else:
                                px[x0 + cx, y0 + cy] = (32, 46, 38, shadow_alpha)
                    else:
                        # Check if adjacent to exterior transparent pixel for anti-aliased edge
                        adj_bg = False
                        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                            if 0 <= nx < cw and 0 <= ny < ch and visited[ny * cw + nx] == 2:
                                adj_bg = True
                                break
                        if adj_bg and lum >= 220 and sat <= 26:
                            edge_alpha = max(0, min(220, int((248 - lum) * 7)))
                            # Color decontamination against white
                            if edge_alpha > 0:
                                f = edge_alpha / 255.0
                                dR = max(0, min(255, int((R - 255 * (1 - f)) / max(0.15, f))))
                                dG = max(0, min(255, int((G - 255 * (1 - f)) / max(0.15, f))))
                                dB = max(0, min(255, int((B - 255 * (1 - f)) / max(0.15, f))))
                                px[x0 + cx, y0 + cy] = (dR, dG, dB, edge_alpha)
                            else:
                                px[x0 + cx, y0 + cy] = (0, 0, 0, 0)

    out_png.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_png, 'PNG')
    return out_png

def retain_cdn(row, old):
    if old and row['sha256'] == old.get('sha256') and old.get('cdn'):
        row['cdn'] = old['cdn']
    return row

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--buildings-src', type=Path)
    parser.add_argument('--trees-src', type=Path)
    parser.add_argument('--props-src', type=Path)
    parser.add_argument('--island-landmarks-src', type=Path)
    parser.add_argument('--island-trees-src', type=Path)
    parser.add_argument('--island-plazas-src', type=Path)
    args = parser.parse_args()

    cache_dir = ROOT / '.cache' / 'camp-scene-art'
    summary = {}

    if args.buildings_src:
        buildings_png = remove_white_background(args.buildings_src, cache_dir / 'buildings-camp-source.png', 3, 2)
        buildings_manifest_path = ROOT / 'data/adventure/building-art.json'
        buildings_manifest = json.loads(buildings_manifest_path.read_text(encoding='utf8'))
        camp_building_names = ['academy', 'observatory', 'cabin', 'tent', 'harbor', 'plazaMedallion']
        camp_buildings_row = prepare(buildings_png, camp_building_names, 3, 304, 'buildings-camp')
        for idx, name in enumerate(camp_building_names):
            camp_buildings_row['frames'][name]['cell'] = idx
        camp_buildings_row['source']['prompt'] = 'data/adventure/building-art-plan.json#camp'
        camp_buildings_row['source']['reference'] = 'data/adventure/world-map-art.json'
        retain_cdn(camp_buildings_row, buildings_manifest['atlases'].get('camp'))
        buildings_manifest['atlases']['camp'] = camp_buildings_row
        buildings_manifest_path.write_text(json.dumps(buildings_manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        summary['camp_buildings'] = {k: camp_buildings_row[k] for k in ('local', 'width', 'height', 'size', 'sha256')}

    env_manifest_path = ROOT / 'data/adventure/environment-art.json'
    env_manifest = json.loads(env_manifest_path.read_text(encoding='utf8'))

    if args.trees_src:
        trees_png = remove_white_background(args.trees_src, cache_dir / 'camp-trees-source.png', 2, 2)
        camp_tree_names = ['tallPine', 'layeredPine', 'cypressPine', 'blossomTree']
        camp_trees_row = prepare(trees_png, camp_tree_names, 2, 326, 'camp-trees')
        retain_cdn(camp_trees_row, env_manifest['atlases'].get('campTrees'))
        env_manifest['atlases']['campTrees'] = camp_trees_row
        summary['camp_trees'] = {k: camp_trees_row[k] for k in ('local', 'width', 'height', 'size', 'sha256')}

    if args.props_src:
        props_png = remove_white_background(args.props_src, cache_dir / 'camp-props-source.png', 3, 2)
        camp_prop_names = ['woodFence', 'magicLantern', 'lushBush', 'flowerBed', 'mossBoulder', 'coastalRockCluster']
        camp_props_row = prepare(props_png, camp_prop_names, 3, 272, 'camp-props')
        retain_cdn(camp_props_row, env_manifest['atlases'].get('campProps'))
        env_manifest['atlases']['campProps'] = camp_props_row
        summary['camp_props'] = {k: camp_props_row[k] for k in ('local', 'width', 'height', 'size', 'sha256')}

    if args.island_landmarks_src:
        landmarks_png = remove_white_background(args.island_landmarks_src, cache_dir / 'island-landmarks-source.png', 3, 2)
        landmark_names = ['townCastle', 'townWindmill', 'fireGoldTree', 'desertPyramid', 'darkCitadelRuins', 'iceCrystalSanctum']
        landmarks_row = prepare(landmarks_png, landmark_names, 3, 288, 'island-landmarks')
        retain_cdn(landmarks_row, env_manifest['atlases'].get('islandLandmarks'))
        env_manifest['atlases']['islandLandmarks'] = landmarks_row
        summary['island_landmarks'] = {k: landmarks_row[k] for k in ('local', 'width', 'height', 'size', 'sha256')}

    if args.island_trees_src:
        itrees_png = remove_white_background(args.island_trees_src, cache_dir / 'island-trees-source.png', 3, 2)
        itree_names = ['autumnGoldTree', 'tropicalPalm', 'desertCactus', 'charredEmberTree', 'darkShadowTree', 'darkWeepingTree']
        itrees_row = prepare(itrees_png, itree_names, 3, 288, 'island-trees')
        retain_cdn(itrees_row, env_manifest['atlases'].get('islandTrees'))
        env_manifest['atlases']['islandTrees'] = itrees_row
        summary['island_trees'] = {k: itrees_row[k] for k in ('local', 'width', 'height', 'size', 'sha256')}

    if args.island_plazas_src:
        plazas_png = remove_white_background(args.island_plazas_src, cache_dir / 'island-plazas-props-source.png', 3, 2)
        plaza_names = ['townPlazaMedallion', 'firePlazaMedallion', 'icePlazaMedallion', 'desertPlazaMedallion', 'darkPlazaMedallion', 'biomeCrystalCluster']
        plazas_row = prepare(plazas_png, plaza_names, 3, 272, 'island-plazas-props')
        retain_cdn(plazas_row, env_manifest['atlases'].get('islandPlazasProps'))
        env_manifest['atlases']['islandPlazasProps'] = plazas_row
        summary['island_plazas_props'] = {k: plazas_row[k] for k in ('local', 'width', 'height', 'size', 'sha256')}

    env_manifest_path.write_text(json.dumps(env_manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
