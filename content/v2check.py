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
    # placement bank
    P = json.load(open(f'content/v2/P{n}.json'))
    if len(P.get('mcq') or []) != 10: fail(errs, 'P: need 10 mcq')
    for i, q in enumerate(P.get('mcq') or []):
        o = q.get('options') or []
        if len(o) not in ((3, 4) if n <= 2 else (4,)) or not isinstance(q.get('answer'), int) or not 0 <= q['answer'] < len(o): fail(errs, f'P mcq {i}: options/answer')
        if q.get('skill') not in ('grammar', 'vocabulary', 'function'): fail(errs, f'P mcq {i}: skill')
    if len(P.get('listen') or []) != 4: fail(errs, 'P: need 4 listen')
    for i, q in enumerate(P.get('listen') or []):
        if not q.get('script') or len(q.get('options') or []) != 3 or not 0 <= q.get('answer', -1) < 3: fail(errs, f'P listen {i}')
    r = P.get('read') or {}
    if not r.get('passage') or len(r.get('qs') or []) != 4: fail(errs, 'P read: passage + 4 qs')
    for i, q in enumerate(r.get('qs') or []):
        if len(q.get('options') or []) != 3 or not 0 <= q.get('answer', -1) < 3: fail(errs, f'P read q {i}')
    if len(P.get('aloud') or []) != 3 or len(P.get('speak') or []) != 3: fail(errs, 'P: 3 aloud + 3 speak')
    print(f'L{n}: ' + ('OK' if not errs else f'{len(errs)} problems'))
    for e in errs[:40]: print('  -', e)
    return 0 if not errs else 1

if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
