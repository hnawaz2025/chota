"""Run a local GGUF model (llama.cpp server) as the event extractor, schema-constrained JSON."""
import json, subprocess, sys, time, urllib.request

SERVER = "../tools/llama-b11379/llama-server"
PORT = 8088
SCHEMA = {"type": "object", "required": ["events"], "properties": {"events": {"type": "array", "items": {
    "type": "object", "required": ["type"], "properties": {
        "type": {"enum": ["sale", "purchase", "birth", "death", "loss", "slaughter", "treatment", "expense",
                          "payment", "count", "trip_start", "trip_end", "task"]},
        "species": {"enum": ["goat", "sheep", "camel", "cattle", None]},
        "qty": {"type": ["integer", "null"]},
        "amount_pkr": {"type": ["integer", "null"]},
        "credit": {"type": "boolean"},
        "day_offset": {"type": "integer"},
        "item_cat": {"enum": ["feed", "water", "medicine", "vaccination", "deworming", "trip", None]},
        "cause": {"type": ["string", "null"]}}}}}}

SYSTEM = """You extract livestock record events from what a herder in Balochistan said (Urdu script or Roman Urdu).
Return JSON {"events":[...]}. One event per animal transaction or happening. Greetings or chit-chat -> {"events":[]}.
Event types: sale, purchase, birth, death, loss (stolen/lost/predator), slaughter, treatment (medicine/injection/vaccine given),
expense (feed, water, medicine bought; not animals), payment (repaying credit), count (herd count), trip_start, trip_end (grazing trip),
task (something to do in future / reminder).
Fields:
- species: goat (بکری بکرا), sheep (بھیڑ دنبہ میمنا), camel (اونٹ), cattle (گائے بیل بھینس); null if all animals / unspecified.
- qty: number of animals (for birth: number of young born). Default 1 if a single animal is mentioned.
- amount_pkr: total rupees as an integer. ہزار/hazar=1000, لاکھ/lakh=100000, ڈیڑھ=1.5, ڈھائی=2.5, سوا=+0.25, ساڑھے=+0.5.
  "بیس بیس ہزار" means 20000 EACH: multiply by qty. If a sale/purchase has no price, amount_pkr = null.
- credit: true if ادھار/udhaar (bought on credit).
- day_offset: days relative to today. آج/aaj=0, unspecified=0. کل/kal = -1 if the verb is past, +1 if future/task.
  پرسوں/parson = -2 past, +2 future. "N دن پہلے" = -N, "N دن بعد" = +N, اگلے ہفتے = +7. Today is Saturday.
- item_cat for expense/treatment/task: feed (بھوسہ کھل دانہ چوکر چارہ), water (پانی ٹینکر), medicine, vaccination (ٹیکہ), deworming (کیڑوں کی دوائی), trip.
If the speaker corrects themselves ("تین نہیں چار"), use the corrected value."""

FEWSHOT = [
    ("کل دو بکرے خریدے اڑتیس ہزار کے",
     {"events": [{"type": "purchase", "species": "goat", "qty": 2, "amount_pkr": 38000, "credit": False, "day_offset": -1}]}),
    ("بھوسہ لیا پانچ ہزار ادھار اور ایک بکری مر گئی",
     {"events": [{"type": "expense", "item_cat": "feed", "amount_pkr": 5000, "credit": True, "day_offset": 0},
                 {"type": "death", "species": "goat", "qty": 1, "day_offset": 0}]}),
    ("agle mahine sab ko teeke lagwane hain",
     {"events": [{"type": "task", "item_cat": "vaccination", "day_offset": 30}]}),
]

def call(text, qwen3):
    msgs = [{"role": "system", "content": SYSTEM}]
    for u, a in FEWSHOT:
        msgs += [{"role": "user", "content": u}, {"role": "assistant", "content": json.dumps(a, ensure_ascii=False)}]
    msgs.append({"role": "user", "content": text})
    body = {"messages": msgs, "temperature": 0, "max_tokens": 400,
            "response_format": {"type": "json_schema", "json_schema": {"name": "events", "schema": SCHEMA}}}
    if qwen3: body["chat_template_kwargs"] = {"enable_thinking": False}
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/chat/completions", json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    return json.loads(json.load(urllib.request.urlopen(req, timeout=300))["choices"][0]["message"]["content"])

def run(model, out, extra_args=()):
    srv = subprocess.Popen([SERVER, "-m", f"../tools/models/{model}", "--port", str(PORT), "-c", "4096", *extra_args],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(120):
            try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health"); break
            except Exception: time.sleep(1)
        qwen3 = "Qwen3" in model
        call("سلام", qwen3)  # warm-up
        with open(out, "w") as f:
            for line in open("gold.jsonl"):
                j = json.loads(line); t0 = time.time()
                try: ev = call(j["text"], qwen3)["events"]
                except Exception as e: ev = []; print("  error", j["id"], e, file=sys.stderr)
                f.write(json.dumps({"id": j["id"], "events": ev, "latency_s": round(time.time()-t0, 2)}, ensure_ascii=False) + "\n")
    finally:
        srv.terminate(); srv.wait()

if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2], sys.argv[3:])
