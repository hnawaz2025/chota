"""Rain->green-up lag check: score March and April of every year vs the other years (dry-season noise floor)."""
import json, numpy as np
from scipy import ndimage
from t1b_anomaly import CACHE
import t1b_analyze as A   # reuses zones(), thresholds; prints its own report first
valid = np.load(f"{CACHE}/result_mar.npz")["valid"]
years = list(range(2019, 2027)); out = {}
print("\n=== Mar vs Apr detectability (T_dry=%.4f) ===" % A.T_dry)
for win in ("mar", "apr"):
    comp = {y: np.load(f"{CACHE}/comp_{win}_{y}.npy") for y in years}
    for y in years:
        others = np.nanmedian(np.stack([comp[o] for o in years if o != y]), 0)
        za = A.zones(comp[y] - others, valid); zr = za - np.nanmedian(za)
        hit = zr >= A.T_dry; lab, ncl = ndimage.label(hit)
        big = max([(lab == k).sum() for k in range(1, ncl+1)], default=0)
        out[f"{win}{y}"] = (round(100*hit.sum()/(~np.isnan(zr)).sum(), 1), int(big*16), round(float(np.nanmax(zr)), 3), round(float(np.nanmedian(za)), 4))
for y in years:
    m, a = out[f"mar{y}"], out[f"apr{y}"]
    print(f"  {y}: MAR {m[0]:5.1f}% largest {m[1]:4d} km2 max {m[2]:+.3f} shift {m[3]:+.4f} | APR {a[0]:5.1f}% largest {a[1]:4d} km2 max {a[2]:+.3f} shift {a[3]:+.4f}")
json.dump(out, open("t1b_lag.json", "w"), indent=1)
