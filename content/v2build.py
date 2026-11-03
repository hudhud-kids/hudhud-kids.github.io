#!/usr/bin/env python3
"""Publish v2 levels: python3 content/v2build.py 8 11 ...
Copies content/v2/L{n}.json over content/L{n}.json keeping the old stories, and content/v2/P{n}.json over content/P{n}.json."""
import json, sys, os, subprocess
for a in sys.argv[1:]:
    n = int(a)
    if subprocess.run([sys.executable, 'content/v2check.py', str(n)]).returncode != 0:
        print(f'L{n}: not valid, skipped'); continue
    new = json.load(open(f'content/v2/L{n}.json'))
    old = json.load(open(f'content/L{n}.json')) if os.path.exists(f'content/L{n}.json') else {}
    new['stories'] = old.get('stories', [])
    new['v'] = 2
    json.dump(new, open(f'content/L{n}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    P = json.load(open(f'content/v2/P{n}.json')); P['level'] = n; P['v'] = 2
    json.dump(P, open(f'content/P{n}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'L{n}: published ({len(new["stories"])} stories kept)')
