# Test 7 — CHOTA's on-device intent classifier

A tiny trained model that recognises **which CHOTA command** a sentence means (22 labels incl. `out_of_scope`).
It runs in the browser, offline, in milliseconds, and never generates text.

- `data.py` → `train.jsonl`: synthetic training sentences (Urdu script, Roman Urdu, some English) + ASR-style noise.
- `train.py`: char 2–4-gram + word TF-IDF, multinomial logistic regression → `app/public/data/intent-model.json`
  (~1.3 MB, ~200 KB gzipped) + `parity.json`.
- `app/src/core/intentModel.ts`: the same featurisation in TypeScript (parity-checked against Python: 60/60).
- `evaluate.ts`: rules alone vs what the app does (rules → out-of-scope veto → classifier fallback).

```
.venv/bin/python ml/data.py && .venv/bin/python ml/train.py && node ml/evaluate.ts [your_set.jsonl]
```

In the app: rules first. If they don't understand, the classifier answers when p ≥ 0.5 (shown as "🤖 AI guess";
anything that changes records is still read back for ✓), otherwise it offers its top-2 commands as buttons.
A very confident `out_of_scope` (p ≥ 0.7) overrides a rules herd match (e.g. "بکری کو بخار ہے کیا کروں").

**Caveat:** the training data and `heldout_mine` were written by the same author as the rules, so `heldout_mine` is
optimistic (and one rule was fixed after reading its errors). `heldout_test5` predates the rules. The honest test is a
blind set written by herders / native speakers.
