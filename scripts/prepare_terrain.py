"""Prepare real elevation samples and a local shaded relief. Run from collection root."""
import sys, math, json, io, time, hashlib, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / '.day04-tools'))
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'data'
CACHE = ROOT / '.day05-cache'
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(exist_ok=True)
LAT, LON, EARTH = -3.07583, 37.35333, 6371000.
manifest = []

def pixels(lat, lon, z):
    n = 256 * 2**z
    return (lon+180)/360*n, (1-np.arcsinh(np.tan(np.radians(lat)))/np.pi)/2*n

def download(task):
    z,x,y = task
    p = CACHE / f'{z}-{x}-{y}.png'
    url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
    if not p.exists():
        for attempt in range(4):
            try:
                content = urllib.request.urlopen(url, timeout=45).read()
                Image.open(io.BytesIO(content)).verify()
                p.write_bytes(content)
                break
            except Exception:
                if attempt == 3: raise
                time.sleep(attempt+1)
    raw = p.read_bytes()
    manifest.append({'url':url, 'sha256':hashlib.sha256(raw).hexdigest()})
    a = np.asarray(Image.open(io.BytesIO(raw)).convert('RGB'), dtype=np.float32)
    return x,y,a[:,:,0]*256+a[:,:,1]+a[:,:,2]/256-32768

mosaics = []
for z, radius in [(6, 3500), (8, 1600), (10, 110), (12, 15)]:
    dlat = radius/111
    dlon = radius/(111*math.cos(math.radians(LAT)))
    x0,y0 = pixels(LAT+dlat,LON-dlon,z)
    x1,y1 = pixels(LAT-dlat,LON+dlon,z)
    tx0,ty0,tx1,ty1 = int(x0//256),int(y0//256),int(x1//256),int(y1//256)
    tasks = [(z,x,y) for x in range(tx0,tx1+1) for y in range(ty0,ty1+1)]
    a = np.full(((ty1-ty0+1)*256,(tx1-tx0+1)*256), np.nan, dtype=np.float32)
    print(f'Downloading {len(tasks)} tiles at zoom {z}',flush=True)
    with ThreadPoolExecutor(max_workers=10) as pool:
        for x,y,tile in pool.map(download,tasks):
            a[(y-ty0)*256:(y-ty0+1)*256,(x-tx0)*256:(x-tx0+1)*256]=tile
    mosaics.append((z,tx0*256,ty0*256,a,radius))

def sample(lat,lon,dist):
    result = np.full(np.shape(lat),np.nan,dtype=np.float32)
    for z,x0,y0,a,radius in mosaics:
        px,py=pixels(lat,lon,z)
        px,py=px-x0-.5,py-y0-.5
        ix,iy=np.floor(px).astype(int),np.floor(py).astype(int)
        mask=(ix>=0)&(iy>=0)&(ix<a.shape[1]-1)&(iy<a.shape[0]-1)&(dist<radius*1000)
        xx,yy=ix[mask],iy[mask]
        fx,fy=px[mask]-xx,py[mask]-yy
        result[mask]=(a[yy,xx]*(1-fx)*(1-fy)+a[yy,xx+1]*fx*(1-fy)+a[yy+1,xx]*(1-fx)*fy+a[yy+1,xx+1]*fx*fy)
    return result

def destination(bearing,dist):
    b=np.radians(bearing); d=dist/EARTH; la=math.radians(LAT); lo=math.radians(LON)
    lat=np.arcsin(np.sin(la)*np.cos(d)+np.cos(la)*np.sin(d)*np.cos(b))
    lon=lo+np.arctan2(np.sin(b)*np.sin(d)*np.cos(la),np.cos(d)-np.sin(la)*np.sin(lat))
    return np.degrees(lat),np.degrees(lon)

dist=np.concatenate([np.arange(30,15000,30),np.arange(15000,100000,250),np.arange(100000,500001,500),np.arange(501000,1000001,1000)]).astype(np.float32)
bearing=np.arange(1440,dtype=np.float32)[:,None]/4
lat,lon=destination(bearing,dist[None,:])
elevation=sample(lat,lon,np.broadcast_to(dist,lat.shape))
assert np.isfinite(elevation).all(), 'Missing elevation: refusing to publish incomplete terrain'
elevation=np.maximum(elevation,0).round().astype('<i2')
elevation.tofile(OUT/'terrain.bin')
summit=float(sample(np.array([LAT]),np.array([LON]),np.array([0]))[0])
print(f'Summit model elevation: {summit:.1f} m; {elevation.shape} samples',flush=True)

# Broad geographic context fills the landscape viewport around the 1,000 km scan.
# Coarser zoom-6 data is context only; all scan samples still use zoom 8 or finer.
extent=[-3000000,-1400000,2000000,1400000]
nx,ny=3200,1792
axis_x=extent[0]+(np.arange(nx)+.5)*(extent[2]-extent[0])/nx
axis_y=extent[3]-(np.arange(ny)+.5)*(extent[3]-extent[1])/ny
x,y=np.meshgrid(axis_x,axis_y)
distance=np.hypot(x,y); angle=np.degrees(np.arctan2(x,y))
lat,lon=destination(angle,distance)
h=sample(lat,lon,distance)
assert np.isfinite(h).all()
dy,dx=np.gradient(h,1562.5)
shade=np.clip((.7-dx*.65-dy*.45)/np.sqrt(1+dx*dx+dy*dy),0,1)
land=h>0
stops=np.array([0,500,1200,2200,3500,6000])
colors=np.array([[38,53,49],[48,65,57],[66,77,62],[88,88,69],[123,115,91],[202,198,179]])
rgb=np.stack([np.interp(np.maximum(h,0),stops,colors[:,i]) for i in range(3)],axis=-1)
rgb*= (.55+shade*.7)[:,:,None]
rgb[~land]=[15,29,33]
Image.fromarray(np.clip(rgb,0,255).astype('uint8')).save(OUT/'relief.webp',quality=92)

countries=json.loads((ROOT/'2026/day04-clusters/data/countries.geojson').read_text(encoding='utf-8'))
features=[]
for f in countries['features']:
    name=f['properties'].get('name',f['properties'].get('NAME',''))
    if name in ['Kenya','Tanzania','Uganda','Rwanda','Burundi','Somalia','Ethiopia','Malawi','Zambia','Mozambique']:
        features.append({'type':'Feature','properties':{'name':name},'geometry':f['geometry']})
(OUT/'countries.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},separators=(',',':')))
meta={'observer':{'lat':LAT,'lon':LON,'modelElevation':round(summit,2),'eyeHeight':2},'earthRadius':EARTH,'refraction':.13,'bearings':1440,'distances':dist.astype(int).tolist(),'dtype':'little-endian signed int16, metres; bearing-major','source':'Mapzen / Tilezen Terrain Tiles via AWS; SRTM, GMTED2010 and ETOPO1','preparedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'tiles':manifest,'resolution':'zoom 12 within 15 km (~38 m), zoom 10 within 110 km (~153 m), zoom 8 beyond (~611 m)','method':'Bilinear source sampling. 0.25-degree radial rays; 30 m distance steps to 15 km, 250 m to 100 km, 500 m to 500 km. Ocean elevations clamped to sea level. Approximate terrain visibility, not a survey.'}
meta['reliefExtentMetres']=extent
meta['reliefContext']='Zoom-6 terrain (~2.4 km source pixels) fills the surrounding landscape beyond the detailed source coverage. Background only; visibility samples use zoom 8 or finer.'
meta['maxRadiusKm']=1000
meta['method']=meta['method'].replace('500 m to 500 km.','500 m to 500 km, 1 km to 1,000 km.')
(OUT/'metadata.json').write_text(json.dumps(meta,separators=(',',':')))
print('Terrain preparation complete',flush=True)
