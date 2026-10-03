"""Candidate areas for a replay window (year vs other years, dry-season noise floor)."""
import json, sys, numpy as np
from scipy import ndimage
from t1b_anomaly import CACHE, BBOX, RES
import t1b_analyze as A
valid = np.load(f"{CACHE}/result_mar.npz")["valid"]
years = list(range(2019, 2027)); res = {}
for key in sys.argv[1:]:
    win, y = key[:3], int(key[3:])
    comp = {o: np.load(f"{CACHE}/comp_{win}_{o}.npy") for o in years}
    others = np.nanmedian(np.stack([comp[o] for o in years if o != y]), 0)
    za = A.zones(comp[y] - others, valid); zr = za - np.nanmedian(za); now = A.zones(comp[y], valid)
    lab, n = ndimage.label(zr >= A.T_dry); cands = []
    for k in range(1, n+1):
        ii, jj = np.where(lab == k)
        lat = BBOX[3]-(ii.mean()+.5)*A.C*RES; lon = BBOX[0]+(jj.mean()+.5)*A.C*RES
        d, dur, km = A.bearing(lat, lon); place, pkm = A.nearest_place(lat, lon)
        cands.append(dict(direction=d, distance_km=round(km,1), near_landmark=place, landmark_offset_km=pkm,
                          area_km2=int(len(ii)*16), greener_than_usual_by=round(float(zr[ii,jj].mean()),3),
                          ndvi_now=round(float(np.nanmean(now[ii,jj])),3),
                          snr=round(float(zr[ii,jj].mean()/A.T_dry),1), lat=round(lat,4), lon=round(lon,4)))
    cands.sort(key=lambda c: -c["area_km2"]*c["greener_than_usual_by"])
    res[key] = cands
    print(f"\n{key}: {n} clusters; top by area x strength:")
    for c in cands[:6]: print("  ", c)
    print("  map ('#' stands out, '+' half-way, blank=masked):"); A.ascii_map(zr, A.T_dry)
json.dump(res, open("t1b_candidates.json","w"), indent=1, ensure_ascii=False)
