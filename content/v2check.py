#!/usr/bin/env python3
"""Validate a v2 level file and placement bank: python3 content/v2check.py 8  (checks content/v2/L8.json and content/v2/P8.json)"""
import json, sys, re

def fail(errs, m): errs.append(m)

def check_mc(errs, where, q, nopt):
    if q.get('type') != 'mc': return
    o = q.get('options') or []
    if len(o) not in nopt: fail(errs, f'{where}: mc needs {nopt} options, has {len(o)}')
    if not isinstance(q.get('answer'), int) or not (0 <= q['answer'] < len(o)): fail(errs, f'{where}: bad answer index')
    if len(set(x.strip().lower() for x in o)) != len(o): fail(errs, f'{where}: duplicate options')

def check_order(errs, where, q):
    if q.get('type') != 'order': return
    if ' '.join(q.get('words') or []) != q.get('answer'): fail(errs, f'{where}: order words do not join to answer')

def check_items(errs, where, items, nopt):
    for i, q in enumerate(items):
        if q.get('type') not in ('mc', 'order'): fail(errs, f'{where}[{i}]: type must be mc or order'); continue
        check_mc(errs, f'{where}[{i}]', q, nopt); check_order(errs, f'{where}[{i}]', q)

def main(n):
    n = int(n); errs = []
    L = json.load(open(f'content/v2/L{n}.json')); nopt = (3,) if n <= 4 else (3, 4)
    if L.get('level') != n: fail(errs, 'level field')
    us = L.get('units') or []
    if len(us) != 4: fail(errs, f'units: need 4, have {len(us)}')
    for ui, u in enumerate(us):
        for k in ('t', 'ar', 'e', 'fn', 'fnAr', 'cando', 'grammar', 'lessons'):
            if not u.get(k): fail(errs, f'unit {ui}: missing {k}')
        if len(u.get('lessons') or []) != 6: fail(errs, f'unit {ui}: need 6 lessons')
        for li, l in enumerate(u.get('lessons') or []):
            if not (isinstance(l, list) and len(l) == 3 and all(isinstance(x, str) and x for x in l)): fail(errs, f'unit {ui} lesson {li}: must be [title, objective, patterns]')
    for ui in range(4):
        for li in range(6):
            key = f'{ui}-{li}'; s = (L.get('scripts') or {}).get(key)
            if not s: fail(errs, f'scripts {key} missing'); continue
            for k in ('objective', 'warmup', 'expressions', 'dialogue', 'speakout', 'culture', 'exit'):
                if not s.get(k): fail(errs, f'scripts {key}: missing {k}')
            ex = s.get('expressions') or []
            if len(ex) != 6: fail(errs, f'scripts {key}: need 6 expressions, have {len(ex)}')
            for e in ex:
                if not all(e.get(k) for k in ('w', 'def', 'ar', 'frame')): fail(errs, f'scripts {key}: expression fields'); break
                if '___' not in e['frame']: fail(errs, f'scripts {key}: frame without ___ ({e["w"]})')
            if n >= 9 and sum(1 for e in ex if ' ' in e.get('w', '').strip()) < 3: fail(errs, f'scripts {key}: levels 9+ need 3+ multi-word expressions')
            d = s.get('dialogue') or {}
            for k in ('scene', 'p1', 'p2', 'focus', 'qs'):
                if not d.get(k): fail(errs, f'scripts {key}: dialogue.{k}')
            if len(d.get('qs') or []) != 2: fail(errs, f'scripts {key}: dialogue.qs needs 2')
            sp = s.get('speakout') or {}
            if len(sp.get('prompts') or []) != 3 or not all(p.get('q') and p.get('hint') for p in sp.get('prompts') or []): fail(errs, f'scripts {key}: speakout needs 3 prompts with q+hint')
            c = s.get('culture') or {}
            if len(c.get('points') or []) != 3 or len(c.get('qs') or []) != 2 or not c.get('title'): fail(errs, f'scripts {key}: culture needs title, 3 points, 2 qs')
            k_ = (L.get('kits') or {}).get(key)
            if not k_ or len(k_.get('words') or []) != 6 or not k_.get('dialogue') or not (k_.get('grammar') or {}).get('title'): fail(errs, f'kits {key}: need 6 words, dialogue, grammar')
            qz = (L.get('quizzes') or {}).get(key) or []
            if len(qz) != 5: fail(errs, f'quizzes {key}: need 5')
            check_items(errs, f'quizzes {key}', qz, nopt)
    for ui in range(4):
        t = (L.get('unitTests') or {}).get(str(ui)) or {}
        if len(t.get('items') or []) != 10: fail(errs, f'unitTests {ui}: need 10 items')
        if len(t.get('speak') or []) != 2: fail(errs, f'unitTests {ui}: need 2 speak')
        check_items(errs, f'unitTests {ui}', t.get('items') or [], nopt)
    lt = L.get('levelTest') or {}
    if len(lt.get('items') or []) != 20: fail(errs, 'levelTest: need 20 items')
    if len(lt.get('speak') or []) != 3: fail(errs, 'levelTest: need 3 speak')
    check_items(errs, 'levelTest', lt.get('items') or [], nopt)
    txt = json.dumps(L, ensure_ascii=False)
    if re.search(r'\b(dating|girlfriend|boyfriend|alcohol|beer|wine|pork|casino|gambl)', txt, re.I): fail(errs, 'content: inappropriate word found')
    # placement bank (Cambridge/Oxford placement style): per level at least 14 mcq (5+ grammar, 4+ vocabulary, 3+ function),
    # 6 two-speaker listening dialogues, 2 graded reading passages with 4 questions each; every item carries d, cefr, skill, cando
    P = json.load(open(f'content/v2/P{n}.json'))
    mc = P.get('mcq') or []
    if len(mc) < 14: fail(errs, f'P: need 14+ mcq, have {len(mc)}')
    for sk, mn in (('grammar', 5), ('vocabulary', 4), ('function', 3)):
        if sum(1 for q in mc if q.get('skill') == sk) < mn: fail(errs, f'P: need {mn}+ {sk} mcq')
    for i, q in enumerate(mc):
        o = q.get('options') or []
        if len(o) not in ((3, 4) if n <= 2 else (4,)) or not isinstance(q.get('answer'), int) or not 0 <= q['answer'] < len(o): fail(errs, f'P mcq {i}: options/answer')
        if len(set(x.strip().lower() for x in o)) != len(o): fail(errs, f'P mcq {i}: duplicate options')
        if q.get('skill') not in ('grammar', 'vocabulary', 'function'): fail(errs, f'P mcq {i}: skill')
    ls = P.get('listen') or []
    if len(ls) < 6: fail(errs, f'P: need 6+ listen, have {len(ls)}')
    for i, q in enumerate(ls):
        if not q.get('script') or len(q.get('options') or []) != 3 or not 0 <= q.get('answer', -1) < 3: fail(errs, f'P listen {i}')
        who = set(re.findall(r"(?:^|[.!?\u2026\"\u201d\u2019)\u2014\u2013]\s*)([A-Z][A-Za-z'\u2019-]{0,15}):\s", q.get('script') or ''))
        if len(who) < 2: fail(errs, f'P listen {i}: needs two labelled speakers')
    r = P.get('read') or {}
    reads = [('read', r), ('read2', P.get('read2') or {})]
    for nm, rr in reads:
        if not rr.get('passage') or len(rr.get('qs') or []) != 4: fail(errs, f'P {nm}: passage + 4 qs')
        for i, q in enumerate(rr.get('qs') or []):
            if len(q.get('options') or []) != 3 or not 0 <= q.get('answer', -1) < 3: fail(errs, f'P {nm} q {i}')
    if len(P.get('aloud') or []) != 3 or len(P.get('speak') or []) != 3: fail(errs, 'P: 3 aloud + 3 speak')
    CEFR = {1:'Pre-A1',2:'Pre-A1',3:'A1',4:'A1',5:'A2',6:'A2',7:'A2+',8:'B1',9:'B1',10:'B1+',11:'B1+',12:'B2',13:'B2',14:'B2+',15:'B2+',16:'C1',17:'C1',18:'C1',19:'C1',20:'C1'}
    SK = {'mcq': ('grammar', 'vocabulary', 'function'), 'listen': ('listening',), 'read': ('reading',), 'read2': ('reading',), 'pic': ('vocabulary', 'listening')}
    for sec, qs in (('mcq', mc), ('listen', ls), ('read', r.get('qs') or []), ('read2', (P.get('read2') or {}).get('qs') or []), ('pic', P.get('pic') or [])):
        for i, q in enumerate(qs):
            if not (isinstance(q.get('d'), (int, float)) and 0.5 <= q['d'] <= 20.5 and abs(q['d'] - n) <= 5): fail(errs, f'P {sec} {i}: d must be a number near the level')
            elif q.get('cefr') != CEFR[max(1, min(20, int(q['d'] + .5)))]: fail(errs, f'P {sec} {i}: cefr does not match d')
            if q.get('skill') not in SK[sec]: fail(errs, f'P {sec} {i}: skill')
            if not q.get('cando') or not q.get('cid'): fail(errs, f'P {sec} {i}: cando + cid')
    if P.get('pic') and n > 3: fail(errs, 'P: picture items only in levels 1-3')
    print(f'L{n}: ' + ('OK' if not errs else f'{len(errs)} problems'))
    for e in errs[:40]: print('  -', e)
    return 0 if not errs else 1

if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
