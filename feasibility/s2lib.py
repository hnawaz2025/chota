"""Minimal Sentinel-2 / land-cover reader onto a common lat/lon grid (Planetary Computer)."""
import numpy as np, rasterio, pystac_client, planetary_computer
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import from_bounds

NUSHKI = (66.0228, 29.5546)
D = 0.2
BBOX = (NUSHKI[0]-D, NUSHKI[1]-D, NUSHKI[0]+D, NUSHKI[1]+D)
RES = 0.0005  # ~50 m
W = H = int(round(2*D/RES))
TF = from_bounds(*BBOX, W, H)
CAT = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1",
                                modifier=planetary_computer.sign_inplace)

def _read(href, resampling=Resampling.average):
    with rasterio.open(href) as src, WarpedVRT(src, crs="EPSG:4326", transform=TF, width=W, height=H,
                                               resampling=resampling, src_nodata=0, nodata=0) as v:
        return v.read(1).astype("float32")

def scene(date):
    """Mosaic all tiles for one acquisition date. Returns red, nir, valid-mask."""
    items = list(CAT.search(collections=["sentinel-2-l2a"], bbox=BBOX, datetime=date).items())
    red = np.zeros((H, W), "float32"); nir = red.copy(); ok = np.zeros((H, W), bool)
    for it in items:
        off = 1000 if float(it.properties.get("s2:processing_baseline", "0")) >= 4 else 0
        r, n = _read(it.assets["B04"].href), _read(it.assets["B08"].href)
        scl = _read(it.assets["SCL"].href, Resampling.nearest)
        good = (r > 0) & np.isin(scl, [4, 5, 7]) & ~ok   # veg / bare / unclassified; no cloud, shadow
        red[good] = (r[good]-off)/1e4; nir[good] = (n[good]-off)/1e4; ok |= good
    return red, nir, ok, len(items)

def indices(red, nir, ok):
    ndvi = np.where(ok, (nir-red)/np.maximum(nir+red, 1e-6), np.nan)
    a = 2*nir+1
    msavi = np.where(ok, (a-np.sqrt(np.maximum(a*a-8*(nir-red), 0)))/2, np.nan)
    return ndvi, msavi

def landcover(year=2023):
    it = list(CAT.search(collections=["io-lulc-annual-v02"], bbox=BBOX,
                         datetime=f"{year}-01-01/{year}-12-31").items())
    lc = np.zeros((H, W), "float32")
    for i in it:
        x = _read(i.assets["data"].href, Resampling.mode); lc[lc == 0] = x[lc == 0]
    return lc.astype("uint8")
LC_NAMES = {1:"water",2:"trees",4:"flooded veg",5:"crops",7:"built",8:"bare",11:"rangeland"}
