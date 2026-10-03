"""Fetch bounded WGS84 OSM geometry, or normalize a local OSM XML/JSON/GeoJSON.

python scripts/fetch_place_geometry.py --lon 113.9157 --lat 22.5454 --output place.osm.json
python scripts/fetch_place_geometry.py --input place.osm --output place.osm.json
No API key; bounded timeout/retries; no writes to city content or player data.
"""
import argparse,datetime,json,math,time,urllib.parse,urllib.request,xml.etree.ElementTree as ET
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--lon',type=float);p.add_argument('--lat',type=float);p.add_argument('--meters',type=float,default=300);p.add_argument('--crs',default='WGS84',choices=['WGS84']);p.add_argument('--input',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--endpoint',default='https://overpass-api.de/api/interpreter');a=p.parse_args()
if a.input:
    if a.input.suffix in ['.osm','.xml']:
        root=ET.parse(a.input).getroot();elements=[]
        for e in root:
            if e.tag not in ['node','way']:continue
            row={'type':e.tag,'id':int(e.attrib['id']),'tags':{t.attrib['k']:t.attrib['v'] for t in e.findall('tag')}}
            if e.tag=='node':row.update(lon=float(e.attrib['lon']),lat=float(e.attrib['lat']))
            else:row['nodes']=[int(n.attrib['ref']) for n in e.findall('nd')]
            elements.append(row)
        data={'version':'0.6','elements':elements}
    else:data=json.loads(a.input.read_text(encoding='utf8'))
    source=str(a.input)
else:
    if a.lon is None or a.lat is None or not(-180<=a.lon<=180 and -85<=a.lat<=85 and 50<=a.meters<=512):p.error('需要有效的经纬度和50–512米范围')
    # Fetch a 100m margin so long road/coastline segments can be clipped reliably.
    dy=(a.meters/2+100)/111319.49;dx=dy/math.cos(math.radians(a.lat));bbox=f'{a.lat-dy},{a.lon-dx},{a.lat+dy},{a.lon+dx}'
    selectors=['way[highway]','way[building]','way[natural]','way[landuse]','way[leisure]','node[amenity]','node[highway=traffic_signals]']
    query='[out:json][timeout:25];('+''.join(s+'('+bbox+');' for s in selectors)+');out geom;'
    source=a.endpoint+'?data='+urllib.parse.quote(query)
    for attempt in range(3):
        try:
            req=urllib.request.Request(source,headers={'User-Agent':'HaqiPlaceAuthor/1.0 (bounded offline scene authoring)'})
            with urllib.request.urlopen(req,timeout=35) as r:data=json.load(r)
            if data.get('remark'):raise ValueError(data['remark'])
            if not data.get('elements'):raise ValueError('没有可用地理数据，不能冒充实景复刻')
            break
        except Exception:
            if attempt==2:raise
            time.sleep(1+attempt)
data['authoringSource']={'url':source,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'crs':a.crs,'license':'https://www.openstreetmap.org/copyright' if not a.input else 'retain input license; verify before use'}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'output':str(a.output),'elements':len(data.get('elements',data.get('features',[])))},ensure_ascii=False))
