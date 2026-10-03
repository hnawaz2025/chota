import numpy as np, json
z = np.load("t1_arrays.npz"); lc = z["lc"]; dates = json.load(open("t1_dates.json"))
C = 40  # 40 px * 50 m = 2 km zones
n = lc.shape[0]//C
def zone_stats(arr, cls=11, minfrac=0.5):
    out = np.full((n, n), np.nan)
    for i in range(n):
        for j in range(n):
            m = lc[i*C:(i+1)*C, j*C:(j+1)*C] == cls
            a = arr[i*C:(i+1)*C, j*C:(j+1)*C][m]
            a = a[~np.isnan(a)]
            if m.mean() >= minfrac and a.size: out[i, j] = np.median(a)
    return out
def bare_ref(arr):  # scene-wide bare-soil median = noise/atmosphere reference
    return np.nanmedian(arr[lc == 8])
Z = {}
for k in dates:
    for ix in ("ndvi", "msavi"):
        a = z[f"{k}_{ix}"]
        Z[(k, ix)] = zone_stats(a) - bare_ref(a)   # rangeland excess over bare soil
for ix in ("ndvi", "msavi"):
    print(f"\n== {ix.upper()}: per-2km-zone rangeland excess over bare soil ==")
    for k in dates:
        v = Z[(k, ix)]; v = v[~np.isnan(v)]
        print(f"  {k:9s} zones={v.size} p10={np.percentile(v,10):+.4f} med={np.median(v):+.4f} p90={np.percentile(v,90):+.4f} max={v.max():+.4f}")
    a = Z[("latest", ix)]
    print("  rank-correlation of zones vs latest (stable pattern => real persistent cover):")
    for k in dates:
        b = Z[(k, ix)]; m = ~np.isnan(a) & ~np.isnan(b)
        ra = np.argsort(np.argsort(a[m])); rb = np.argsort(np.argsort(b[m]))
        print(f"    {k:9s} rho={np.corrcoef(ra, rb)[0,1]:.2f}")
    for base in ("-5d", "-10d", "-30d"):
        d = Z[("latest", ix)] - Z[(base, ix)]; d = d[~np.isnan(d)]
        print(f"  noise-corrected change latest vs {base:4s}: p5={np.percentile(d,5):+.4f} p95={np.percentile(d,95):+.4f}  zones>|0.02|: {(abs(d)>0.02).sum()}")
# Where is the spring signal? print coarse map of spring excess (NDVI), 4km blocks
s = Z[("spring26","ndvi")]
print("\nSpring-26 NDVI excess map (rows N->S, cols W->E; '.'<0.01 'o'<0.03 'O'<0.06 '#'>=0.06, ' '=not rangeland):")
for row in s:
    print("  " + "".join(" " if np.isnan(x) else "." if x<0.01 else "o" if x<0.03 else "O" if x<0.06 else "#" for x in row))
o = Z[("latest","ndvi")]
print("\nLatest (Oct 2) NDVI excess map, same legend:")
for row in o:
    print("  " + "".join(" " if np.isnan(x) else "." if x<0.01 else "o" if x<0.03 else "O" if x<0.06 else "#" for x in row))
