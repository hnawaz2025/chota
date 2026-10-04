"""
Test 7 — train CHOTA's intent classifier and export it for the browser.

Features: character n-grams (2-4) inside space-padded words + whole words, on text normalised exactly like
app/src/nlu.ts normalize(). TF-IDF (sublinear) + multinomial logistic regression. The same featurisation is
re-implemented in app/src/intentModel.ts; ml/parity.json lets the TS side check it reproduces these scores.
"""
import json, math, re, sys
from collections import Counter
from pathlib import Path
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

HERE = Path(__file__).parent
MODEL_OUT = HERE.parent / 'app' / 'public' / 'data' / 'intent-model.json'

# ---- must match app/src/nlu.ts normalize() ----
CHARMAP = {'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ه': 'ہ', 'ۀ': 'ہ', 'ة': 'ہ', 'ۓ': 'ے',
           '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'}
DIACRITICS = re.compile('[ً-ٰٟ]')
PUNCT = re.compile('[،۔,.!?؟"\']')

def normalize(text):
    t = ''.join(CHARMAP.get(c, c) for c in text)
    t = PUNCT.sub(' ', DIACRITICS.sub('', t).lower())
    return t.split()

def features(text):
    toks = normalize(text)
    out = ['w:' + w for w in toks]
    for w in toks:
        s = ' ' + w + ' '
        for n in (2, 3, 4):
            if len(s) < n: continue
            out += [s[i:i + n] for i in range(len(s) - n + 1)]
    return out

def load(p): return [json.loads(l) for l in open(p)]

def main(max_features=12000, C=8.0):
    train = load(HERE / 'train.jsonl')
    vec = TfidfVectorizer(analyzer=features, sublinear_tf=True, max_features=max_features, min_df=2)
    X = vec.fit_transform([r['text'] for r in train])
    y = [r['label'] for r in train]
    clf = LogisticRegression(C=C, max_iter=3000)
    clf.fit(X, y)
    labels = list(clf.classes_)

    def predict(texts):
        P = clf.predict_proba(vec.transform(texts))
        return [(labels[i], float(p[i])) for p, i in zip(P, P.argmax(1))]

    for name in ('heldout_mine', 'heldout_test5'):
        rows = load(HERE / f'{name}.jsonl')
        pred = predict([r['text'] for r in rows])
        acc = sum(p[0] == r['label'] for p, r in zip(pred, rows)) / len(rows)
        print(f'{name}: classifier alone top-1 accuracy {acc:.2f} on {len(rows)}')

    # ---- export: per feature [idf, {classIdx: weight}] with small weights pruned ----
    vocab, idf, W = vec.vocabulary_, vec.idf_, clf.coef_
    feats = {}
    for f, j in vocab.items():
        ws = {str(k): round(float(W[k, j]), 3) for k in range(len(labels)) if abs(W[k, j]) >= 0.02}
        if ws: feats[f] = [round(float(idf[j]), 3), ws]
    model = {'version': 1, 'labels': labels, 'intercept': [round(float(b), 3) for b in clf.intercept_], 'features': feats,
             'trained_on': len(train), 'note': 'CHOTA Test 7: char 2-4 + word TF-IDF, multinomial logistic regression'}
    MODEL_OUT.write_text(json.dumps(model, ensure_ascii=False, separators=(',', ':')))
    print(f'exported {len(feats)} features, {len(labels)} labels -> {MODEL_OUT} ({MODEL_OUT.stat().st_size // 1024} KB)')

    # ---- parity fixture: the TS implementation must reproduce these probabilities (from the pruned export) ----
    sample = [r['text'] for r in load(HERE / 'heldout_mine.jsonl')[:40]] + [r['text'] for r in load(HERE / 'heldout_test5.jsonl')[:20]]
    def pruned_scores(text):
        cnt = Counter(f for f in features(text) if f in feats)
        x = {f: (1 + math.log(c)) * feats[f][0] for f, c in cnt.items()}
        norm = math.sqrt(sum(v * v for v in x.values())) or 1.0
        s = list(model['intercept'])
        for f, v in x.items():
            for k, w in feats[f][1].items(): s[int(k)] += w * v / norm
        m = max(s); e = [math.exp(v - m) for v in s]; z = sum(e)
        return [v / z for v in e]
    par = []
    for t in sample:
        p = pruned_scores(t); i = int(np.argmax(p))
        par.append({'text': t, 'label': labels[i], 'p': round(p[i], 4)})
    agree = sum(par[k]['label'] == predict([t])[0][0] for k, t in enumerate(sample))
    print(f'pruned export agrees with full model on {agree}/{len(sample)} parity samples')
    (HERE / 'parity.json').write_text(json.dumps(par, ensure_ascii=False, indent=0))

if __name__ == '__main__':
    main(*(float(a) if '.' in a else int(a) for a in sys.argv[1:]))
