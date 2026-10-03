"""Score a predictions file (jsonl: {"id", "events": [...]}) against gold.jsonl."""
import json, sys
from collections import defaultdict

FIELDS = ["species", "qty", "amount_pkr", "credit", "day_offset", "item_cat"]
DEFAULTS = {"credit": False, "day_offset": 0}

def norm(e, f):
    v = e.get(f, DEFAULTS.get(f))
    if f in ("qty", "amount_pkr", "day_offset") and v is not None:
        try: v = int(round(float(v)))
        except (TypeError, ValueError): v = None
    return v

def match(gold, pred):
    """Greedy pair events by type, preferring same species."""
    pred = list(pred); pairs = []
    for g in gold:
        cands = [p for p in pred if p.get("type") == g["type"]]
        if not cands: pairs.append((g, None)); continue
        best = max(cands, key=lambda p: (norm(p, "species") == g.get("species"), norm(p, "qty") == g.get("qty")))
        pred.remove(best); pairs.append((g, best))
    return pairs, pred  # unmatched preds = false positives

def score(pred_path, gold_path="gold.jsonl", verbose=True):
    gold = {j["id"]: j for j in map(json.loads, open(gold_path))}
    pred = {j["id"]: j for j in map(json.loads, open(pred_path))}
    tp = fn = fp = 0; fc = defaultdict(lambda: [0, 0]); exact = 0; fails = []; fu = [0, 0]; lat = []
    for uid, g in gold.items():
        p = pred.get(uid, {"events": []}); pe = p.get("events") or []
        if "latency_s" in p: lat.append(p["latency_s"])
        pairs, extra = match(g["events"], pe)
        ok = not extra; fp += len(extra); errs = [f"extra {e.get('type')}" for e in extra]
        for ge, pe_ in pairs:
            if pe_ is None: fn += 1; ok = False; errs.append(f"missed {ge['type']}"); continue
            tp += 1
            for f in FIELDS:
                if f not in ge and f not in DEFAULTS: continue
                if f in DEFAULTS and f not in ge and ge["type"] not in ("sale", "purchase", "expense"):
                    if f == "credit": continue
                good = norm(pe_, f) == ge.get(f, DEFAULTS.get(f))
                fc[f][0] += good; fc[f][1] += 1
                if not good: ok = False; errs.append(f"{ge['type']}.{f}: got {norm(pe_, f)!r} want {ge.get(f, DEFAULTS.get(f))!r}")
            if "missing" in ge:
                fu[1] += 1; fu[0] += norm(pe_, "amount_pkr") is None
        exact += ok
        if not ok: fails.append((uid, g["text"], errs))
    n = len(gold); P = tp/max(tp+fp, 1); R = tp/max(tp+fn, 1)
    res = dict(utterances_fully_correct=f"{exact}/{n} ({100*exact/n:.0f}%)",
               event_precision=round(P, 3), event_recall=round(R, 3), event_f1=round(2*P*R/max(P+R, 1e-9), 3),
               field_accuracy={f: f"{c[0]}/{c[1]}" for f, c in fc.items()},
               followup_detected=f"{fu[0]}/{fu[1]}")
    if lat: res["latency_s_median"] = round(sorted(lat)[len(lat)//2], 2); res["latency_s_max"] = round(max(lat), 2)
    if verbose:
        print(json.dumps(res, indent=1, ensure_ascii=False))
        for uid, t, e in fails: print(f"  ✗ {uid} {t}\n      " + "; ".join(e))
    return res

if __name__ == "__main__":
    score(sys.argv[1])
