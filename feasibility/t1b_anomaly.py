"""Test 1b: is there a seasonal vegetation-anomaly signal within 50 km of Nushki that is
spatially differentiated and clearly above noise?

Signal  : per-pixel median NDVI over a seasonal window (target year) minus the median of the
          same window in 2019-2025, divided by inter-annual std  ->  anomaly + z-score.
Replay  : March 2026 (post winter rain).
Null    : Sep 10 - Oct 2 2026 (dry season). If the null shows as many "standing out" zones as
          March, the method is producing noise.
Masks   : outside Pakistan, outside 50 km, crops / built / trees / water (IO LULC 2023).
"""
import json, os, ssl, sys, time, urllib.request
import certifi
from concurrent.futures import ThreadPoolExecutor
import numpy as np, rasterio, pystac_client, planetary_computer
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.features import rasterize

os.environ.update(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="4",
                  GDAL_HTTP_RETRY_DELAY="2", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.cog")
HOME = (66.0228, 29.5546)
RADIUS_KM = 50
DLAT, DLON = 0.47, 0.53
BBOX = (HOME[0]-DLON, HOME[1]-DLAT, HOME[0]+DLON, HOME[1]+DLAT)
RES = 0.001  # ~100 m
W, H = int(round(2*DLON/RES)), int(round(2*DLAT/RES))
TF = from_bounds(*BBOX, W, H)
SSL = ssl.create_default_context(cafile=certifi.where())
CACHE = "cache_1b"; os.makedirs(CACHE, exist_ok=True)
CAT = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1",
                                modifier=planetary_computer.sign_inplace)
BASE_YEARS = range(2019, 2026)
WINDOWS = {"mar": ("03-01", "03-31"), "apr": ("04-01", "04-30"), "dry": ("09-10", "10-02")}
MAX_DATES = 6

def log(*a): print(time.strftime("%H:%M:%S"), *a, flush=True)

def _read(href, ovr, resampling):
    for attempt in range(3):
        try:
            with rasterio.open(href, overview_level=ovr) as src, WarpedVRT(
                    src, crs="EPSG:4326", transform=TF, width=W, height=H,
                    resampling=resampling, src_nodata=0, nodata=0) as v:
                return v.read(1).astype("float32")
        except Exception as e:
            err = e; time.sleep(3)
    raise err

def date_ndvi(date):
    """NDVI mosaic for one acquisition date (cloud/shadow masked -> NaN). Cached."""
    f = f"{CACHE}/ndvi_{date}.npy"
    if os.path.exists(f): return np.load(f)
    items = list(CAT.search(collections=["sentinel-2-l2a"], bbox=BBOX, datetime=date).items())
    out = np.full((H, W), np.nan, "float32")
    for it in items:
        off = 1000 if float(it.properties.get("s2:processing_baseline", "0")) >= 4 else 0
        r = _read(it.assets["B04"].href, 2, Resampling.average)
        n = _read(it.assets["B08"].href, 2, Resampling.average)
        scl = _read(it.assets["SCL"].href, 1, Resampling.mode)
        good = (r > 0) & np.isin(scl, [4, 5, 7]) & np.isnan(out)
        r, n = (r-off)/1e4, (n-off)/1e4
        out[good] = ((n-r)/np.maximum(n+r, 1e-6))[good]
    np.save(f, out); return out

def window_dates(year, win):
    a, b = WINDOWS[win]
    its = CAT.search(collections=["sentinel-2-l2a"], bbox=BBOX, datetime=f"{year}-{a}/{year}-{b}",
                     query={"eo:cloud_cover": {"lt": 20}}).items()
    cloud = {}
    for i in its:
        d = str(i.datetime.date()); cloud.setdefault(d, []).append(i.properties["eo:cloud_cover"])
    ranked = sorted(cloud, key=lambda d: (-len(cloud[d]), np.mean(cloud[d])))  # full coverage, clearest
    return sorted(ranked[:MAX_DATES])

def composite(year, win):
    f = f"{CACHE}/comp_{win}_{year}.npy"
    if os.path.exists(f): return np.load(f)
    dates = window_dates(year, win)
    with ThreadPoolExecutor(6) as ex: stack = list(ex.map(date_ndvi, dates))
    c = np.nanmedian(np.stack(stack), axis=0).astype("float32")
    np.save(f, c); log(f"composite {win} {year}: {len(dates)} dates {dates[0]}..{dates[-1]}"); return c

def masks():
    f = f"{CACHE}/masks.npz"
    if os.path.exists(f): z = np.load(f); return z["lc"], z["pak"], z["dist"]
    lc = np.zeros((H, W), "uint8")
    for i in CAT.search(collections=["io-lulc-annual-v02"], bbox=BBOX, datetime="2023").items():
        x = _read(i.assets["data"].href, 0, Resampling.mode).astype("uint8"); lc[lc == 0] = x[lc == 0]
    url = json.load(urllib.request.urlopen("https://www.geoboundaries.org/api/current/gbOpen/PAK/ADM0/", context=SSL))["simplifiedGeometryGeoJSON"]
    gj = json.load(urllib.request.urlopen(url, context=SSL))
    pak = rasterize([f["geometry"] for f in gj["features"]], out_shape=(H, W), transform=TF).astype(bool)
    lon = BBOX[0] + (np.arange(W)+0.5)*RES; lat = BBOX[3] - (np.arange(H)+0.5)*RES
    LON, LAT = np.meshgrid(lon, lat)
    dist = np.hypot((LON-HOME[0])*111.32*np.cos(np.radians(HOME[1])), (LAT-HOME[1])*110.57)
    np.savez_compressed(f, lc=lc, pak=pak, dist=dist); return lc, pak, dist

def chirps():
    """Monthly rainfall (mm), mean over the 50 km box, Nov-Mar seasons + recent months."""
    vals = {}
    def one(ym):
        u = f"/vsicurl/https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/cogs/chirps-v2.0.{ym}.cog"
        try:
            with rasterio.open(u) as s:
                win = rasterio.windows.from_bounds(*BBOX, s.transform)
                a = s.read(1, window=win, boundless=True, fill_value=-9999).astype(float)
                a[a < 0] = np.nan; return ym, float(np.nanmean(a)), float(np.nanmin(a)), float(np.nanmax(a))
        except Exception: return ym, None, None, None
    yms = [f"{y}.{m:02d}" for y in range(2018, 2027) for m in range(1, 13) if f"{y}.{m:02d}" <= "2026.09"]
    with ThreadPoolExecutor(8) as ex:
        for ym, mean, lo, hi in ex.map(one, yms): vals[ym] = (mean, lo, hi)
    return vals

if __name__ == "__main__":
    lc, pak, dist = masks()
    valid = pak & (dist <= RADIUS_KM) & np.isin(lc, [8, 11])  # bare + rangeland only
    log(f"grid {W}x{H}; in-scope pixels {valid.mean()*100:.0f}% of box; "
        f"outside Pakistan within 50 km: {((~pak)&(dist<=RADIUS_KM)).sum()/(dist<=RADIUS_KM).sum()*100:.0f}%")
    res = {}
    for win in WINDOWS:
        base = np.stack([composite(y, win) for y in BASE_YEARS])
        tgt = composite(2026, win)
        clim, sd = np.nanmedian(base, 0), np.nanstd(base, 0)
        # leave-one-out anomalies of each baseline year = empirical noise distribution
        loo = [base[i] - np.nanmedian(np.delete(base, i, 0), 0) for i in range(len(base))]
        np.savez_compressed(f"{CACHE}/result_{win}.npz", tgt=tgt, clim=clim, sd=sd, valid=valid,
                            loo=np.stack(loo).astype("float32"))
        log(f"{win}: done")
    json.dump(chirps(), open(f"{CACHE}/chirps.json", "w"), indent=0)
    log("chirps done")
