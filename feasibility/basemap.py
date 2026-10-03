"""Offline basemap pack: S2 true-colour JPEG + GeoNames villages + Pakistan border, Nushki +-50 km."""
import json, os, ssl, urllib.request, certifi, numpy as np, rasterio, pystac_client, planetary_computer
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from PIL import Image
os.environ.update(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR")
OUT = "../app/public/data"
HOME = (66.0228, 29.5546); DLON, DLAT = 0.53, 0.47
B = (HOME[0]-DLON, HOME[1]-DLAT, HOME[0]+DLON, HOME[1]+DLAT)
RES = 0.0004; W, H = int(2*DLON/RES), int(2*DLAT/RES); TF = from_bounds(*B, W, H)
cat = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1", modifier=planetary_computer.sign_inplace)
items = list(cat.search(collections=["sentinel-2-l2a"], bbox=B, datetime="2026-09-30").items())
rgb = np.zeros((3, H, W), "float32")
for it in items:
    off = 1000 if float(it.properties.get("s2:processing_baseline", "0")) >= 4 else 0
    for k, b in enumerate(["B04", "B03", "B02"]):
        with rasterio.open(it.assets[b].href, overview_level=1) as s, WarpedVRT(s, crs="EPSG:4326", transform=TF,
                width=W, height=H, resampling=Resampling.average, src_nodata=0, nodata=0) as v:
            a = v.read(1).astype("float32"); m = (a > 0) & (rgb[k] == 0); rgb[k][m] = (a[m]-off)/1e4
lo, hi = np.percentile(rgb[rgb > 0], 1), np.percentile(rgb[rgb > 0], 99.5)
img = (np.clip((rgb-lo)/(hi-lo), 0, 1) ** 0.85 * 255).astype("uint8").transpose(1, 2, 0)
Image.fromarray(img).save(f"{OUT}/basemap.jpg", quality=72, optimize=True, progressive=True)
geo = [g for g in json.load(open("geonames_50km.json")) if g["cls"] == "P"]
json.dump([{"n": g["name"], "a": g["lat"], "o": g["lon"]} for g in geo], open(f"{OUT}/villages.json", "w"), ensure_ascii=False)
ctx = ssl.create_default_context(cafile=certifi.where())
url = json.load(urllib.request.urlopen("https://www.geoboundaries.org/api/current/gbOpen/PAK/ADM0/", context=ctx))["simplifiedGeometryGeoJSON"]
gj = json.load(urllib.request.urlopen(url, context=ctx)); json.dump(gj, open(f"{OUT}/pakistan.geojson", "w"))
json.dump({"bounds": [[B[1], B[0]], [B[3], B[2]]], "date": "2026-09-30", "source": "Copernicus Sentinel-2 L2A"},
          open(f"{OUT}/basemap.json", "w"))
print("basemap", W, H, os.path.getsize(f"{OUT}/basemap.jpg")//1024, "KB;", len(geo), "villages;",
      os.path.getsize(f"{OUT}/pakistan.geojson")//1024, "KB border")
