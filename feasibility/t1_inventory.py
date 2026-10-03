"""Test 1a: Sentinel-2 L2A availability / freshness over Nushki."""
import pystac_client, planetary_computer
from collections import Counter
NUSHKI = (66.0228, 29.5546)  # lon, lat (Nushki town)
D = 0.2
BBOX = [NUSHKI[0]-D, NUSHKI[1]-D, NUSHKI[0]+D, NUSHKI[1]+D]
cat = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1",
                                modifier=planetary_computer.sign_inplace)
items = list(cat.search(collections=["sentinel-2-l2a"], bbox=BBOX,
                        datetime="2026-06-01/2026-10-03").items())
items.sort(key=lambda i: i.datetime, reverse=True)
print(f"{len(items)} scenes since Jun 1")
for i in items[:25]:
    p = i.properties
    print(i.datetime.date(), p["s2:mgrs_tile"], f"cloud={p['eo:cloud_cover']:.1f}%", p.get("platform"))
print("tiles:", Counter(i.properties["s2:mgrs_tile"] for i in items))
for c in ["io-lulc-annual-v02", "esa-worldcover"]:
    its = list(cat.search(collections=[c], bbox=BBOX).items())
    print(c, sorted({str(i.datetime or i.properties.get('start_datetime'))[:10] for i in its}))
