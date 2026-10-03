"""Hybrid: deterministic Urdu number normalization -> small LLM for structure."""
import json, sys
import llm, rules

def prenormalize(text):
    toks = text.split(); ntoks = rules.normalize(text)
    if len(toks) != len(ntoks): return text
    out, i = [], 0
    spans = {s: (e, v, redup) for s, e, v, unit, redup in rules.parse_numbers(ntoks)}
    while i < len(toks):
        if i in spans:
            e, v, redup = spans[i]; n = str(int(v)) if v == int(v) else str(v)
            out.append(f"{n} each" if redup else n); i = e
        else: out.append(toks[i]); i += 1
    return " ".join(out)

_call = llm.call
llm.call = lambda text, qwen3: _call(prenormalize(text), qwen3)
if __name__ == "__main__":
    for l in list(open("gold.jsonl"))[:6]: print(" ", prenormalize(json.loads(l)["text"]))
    llm.run(sys.argv[1], sys.argv[2], sys.argv[3:])
