"""Rule-based Urdu / Roman-Urdu livestock event parser (deterministic, no model).

Pipeline: normalize -> tokenize -> correction handling -> clause split on "and" ->
per-clause event type + fields -> merge verbless/medicine clauses -> missing-field flags.
"""
import json, re, sys

# ---------- normalization ----------
CHARMAP = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ه": "ہ", "ۀ": "ہ", "ة": "ہ", "ۓ": "ے",
                         "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
                         "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"})
DIACRITICS = re.compile(r"[ً-ٰٟ۪-ۭ]")

def normalize(t):
    t = DIACRITICS.sub("", t.translate(CHARMAP)).lower()
    t = re.sub(r"[،۔,.!?؟]", " ", t)
    return t.split()

# ---------- numbers ----------
UR_NUM = "ایک دو تین چار پانچ چھ سات آٹھ نو دس گیارہ بارہ تیرہ چودہ پندرہ سولہ سترہ اٹھارہ انیس بیس اکیس بائیس تئیس چوبیس پچیس چھبیس ستائیس اٹھائیس انتیس تیس اکتیس بتیس تینتیس چونتیس پینتیس چھتیس سینتیس اڑتیس انتالیس چالیس اکتالیس بیالیس تینتالیس چوالیس پینتالیس چھیالیس سینتالیس اڑتالیس انچاس پچاس اکاون باون ترپن چون پچپن چھپن ستاون اٹھاون انسٹھ ساٹھ اکسٹھ باسٹھ ترسٹھ چونسٹھ پینسٹھ چھیاسٹھ سڑسٹھ اڑسٹھ انہتر ستر اکہتر بہتر تہتر چوہتر پچھتر چھہتر ستتر اٹھہتر اناسی اسی اکیاسی بیاسی تراسی چوراسی پچاسی چھیاسی ستاسی اٹھاسی نواسی نوے اکانوے بانوے ترانوے چورانوے پچانوے چھیانوے ستانوے اٹھانوے ننانوے".split()
RO_NUM = "ek do teen char panch chay saat aath nau das gyarah barah terah chaudah pandrah solah satrah atharah unees bees ikkees baees teees chaubees pachees chhabbees sattaees athaees untees tees iktees battees taintees chauntees paintees chhattees saintees artees untalees chalees iktalees bayalees taintalees chawalees paintalees chhiyalees saintalees artalees unchaas pachaas".split()
NUM = {**{w: i+1 for i, w in enumerate(UR_NUM)}, **{w: i+1 for i, w in enumerate(RO_NUM)}}
NUM.update({"چھے": 6, "aik": 1, "chaar": 4, "paanch": 5, "chhe": 6, "che": 6, "sat": 7, "ath": 8, "gyara": 11, "bara": 12,
        "pandra": 15, "bis": 20, "tis": 30, "pachas": 50, "سو": 100, "sau": 100})
FRAC = {"ڈیڑھ": 1.5, "ڈھائی": 2.5, "dedh": 1.5, "dhai": 2.5}           # standalone fractions
PREFIX = {"سوا": 0.25, "ساڑھے": 0.5, "پونے": -0.25, "sava": 0.25, "sawa": 0.25, "sadhe": 0.5, "saade": 0.5, "pone": -0.25}
MULT = {"ہزار": 1000, "hazar": 1000, "hazaar": 1000, "لاکھ": 100000, "lakh": 100000, "lac": 100000, "سو": 100, "sau": 100}

def numval(tok):
    if re.fullmatch(r"\d+(\.\d+)?", tok): return float(tok)
    return NUM.get(tok, FRAC.get(tok))

def parse_numbers(toks):
    """Return list of (start, end, value, is_money_by_unit, reduplicated)."""
    out = []; i = 0
    while i < len(toks):
        pre = PREFIX.get(toks[i]); j = i + (1 if pre is not None else 0)
        v = numval(toks[j]) if j < len(toks) else None
        if v is None and pre is not None and j < len(toks) and toks[j] in MULT:   # "sava lakh"
            v = 1.0; pre = pre
        if v is None: i += 1; continue
        if pre is not None and toks[j] not in MULT: v = v + (pre if v >= 1 else 0) if pre > 0 else v + pre
        k = j + (0 if toks[j] in MULT else 1)
        redup = k < len(toks) and toks[k] == toks[j] and toks[j] not in MULT       # "بیس بیس ہزار"
        if redup: k += 1
        total, unit = 0.0, False
        while k < len(toks) and toks[k] in MULT:                                  # "دو لاکھ دس ہزار", "تین ہزار پانچ سو"
            v *= MULT[toks[k]]; unit = True; k += 1
            nv = numval(toks[k]) if k < len(toks) else None
            if nv is not None and k+1 < len(toks) and toks[k+1] in MULT and MULT[toks[k+1]] < MULT[toks[k-1]]:
                total += v; v = nv; k += 1; continue
        total += v
        out.append((i, k, total, unit, redup)); i = max(k, i+1)
    return out

# ---------- lexicon ----------
SPECIES = {"goat": "بکری بکریاں بکریوں بکرا بکرے بکروں bakri bakriyan bakriyon bakra bakre bakrey",
           "sheep": "بھیڑ بھیڑیں بھیڑوں دنبہ دنبے دنبوں مینڈھا میمنا میمنے میمنوں bher bhed bheden bheren dumba dumbe memna memne",
           "camel": "اونٹ اونٹنی اونٹوں oont oonth untni",
           "cattle": "گائے گائیں بیل بھینس gaye gai bail bhens bhains"}
SPEC = {w: s for s, ws in SPECIES.items() for w in ws.split()}
YOUNG = set("بچہ بچے بچوں میمنا میمنے bacha bache bachay memna memne".split())
ALL_ANIMALS = {"سب", "sab", "تمام", "jaanwar", "جانوروں", "جانور"}
FEED = set("بھوسہ بھوسے بھوسا کھل دانہ چوکر ونڈا چارہ چارا bhoosa bhusa khal dana daana chokar wanda chara".split())
WATER = set("پانی ٹینکر pani paani tanker".split())
MED = set("دوائی دوا انجکشن dawai dawa injection".split())
VACC = set("ٹیکہ ٹیکے ویکسین teeka tika vaccine".split())
WORM = {"کیڑوں", "کیڑے", "keeron", "keere"}
CREDIT = {"ادھار", "udhaar", "udhar", "قرض"}
MONEY_HINT = {"روپے", "روپیہ", "rupay", "rs", "کا", "کی", "کے", "میں", "ka", "ki", "ke", "mein", "لگے"}

def has(toks, words): return any(t in words for t in toks)
def has_seq(text, *subs): return any(s in text for s in subs)

PAST_MARK = ("یا", "ی", "ے", "یں", "ئی", "ئیں", "تھا", "تھی", "تھے", "گیا", "گئی", "گئیں", "گئے")
WEEKDAYS = {"پیر": 0, "منگل": 1, "بدھ": 2, "جمعرات": 3, "جمعہ": 4, "ہفتہ": 5, "اتوار": 6,
            "peer": 0, "mangal": 1, "budh": 2, "jumerat": 3, "juma": 4, "jumma": 4, "itwar": 6}
TODAY_WD = 5  # 2026-10-03 is a Saturday

def event_type(text, toks):
    future = has_seq(text, "نا ہے", "نی ہے", "نے ہیں", "یاد دلا", "یاد کرا", "na hai", "ni hai", "yaad")
    if has_seq(text, "چرانے") and has_seq(text, "جا رہا", "جا رہے", "لے کر جا") and not future: return "trip_start"
    if has_seq(text, "chara") and has_seq(text, "ja raha"): return "trip_start"
    if has_seq(text, "واپس آ گیا", "واپس آگیا", "واپس آ گئے", "wapas aa gaya"): return "trip_end"
    if future: return "task"
    if has(toks, CREDIT) and has_seq(text, "واپس", "wapas", "ادا", "لوٹا"): return "payment"
    if has_seq(text, "چوری", "بھیڑیا", "گم ہو", "کھو گ", "chori", "bheriya", "gum ho"): return "loss"
    if has_seq(text, "ذبح", "zibah", "qurbani", "قربانی"): return "slaughter"
    if has_seq(text, "مر گ", "مرگ", "مر گئ", "مرے", "mar ga", "mar gay", "mar gai"): return "death"
    if has_seq(text, "پیدا", "بچے دی", "بچہ دی", "بچے دے", "bacha di", "bache di", "paida", "سوئی"): return "birth"
    if has_seq(text, "بیچ", "فروخت", "bech", "bechi", "beche", "becha"): return "sale"
    if has_seq(text, "خرید", "khareed", "kharid"): return "purchase"
    if has(toks, MED | VACC) and has_seq(text, "لگا", "لگوا", " دی", "دیا", "di", "diya", "lagwa", "laga"): return "treatment"
    if has_seq(text, "کل ملا", "ٹوٹل", "total", "گنتی", "ginti", "kul mila") or (has_seq(text, " ہیں", "hain") and has(toks, SPEC)):
        return "count"
    if has(toks, SPEC) and has_seq(text, " لی", " لیا", " لیے", " لائے", "liya", " li", "laye"): return "purchase"
    if has(toks, FEED | WATER | MED) or has_seq(text, "منگوا", "liya", " لیا", " لی"): return "expense"
    return None

def day_offset(text, toks, etype):
    future = etype == "task"
    m = re.search(r"(\S+) دن (پہلے|بعد)|(\S+) din (pehle|baad)", text)
    if m:
        n = numval(m.group(1) or m.group(3)) or 1
        return int(n) * (-1 if (m.group(2) or m.group(4)) in ("پہلے", "pehle") else 1)
    if has_seq(text, "اگلے ہفتے", "agle hafte"): return 7
    if has_seq(text, "پچھلے ہفتے", "pichle hafte"): return -7
    if has(toks, {"پرسوں", "parson", "parso"}): return 2 if future else -2
    if has(toks, {"کل", "kal"}) and not has_seq(text, "کل ملا", "kul mila"): return 1 if future else -1
    for w, d in WEEKDAYS.items():
        if w in toks and not (w == "ہفتہ" and has_seq(text, "اگلے ہفتے")):
            back = (TODAY_WD - d) % 7 or 7
            return (7 - back) if future else -back
    return 0

def item_cat(toks, text, etype):
    if has(toks, WORM): return "deworming"
    if has(toks, VACC) or has_seq(text, "پی پی آر", "ppr"): return "vaccination"
    if etype == "task" and has_seq(text, "چرانے", "chara"): return "trip"
    if has(toks, MED): return "medicine"
    if has(toks, WATER): return "water"
    if has(toks, FEED): return "feed"
    return None

def parse_clause(toks, ctx_text):
    text = " " + " ".join(toks) + " "
    et = event_type(text, toks) or event_type(ctx_text, normalize(ctx_text))
    if et is None: return []
    nums = parse_numbers(toks)
    spec_pos = [(i, SPEC[t]) for i, t in enumerate(toks) if t in SPEC]
    young_pos = [i for i, t in enumerate(toks) if t in YOUNG]
    events = []
    # quantity numbers: directly precede an animal noun; everything else with a unit/hint is money
    qty_for = {}; money = None; moneys = []
    for (s, e, v, unit, redup) in nums:
        nxt = toks[e] if e < len(toks) else ""
        if not unit and (nxt in SPEC or nxt in YOUNG): qty_for[e] = v; continue
        if unit or nxt in MONEY_HINT or v >= 500: moneys.append((v, redup))
    ev = {"type": et, "day_offset": day_offset(ctx_text, normalize(ctx_text), et)}
    if et in ("sale", "purchase", "expense", "payment", "treatment"):
        ev["credit"] = has(normalize(ctx_text), CREDIT) and et != "payment"
    if et in ("count",) and len(spec_pos) > 1:   # one count event per species
        return [dict(ev, species=sp, qty=int(qty_for.get(i, 0)) or None) for i, sp in spec_pos]
    species = spec_pos[0][1] if spec_pos else None
    if et == "birth":
        q = next((qty_for[i] for i in young_pos if i in qty_for), None)
        mother = next((sp for i, sp in spec_pos if i not in young_pos), None)
        species = mother or species; qty = q or 1
    elif spec_pos:
        i0 = spec_pos[0][0]; qty = qty_for.get(i0, 1)
    else:
        qty = None
    if has(toks, ALL_ANIMALS) and et in ("treatment",) and not spec_pos: species, qty = None, None
    if et in ("death", "loss", "slaughter", "birth", "sale", "purchase", "count", "treatment") and species is None and spec_pos == [] and et != "treatment":
        species = None
    ev.update(species=species, qty=int(qty) if qty else qty) if et not in ("expense", "payment", "task", "trip_start", "trip_end") else None
    if moneys:
        v, redup = moneys[0]; ev["amount_pkr"] = int(v * (qty or 1) if redup else v)
    elif et in ("sale", "purchase"):
        ev["amount_pkr"] = None; ev["missing"] = ["amount_pkr"]
    ic = item_cat(toks, text, et)
    if ic and et in ("expense", "treatment", "task"): ev["item_cat"] = ic
    if et == "loss": ev["cause"] = "theft" if has_seq(text, "چوری", "chori") else "predator" if has_seq(text, "بھیڑیا", "bheriya") else "lost"
    return [ev]

def parse(utt):
    toks = normalize(utt)
    # self-correction: "تین نہیں چار" -> keep the number after نہیں/nahi
    for i in range(1, len(toks)-1):
        if toks[i] in ("نہیں", "nahi", "nahin") and numval(toks[i-1]) is not None and numval(toks[i+1]) is not None:
            toks = toks[:i-1] + toks[i+1:]; break
    # clause split on "and"
    clauses, cur = [], []
    for t in toks:
        if t in ("اور", "aur", "or"): clauses.append(cur); cur = []
        else: cur.append(t)
    clauses.append(cur)
    full = " " + " ".join(toks) + " "
    events, pending = [], []
    for c in clauses:
        ctext = " " + " ".join(c) + " "
        verbless = event_type(ctext, c) is None
        if verbless and has(c, SPEC):           # "ایک بکری اور دو بھیڑیں ... مر گئیں": shares the next verb
            pending.append(c); continue
        if verbless:                             # "کھل اور دانہ لیا": merge noun into next clause
            pending.append(c); continue
        for p in pending:
            if has(p, SPEC): events += parse_clause(p + c[-3:], ctext)
            else: c = p + c
        pending = []
        events += parse_clause(c, ctext if len(clauses) > 1 else full)
    # medicine bought + given to an animal in the same utterance -> one treatment with the cost
    exp = [e for e in events if e["type"] == "expense" and e.get("item_cat") == "medicine"]
    trt = [e for e in events if e["type"] == "treatment"]
    if exp and trt:
        trt[0].setdefault("amount_pkr", exp[0].get("amount_pkr")); events.remove(exp[0])
    return events

if __name__ == "__main__":
    out = open(sys.argv[2], "w") if len(sys.argv) > 2 else sys.stdout
    for line in open(sys.argv[1]):
        j = json.loads(line)
        out.write(json.dumps({"id": j["id"], "events": parse(j["text"])}, ensure_ascii=False) + "\n")
