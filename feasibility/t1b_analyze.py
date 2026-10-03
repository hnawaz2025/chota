"""Test 1b analysis: zone-level anomalies, empirical noise threshold, null control, candidate areas."""
import json, math
import numpy as np
from scipy import ndimage
from t1b_anomaly import CACHE, BBOX, RES, HOME, H, W

C = 40  # 40 px * 100 m = 4 km zones
NZ_R, NZ_C = H // C, W // C
GEO = [g for g in json.load(open("geonames_50km.json")) if g["cls"] == "P"]
DIRS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]
DIRS_UR = ["شمال", "شمال مشرق", "مشرق", "جنوب مشرق", "جنوب", "جنوب مغرب", "مغرب", "شمال مغرب"]

def zones(arr, valid, minfrac=0.5):
    out = np.full((NZ_R, NZ_C), np.nan)
    for i in range(NZ_R):
        for j in range(NZ_C):
            s = (slice(i*C, (i+1)*C), slice(j*C, (j+1)*C))
            m = valid[s] & ~np.isnan(arr[s])
            if m.mean() >= minfrac: out[i, j] = np.median(arr[s][m])
    return out

def morans_i(z):
    m = ~np.isnan(z); x = np.where(m, z - np.nanmean(z), 0)
    num = den_w = 0.0
    for dy, dx in ((0, 1), (1, 0)):
        a, b = x[:x.shape[0]-dy, :x.shape[1]-dx], x[dy:, dx:]
        mm = m[:m.shape[0]-dy, :m.shape[1]-dx] & m[dy:, dx:]
        num += 2 * (a*b)[mm].sum(); den_w += 2 * mm.sum()
    return (m.sum() / den_w) * num / (x[m]**2).sum()

def bearing(lat, lon):
    dx = (lon-HOME[0])*111.32*math.cos(math.radians(HOME[1])); dy = (lat-HOME[1])*110.57
    k = int(((math.degrees(math.atan2(dx, dy)) + 360) % 360 + 22.5) // 45) % 8
    return DIRS[k], DIRS_UR[k], math.hypot(dx, dy)

def nearest_place(lat, lon):
    g = min(GEO, key=lambda g: (g["lat"]-lat)**2 + ((g["lon"]-lon)*math.cos(math.radians(lat)))**2)
    return g["name"], round(math.hypot((g["lon"]-lon)*111.32*math.cos(math.radians(lat)), (g["lat"]-lat)*110.57), 1)

def ascii_map(z, thr):
    for row in z:
        print("   " + "".join(" " if np.isnan(v) else "#" if v >= thr else "+" if v >= thr/2 else
                             "-" if v <= -thr else "." for v in row))

summary = {}
for win in ("mar", "dry"):
    r = np.load(f"{CACHE}/result_{win}.npz"); valid = r["valid"]
    anom = r["tgt"] - r["clim"]
    za = zones(anom, valid)
    region_shift = np.nanmedian(za)               # whole-region greener/drier than normal
    zrel = za - region_shift                      # "stands out vs the rest of the region"
    # empirical noise: same statistic for each baseline year vs the other six
    loo_rel = []
    for L in r["loo"]:
        zl = zones(L, valid); loo_rel.append(zl - np.nanmedian(zl))
    loo_rel = np.stack(loo_rel); pool = loo_rel[~np.isnan(loo_rel)]
    T = float(np.percentile(pool, 97.5))          # one-sided 2.5% false-positive threshold
    fp_rate = float((pool >= T).mean())
    hit = zrel >= T
    n_valid = int((~np.isnan(zrel)).sum()); n_hit = int(hit.sum())
    print(f"\n=== {win.upper()} 2026 vs 2019-2025 (4 km zones in scope: {n_valid}) ===")
    print(f"  region-wide NDVI shift vs normal: {region_shift:+.4f}")
    print(f"  noise threshold T (97.5th pct of baseline-year zone anomalies): {T:.4f}")
    print(f"  zones standing out: {n_hit} = {100*n_hit/n_valid:.1f}%  (noise expectation {100*fp_rate:.1f}%)")
    print(f"  max zone relative anomaly {np.nanmax(zrel):+.4f}; per-baseline-year max: "
          + " ".join(f"{np.nanmax(x):+.3f}" for x in loo_rel))
    print(f"  spatial coherence Moran's I: 2026={morans_i(zrel):.2f}; baseline years="
          + " ".join(f"{morans_i(x):.2f}" for x in loo_rel))
    print("  map (N up; '#' >= T, '+' >= T/2, '-' <= -T, blank = masked: border/crops/>50 km):")
    ascii_map(zrel, T)
    # candidate areas = connected clusters of standing-out zones
    lab, n = ndimage.label(hit)
    cands = []
    for k in range(1, n+1):
        ii, jj = np.where(lab == k)
        lat = BBOX[3] - (ii.mean()+0.5)*C*RES; lon = BBOX[0] + (jj.mean()+0.5)*C*RES
        d_en, d_ur, km = bearing(lat, lon); place, pkm = nearest_place(lat, lon)
        cands.append(dict(direction=d_en, direction_ur=d_ur, distance_km=round(km, 1), near_landmark=place,
                          landmark_offset_km=pkm, n_zones=len(ii), area_km2=len(ii)*16,
                          ndvi_vs_normal=round(float(za[ii, jj].mean()), 3),
                          stands_out_by=round(float(zrel[ii, jj].mean()), 3),
                          ndvi_now=round(float(np.nanmedian(zones(r["tgt"], valid)[ii, jj])), 3),
                          lat=round(lat, 4), lon=round(lon, 4)))
    cands.sort(key=lambda c: -c["stands_out_by"] * c["n_zones"])
    print(f"  candidate areas (clusters): {len(cands)}")
    for c in cands[:8]: print("   ", c)
    summary[win] = dict(region_shift=float(region_shift), T=T, n_valid=n_valid, n_hit=n_hit,
                        fp_rate=fp_rate, moran=float(morans_i(zrel)), candidates=cands)
json.dump(summary, open("t1b_summary.json", "w"), ensure_ascii=False, indent=1)

ch = json.load(open(f"{CACHE}/chirps.json"))
print("\n=== CHIRPS rainfall, 50 km box mean (mm) ===")
for y in range(2019, 2027):
    months = [f"{y-1}.11", f"{y-1}.12", f"{y}.01", f"{y}.02", f"{y}.03"]
    v = [ch.get(m, [None])[0] for m in months]
    tot = sum(x for x in v if x is not None)
    print(f"  Nov{y-1}-Mar{y}: total {tot:6.1f}  monthly " + " ".join("  -  " if x is None else f"{x:5.1f}" for x in v))
print("  2026 Apr-Sep: " + " ".join(f"{m[-2:]}:{ch[m][0]:.1f}" if ch.get(m, [None])[0] is not None else f"{m[-2:]}:n/a"
                                    for m in [f"2026.{k:02d}" for k in range(4, 10)]))
print("  within-box spread Mar 2026 (min/max px):", ch.get("2026.03"), " Feb:", ch.get("2026.02"))

# --- Per-year detectability: score each March (2019-2026) vs the other years, with the
#     noise threshold taken from the DRY season (no rain-driven greening => pure noise floor).
print("\n=== Detectability per year (threshold from dry-season noise) ===")
rd, rm = np.load(f"{CACHE}/result_dry.npz"), np.load(f"{CACHE}/result_mar.npz")
valid = rm["valid"]
dry_pool = []
for L in rd["loo"]:
    zl = zones(L, valid); dry_pool.append((zl - np.nanmedian(zl))[~np.isnan(zl)])
T_dry = float(np.percentile(np.concatenate(dry_pool), 97.5))
print(f"  dry-season noise threshold T_dry = {T_dry:.4f}")
years = list(range(2019, 2027))
mar = {y: np.load(f"{CACHE}/comp_mar_{y}.npy") for y in years}
per_year = {}
for y in years:
    others = np.nanmedian(np.stack([mar[o] for o in years if o != y]), 0)
    za = zones(mar[y] - others, valid); zr = za - np.nanmedian(za)
    n = int((zr >= T_dry).sum()); nv = int((~np.isnan(zr)).sum())
    lab, ncl = ndimage.label(zr >= T_dry)
    big = max([(lab == k).sum() for k in range(1, ncl+1)], default=0)
    wet = sum(ch.get(m, [0])[0] or 0 for m in [f"{y-1}.11", f"{y-1}.12", f"{y}.01", f"{y}.02", f"{y}.03"])
    per_year[y] = dict(region_shift=round(float(np.nanmedian(za)), 4), zones_out=n, pct=round(100*n/nv, 1),
                       clusters=ncl, largest_cluster_km2=int(big*16), rain_nov_mar=round(wet, 1),
                       max_rel=round(float(np.nanmax(zr)), 3))
    print(f"  Mar {y}: rain Nov-Mar {wet:6.1f} mm | region shift {per_year[y]['region_shift']:+.4f} | "
          f"zones>T {n:3d} ({per_year[y]['pct']:4.1f}%) | clusters {ncl:2d}, largest {int(big*16):4d} km2 | max {per_year[y]['max_rel']:+.3f}")
json.dump(per_year, open("t1b_per_year.json", "w"), indent=1)
