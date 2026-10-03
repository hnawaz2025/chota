import numpy as np, sys
from s2lib import *
lc = landcover()
tot = (lc > 0).sum()
print("Land cover (IO LULC 2023) over 40x40 km box:")
for k, n in LC_NAMES.items():
    print(f"  {n:12s} {100*(lc==k).sum()/tot:5.1f}%")
dates = {"latest":"2026-10-02","-5d":"2026-09-27","-10d":"2026-09-22","-30d":"2026-09-02",
         "spring26":"2026-03-15/2026-03-31","yr-ago":"2025-10-01/2025-10-05"}
idx = {}
for k, d in dates.items():
    # for ranges, take first clear-ish acquisition date
    if "/" in d:
        its = sorted(CAT.search(collections=["sentinel-2-l2a"], bbox=BBOX, datetime=d,
                     query={"eo:cloud_cover":{"lt":5}}).items(), key=lambda i: i.datetime)
        d = str(its[0].datetime.date())
    r, n, ok, ntiles = scene(d)
    ndvi, msavi = indices(r, n, ok)
    idx[k] = (d, ndvi, msavi)
    print(f"\n{k} ({d}, {ntiles} tiles, valid {100*ok.mean():.0f}%)")
    for cls in (11, 8, 5, 2):
        m = (lc == cls)
        v = ndvi[m]; v = v[~np.isnan(v)]
        if v.size: print(f"  NDVI {LC_NAMES[cls]:10s} p10={np.percentile(v,10):.3f} med={np.median(v):.3f} p90={np.percentile(v,90):.3f}")
np.savez_compressed("t1_arrays.npz", lc=lc, **{f"{k}_ndvi": v[1] for k, v in idx.items()},
                    **{f"{k}_msavi": v[2] for k, v in idx.items()})
import json; json.dump({k: v[0] for k, v in idx.items()}, open("t1_dates.json", "w"))
