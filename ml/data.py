"""
Test 7 — training data for CHOTA's intent classifier.

Synthetic, written by Claude (the same author as the rules): phrasings per intent in Urdu script + Roman Urdu
(+ a little English), slot fillers, light augmentation (fillers, ASR-style letter confusions, space errors).
This data is for TRAINING ONLY. Honest evaluation needs sentences from people who never saw these templates
(see eval sets in evaluate.ts / README).
"""
import json, random, re
from pathlib import Path

random.seed(7)
OUT = Path(__file__).parent

# ---------- slot fillers ----------
SP_PL = ['بکریاں', 'بھیڑیں', 'دنبے', 'بکرے', 'اونٹ', 'گائیں', 'جانور', 'میمنے']
SP_1 = ['بکری', 'بھیڑ', 'دنبہ', 'بکرا', 'اونٹنی', 'گائے', 'میمنا', 'اونٹ']
SP_PL_R = ['bakriyan', 'bheden', 'dumbe', 'bakre', 'oont', 'gayen', 'janwar', 'memne']
SP_1_R = ['bakri', 'bher', 'dumba', 'bakra', 'oontni', 'gaye', 'memna']
SP_EN = ['goats', 'sheep', 'camels', 'cows', 'animals']
N_UR = ['دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'دس', 'بارہ', 'پندرہ', 'بیس', 'پچیس', 'تیس', 'چالیس', 'پچاس', 'ساٹھ']
N_R = ['do', 'teen', 'char', 'panch', 'chay', 'saat', 'das', 'bees', 'tees', 'chalees', 'pachaas']
N_DIG = [str(n) for n in (2, 3, 4, 5, 7, 9, 12, 18, 23, 31, 40, 46, 52, 67, 80)]
PLACE = ['پرانا چارہ', 'ٹیوب ویل', 'بڑا درخت', 'کالا پہاڑ', 'چشمہ', 'نالہ', 'قادر کا کنواں', 'سفید پتھر', 'زیارت']
PLACE_R = ['purana chara', 'tubewell', 'bara darakht', 'kala pahar', 'chashma', 'nala', 'safed pathar']
DIR = ['شمال', 'جنوب', 'مشرق', 'مغرب', 'شمال مغرب', 'شمال مشرق', 'جنوب مغرب', 'جنوب مشرق']
DIR_R = ['shumal', 'junoob', 'mashriq', 'maghrib', 'shumal maghrib', 'junoob mashriq']
DIR_EN = ['north', 'south', 'east', 'west', 'northwest', 'southeast']
WHEN = ['کل', 'کل صبح', 'کل شام', 'پرسوں', 'آج شام', 'آج رات', 'دو دن بعد', 'تین دن بعد', 'جمعہ کو', 'اگلے ہفتے', 'دو گھنٹے بعد']
WHEN_R = ['kal', 'kal subah', 'kal shaam', 'parson', 'aaj shaam', 'do din baad', 'juma ko', 'agle hafte', 'do ghante baad']
WHEN_EN = ['tomorrow', 'tomorrow morning', 'tonight', 'in two days', 'next week', 'on friday']
TIME = ['', '', '6 بجے', 'سات بجے', 'ساڑھے پانچ بجے', '9 بجے', 'چار بجے']
TIME_R = ['', '', '6 baje', 'saat baje', 'char baje']
TASK = ['ٹیوب ویل جانا', 'پانی بھرنا', 'ریوڑ گننا', 'بازار جانا', 'اون کٹوانی', 'چارہ لانا', 'منڈی جانا', 'چچا سے ملنا', 'بکریاں نہلانی']
TASK_R = ['tubewell jana', 'pani bharna', 'rewar ginna', 'bazar jana', 'chara lana', 'mandi jana']
TASK_EN = ['go to the tubewell', 'fill water', 'count the herd', 'go to the market']

S = lambda xs: random.choice(xs)

def fill(t):
    """Replace {slot} markers with random fillers."""
    rep = {
        'sp': lambda: S(SP_PL), 'sp1': lambda: S(SP_1), 'spr': lambda: S(SP_PL_R), 'sp1r': lambda: S(SP_1_R), 'spen': lambda: S(SP_EN),
        'n': lambda: S(N_UR + N_DIG), 'nr': lambda: S(N_R + N_DIG), 'place': lambda: S(PLACE), 'placer': lambda: S(PLACE_R),
        'dir': lambda: S(DIR), 'dirr': lambda: S(DIR_R), 'diren': lambda: S(DIR_EN),
        'when': lambda: S(WHEN), 'whenr': lambda: S(WHEN_R), 'whenen': lambda: S(WHEN_EN),
        'time': lambda: S(TIME), 'timer': lambda: S(TIME_R), 'task': lambda: S(TASK), 'taskr': lambda: S(TASK_R), 'tasken': lambda: S(TASK_EN),
    }
    return re.sub(r'\{(\w+)\}', lambda m: rep[m.group(1)](), t)

# ---------- phrasings per intent ----------
T = {
 'home_distance': [
  'گھر کتنی دور ہے', 'گھر کس طرف ہے', 'میرا گھر کدھر ہے', 'یہاں سے گھر کتنا فاصلہ ہے', 'ڈیرہ کتنی دور ہے', 'ڈیرہ کس طرف ہے',
  'گھر کا رخ کون سا ہے', 'میں گھر سے کتنا دور آ گیا ہوں', 'گھر کتنے کلومیٹر ہے', 'گھر کی سمت بتاؤ', 'گاؤں کتنا دور رہ گیا',
  'ghar kitni door hai', 'ghar kis taraf hai', 'dera kidhar hai', 'main ghar se kitna door hoon', 'ghar ka rukh batao',
  'how far is home', 'which way is home'],
 'way_back': [
  'واپسی کا راستہ دکھاؤ', 'واپس کیسے جاؤں', 'جس راستے سے آیا تھا وہ دکھاؤ', 'مجھے واپسی کا رستہ بتاؤ', 'میں راستہ بھول گیا ہوں',
  'واپس گھر کا راستہ دکھا دو', 'آنے والا راستہ دکھاؤ', 'واپسی کا رستہ کدھر سے ہے', 'جس طرف سے آئے تھے اسی طرف لے چلو',
  'wapsi ka rasta dikhao', 'wapas kaise jaun', 'main rasta bhool gaya', 'jis raste se aaya tha woh dikhao', 'wapsi ka rasta batao',
  'show me the way back', 'how do i get back'],
 'start_trip': [
  'سفر شروع کرو', 'چلو نکلتے ہیں', 'ریوڑ لے کر جا رہا ہوں', '{sp} چرانے جا رہا ہوں', 'ٹرپ شروع کریں', 'ریکارڈنگ شروع کرو',
  'اب چراگاہ کی طرف نکل رہا ہوں', 'آج کا سفر شروع', 'راستہ ریکارڈ کرنا شروع کرو', 'میں چرانے نکلا ہوں',
  'safar shuru karo', 'chalo nikalte hain', 'rewar le kar ja raha hoon', '{spr} charane ja raha hoon', 'trip start karo',
  'recording shuru karo', "let's start the trip", 'start trip'],
 'end_trip': [
  'سفر ختم کرو', 'میں واپس آ گیا', 'گھر پہنچ گیا ہوں', 'ٹرپ بند کرو', 'آج کا چکر مکمل ہو گیا', 'ریکارڈنگ بند کرو',
  'ریوڑ واپس ڈیرے پر آ گیا', 'سفر ختم ہو گیا', 'بس آج کے لیے اتنا ہی', 'راستہ ریکارڈ کرنا بند کرو',
  'safar khatam karo', 'main wapas aa gaya', 'ghar pohanch gaya', 'trip band karo', 'recording band karo', 'end the trip', 'stop the trip'],
 'save_place': [
  'اس جگہ کو {place} یاد رکھو', 'یہ جگہ {place} کے نام سے محفوظ کرو', 'یہاں {place} ہے اسے یاد رکھنا', 'اس جگہ کا نام {place} رکھ دو',
  'یہ جگہ نوٹ کر لو', 'یہاں پانی ہے یاد رکھو', 'اس جگہ کو یاد کر لو', 'یہ جگہ محفوظ کر لو', 'یہاں اچھی گھاس ہے یہ جگہ یاد رکھنا',
  'is jagah ko {placer} yaad rakho', 'yeh jagah save karo', 'yahan {placer} hai yaad rakhna', 'is jagah ka naam {placer} rakho',
  'remember this place as {placer}', 'mark this spot'],
 'place_distance': [
  '{place} کتنی دور ہے', '{place} کس طرف ہے', '{place} تک کتنا فاصلہ ہے', '{place} کدھر ہے', 'یہاں سے {place} کتنا دور ہے',
  '{place} والی جگہ کس سمت میں ہے', '{placer} kitni door hai', '{placer} kis taraf hai', '{placer} kidhar hai', 'how far is {placer}'],
 'good_grazing': [
  'اچھا چارہ کہاں ملا تھا', 'پچھلی بار اچھی گھاس کہاں تھی', 'کہاں چرائی اچھی ہوئی تھی', 'سب سے اچھی چراگاہ کون سی تھی',
  'جہاں جانور خوب چرے تھے وہ جگہ کون سی ہے', 'اچھا چارہ کس طرف تھا', 'اچھی چراگاہ دکھاؤ',
  'acha chara kahan mila tha', 'achi ghaas kahan thi', 'pichli baar acha chara kahan tha', 'where was good grazing'],
 'been_here': [
  'کیا میں یہاں پہلے آیا ہوں', 'یہاں پہلے کب آیا تھا', 'یہ جگہ پہلے دیکھی ہے', 'میں اس جگہ پہلے آ چکا ہوں', 'یہاں پہلے بھی آئے تھے',
  'kya main yahan pehle aya hoon', 'yahan pehle kab aya tha', 'is jagah pehle aaye the', 'have i been here before'],
 'last_trip_dir': [
  'پچھلی بار {dir} کب گیا تھا', '{dir} کی طرف آخری بار کب گئے', '{dir} والی طرف کب گیا تھا', 'آخری دفعہ {dir} میں کب چرایا',
  'pichli baar {dirr} kab gaya tha', '{dirr} ki taraf aakhri baar kab gaye', 'when did i last go {diren}'],
 'trips_this_month': [
  'اس مہینے کتنے سفر کیے', 'اس ماہ کتنی بار چرانے گیا', 'اس مہینے کتنے چکر لگے', 'اس مہینے کتنے دن چرایا',
  'is mahine kitne trip kiye', 'is mahine kitni baar gaya', 'how many trips this month'],
 'last_trip_duration': [
  'پچھلا سفر کتنا لمبا تھا', 'پچھلی بار کتنی دیر چرایا', 'آخری ٹرپ کتنے گھنٹے کا تھا', 'پچھلی دفعہ کتنا چلا تھا', 'پچھلا چکر کتنی دیر کا تھا',
  'pichla safar kitna lamba tha', 'pichli trip kitni der ki thi', 'how long was the last trip'],
 'reminder': [
  '{when} {time} {task} یاد دلانا', '{when} {time} {task} ہے', 'مجھے {when} {task} یاد کرانا', '{when} {task} ہے بھولنا نہیں',
  '{when} {task} کی یاد دہانی لگا دو', '{when} {time} مجھے {task} کا بتانا', 'یاد رکھنا {when} {task} ہے',
  '{whenr} {timer} {taskr} yaad dilana', '{whenr} {taskr} hai', 'mujhe {whenr} {taskr} yaad karana', 'remind me {whenen} to {tasken}'],
 'reminders_list': [
  'میری یاد دہانیاں دکھاؤ', 'کون سے کام یاد کرانے ہیں', 'کیا کیا یاد دلانا ہے', 'یاد دہانیاں کیا ہیں', 'کون سے کام باقی ہیں',
  'میرے کام کی فہرست', 'meri yaad dahaniyan dikhao', 'kaun se kaam baqi hain', 'show my reminders'],
 'herd_confirm': [
  'میرے پاس {n} {sp} ہیں', 'آج گنتی کی {n} {sp} ہیں', '{n} {sp} پوری ہیں', 'کل ملا کے {n} {sp} ہیں', 'گن لیا {n} {sp} ہیں',
  'ریوڑ میں {n} {sp} ہیں', 'میں نے گنا {n} {sp} نکلیں', 'mere paas {nr} {spr} hain', 'aaj gin liya {nr} {spr} hain',
  'rewar mein {nr} {spr} hain', 'i have {nr} {spen}'],
 'herd_event_sale': [
  '{n} {sp} بیچ دیں', 'آج {n} {sp} فروخت کیں', '{n} {sp} منڈی میں بیچے', 'ایک {sp1} بیچ دی', '{sp1} بیچ دیا', '{n} {sp} بک گئے',
  '{nr} {spr} bech di', 'aaj {nr} {spr} bechi', 'ek {sp1r} bech diya', 'sold {nr} {spen}'],
 'herd_event_purchase': [
  '{n} {sp} خریدیں', '{n} {sp} لے آیا', 'منڈی سے {n} {sp} خریدے', 'ایک {sp1} خرید لی', 'نیا {sp1} لیا',
  '{nr} {spr} kharidi', 'mandi se {nr} {spr} le aaya', 'bought {nr} {spen}'],
 'herd_event_birth': [
  '{sp1} نے بچہ دیا', '{n} میمنے پیدا ہوئے', '{sp1} کے دو بچے ہوئے', '{sp1} سوئی ہے', 'آج {n} بچے پیدا ہوئے', '{sp1} نے جڑواں بچے دیے',
  '{sp1r} ne bacha diya', '{nr} bache paida huay', '{sp1r} ke do bache huay', 'a {sp1r} gave birth'],
 'herd_event_death': [
  '{n} {sp} مر گئیں', '{sp1} مر گئی', '{sp1} مر گیا', 'ایک {sp1} چل بسی', '{sp1} ہلاک ہو گئی', 'رات کو {sp1} مر گئی', '{n} {sp} مرے',
  '{sp1r} mar gayi', '{nr} {spr} mar gayin', 'ek {sp1r} mar gaya', '{sp1r} died'],
 'herd_event_loss': [
  '{n} {sp} گم ہو گئیں', '{sp1} چوری ہو گئی', 'بھیڑیا {sp1} لے گیا', '{sp1} کھو گئی', '{n} {sp} چوری ہو گئے', 'ایک {sp1} ریوڑ سے بچھڑ گئی',
  '{nr} {spr} gum ho gayin', '{sp1r} chori ho gayi', 'bheriya {sp1r} le gaya', 'lost {nr} {spen}'],
 'herd_event_slaughter': [
  '{sp1} ذبح کی', 'قربانی کے لیے {sp1} ذبح کیا', 'مہمانوں کے لیے {sp1} ذبح کیا', 'عید پر {n} {sp} ذبح کیے', '{sp1} قربان کیا',
  '{sp1r} zibah kiya', 'qurbani ke liye {sp1r} zibah kiya', 'slaughtered a {sp1r}'],
 'herd_status': [
  'میرے پاس کتنی {sp} ہیں', 'ریوڑ کتنا ہے', 'کل کتنے جانور ہیں', 'گنتی کیا ہے', '{sp} کتنی بچی ہیں', 'میرے ریوڑ کی گنتی کتنی ہے',
  'کتنی {sp} ہیں', 'ریوڑ کی تعداد بتاؤ', 'kitni {spr} hain', 'rewar kitna hai', 'mere paas kitne janwar hain', 'how many {spen} do i have'],
 'plan_today': [  # "where should I go today" -> answered from the herder's own records (water, grazing, shade)
  'آج کہاں جاؤں', 'آج ریوڑ کہاں لے جاؤں', 'آج کدھر چراؤں', 'پانی کہاں ملے گا', 'آج کہاں چرانا چاہیے', 'گرمی ہے قریب کہاں جاؤں',
  'زیادہ دور نہیں جا سکتا کہاں جاؤں', '{sp} کو پانی چاہیے کہاں لے جاؤں', 'آج کون سی جگہ ٹھیک رہے گی', 'پیاسے جانوروں کو کدھر لے جاؤں',
  'آج کس طرف جانا بہتر ہے', 'پانی اور چارہ دونوں کہاں ملیں گے', 'دھوپ بہت ہے سایہ والی جگہ کہاں ہے', 'قریب میں پانی کہاں ہے',
  'قریب میں پانی والی جگہ بتاؤ', 'پانی والی کوئی نزدیک جگہ', 'دھوپ تیز ہے سایہ اور پانی کہاں ملے گا', 'آس پاس پانی کہاں ہے', 'گرمی میں {sp} کو کہاں لے جاؤں',
  'kahin paas pani wali jagah batao', 'garmi mein kahan charaun pani ke saath', 'aas paas pani kahan hai', 'dhoop bohot hai saya kahan milega',
  'somewhere close with water', 'a nearby place with water and shade', 'it is hot, where is water near me',
  'آج کس طرف جاؤں', 'گرمی ہے کس طرف جاؤں', '{sp} کو پانی پلانے کس طرف لے جاؤں', 'ریوڑ کو کس طرف لے جاؤں', 'آج کس جگہ چراؤں',
  'aaj kis taraf jaun', 'garmi hai kis taraf jaun', 'aaj kahan jaun', 'aaj rewar kahan le jaun', 'pani kahan milega', 'garmi hai qareeb kahan jaun', 'zyada door nahi ja sakta kahan jaun',
  '{spr} ko pani chahiye kahan le jaun', 'aaj kidhar charaun', 'where should i go today', 'where can i find water nearby'],
 'out_of_scope': [  # greetings, cut features (health, prices, forecasts), chit-chat
  'السلام علیکم', 'کیسے ہو', 'شکریہ', 'خدا حافظ', 'تمہارا نام کیا ہے', 'گانا سناؤ', 'کل بارش ہو گی', 'آج موسم کیسا ہے', 'گرمی بہت ہے',
  '{sp1} بیمار ہے کیا کروں', '{sp1} کو دوائی دی', 'جانور کھانس رہا ہے', '{sp1} کو بخار ہے', 'سب جانوروں کو ٹیکہ لگایا',
  'پانی کا ٹینکر منگوایا', 'ٹینکر والے کو پیسے دیے', 'پانی کا ٹینکر کتنے کا ہے', 'پانی کا بل دیا', 'tanker wale ko 3000 diye', 'pani ka tanker mangwaya', 'water tanker cost',
  'منڈی میں {sp1} کا ریٹ کیا ہے', '{sp1} کی قیمت کیا ہے', 'بھوسے کی بوری کتنے کی ہے', 'ادھار کتنا باقی ہے', 'دوکاندار کو پیسے دیے',
  'وقت کیا ہوا ہے', 'بیٹے کو فون کرو',
  'salam', 'kya haal hai', 'shukriya', 'baarish hogi', '{sp1r} bimar hai', '{sp1r} ko dawai di', 'mandi ka rate kya hai',
  'hello', 'thank you', 'what is the weather'],
}

# ---------- augmentation ----------
PRE = ['', '', '', 'بھائی ', 'یار ', 'ذرا ', 'اچھا ', 'چھوٹا ', 'سنو ', 'chota ', 'yaar ', 'acha ']
POST = ['', '', '', ' ؟', ' بتاؤ', ' جی', ' نا', ' please', ' yaar']
CONFUSE = [('آ', 'ا'), ('ڑ', 'ر'), ('ی', 'ے'), ('ے', 'ی'), ('ہ', 'ھ'), ('ز', 'ذ'), ('س', 'ص'), ('ت', 'ط'), ('ح', 'ہ'), ('ک', 'ق'), ('ا', 'آ'), ('ں', 'ن'), ('ئ', 'ی'),
           ('aa', 'a'), ('ee', 'i'), ('oo', 'u'), ('kh', 'k'), ('h', ''), ('i', 'e')]

def noisy(t):
    """ASR / spelling noise: letter confusions, a merged or split word, a dropped letter."""
    r = random.random()
    if r < 0.4:
        a, b = S(CONFUSE)
        if a in t:
            idx = [m.start() for m in re.finditer(re.escape(a), t)]
            i = S(idx); t = t[:i] + b + t[i + len(a):]
    elif r < 0.6 and ' ' in t:
        i = S([m.start() for m in re.finditer(' ', t)]); t = t[:i] + t[i + 1:]
    elif r < 0.75 and len(t) > 6:
        i = random.randrange(1, len(t) - 1); t = t[:i] + t[i + 1:]
    return t

def gen(per_label=260):
    rows = []
    for label, temps in T.items():
        seen = set()
        tries = 0
        while len(seen) < per_label and tries < per_label * 20:
            tries += 1
            t = fill(S(temps))
            t = re.sub(r'\s+', ' ', S(PRE) + t + S(POST)).strip()
            if random.random() < 0.3: t = noisy(t)
            seen.add(t)
        rows += [{'text': t, 'label': label} for t in sorted(seen)]   # sorted: set order varies per run (hash seed)
    random.shuffle(rows)
    return rows

if __name__ == '__main__':
    rows = gen()
    with open(OUT / 'train.jsonl', 'w') as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + '\n')
    from collections import Counter
    print(len(rows), 'training rows;', Counter(r['label'] for r in rows).most_common(3), '...')
