"""Offline authoring helper: route fictional Shenzhen roads over HelloWorld land cover.
Requires Pillow. Downloads only the two Shenzhen tiles; never runs at game startup.
"""
import heapq
import io
import json
from pathlib import Path
from urllib.request import urlopen
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGES = {}

def land(x, y):
    lon, lat = x / 256 - 180 + 1 / 512, 90 - y / 256 - 1 / 512
    west, south = int(lon // 2) * 2, int(lat // 2) * 2
    if (west, south) not in IMAGES:
        url = f'https://cdn.keepwork.com/worldmap/terrain_{west}_{west+2}_{south}_{south+2}.png'
        with urlopen(url, timeout=30) as response:
            IMAGES[west, south] = Image.open(io.BytesIO(response.read())).convert('RGB')
    return IMAGES[west, south].getpixel((int((lon-west)*256), int((south+2-lat)*256))) not in [(26,91,171),(0,0,0)]

def pixel(p):
    return int((p[0]+180)*256), int((90-p[1])*256)

def geo(p):
    return [round(p[0]/256-180+1/512, 7), round(90-p[1]/256-1/512, 7)]

def route(a, b):
    start, end = pixel(a), pixel(b)
    assert land(*start) and land(*end), (a, b)
    queue, costs, previous = [(0, start)], {start: 0}, {}
    while queue:
        _, point = heapq.heappop(queue)
        if point == end:
            break
        for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]:
            neighbour = point[0]+dx, point[1]+dy
            if abs(neighbour[0]-start[0])+abs(neighbour[1]-start[1]) > 500 or not land(*neighbour):
                continue
            cost = costs[point]+1
            if cost >= costs.get(neighbour, float('inf')):
                continue
            costs[neighbour], previous[neighbour] = cost, point
            heapq.heappush(queue, (cost+abs(end[0]-neighbour[0])+abs(end[1]-neighbour[1]), neighbour))
    assert end in costs, 'No land route'
    points = [end]
    while points[-1] != start:
        points.append(previous[points[-1]])
    points.reverse()
    simple = [points[0]]
    for i in range(1, len(points)-1):
        if (points[i][0]-points[i-1][0], points[i][1]-points[i-1][1]) != (points[i+1][0]-points[i][0], points[i+1][1]-points[i][1]):
            simple.append(points[i])
    simple.append(end)
    return [a]+[geo(p) for p in simple]+[b]

def main():
    roads = [dict(id='west-east', width=85, points=[[113.9139,22.483],[113.93,22.52],[113.9904,22.527],[114.05,22.531],[114.0864,22.543],[114.52,22.594]]),
             dict(id='central', width=80, points=[[114.05,22.531],[114.0579,22.5431],[114.0521,22.553]])]
    for road in roads:
        points = road['points']
        road['points'] = [p for a,b in zip(points, points[1:]) for p in route(a,b)[:-1]]+[points[-1]]
    data = dict(version=1, roads=roads, source='Game roads routed on HelloWorld land-cover pixel centers; fictional, not surveyed streets.')
    (ROOT/'data/adventure/earth/shenzhen/roads.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print([(r['id'], len(r['points'])) for r in roads])

if __name__ == '__main__':
    main()
