#!/usr/bin/env python3
"""列出当前 frontier：open + 所有 blocked_by 已 closed + 未认领。"""
import pathlib, re, sys
ISSUE_DIR = pathlib.Path(__file__).resolve().parent

def parse(p):
    txt = p.read_text()
    fm = re.match(r'^---\n(.*?)\n---\n', txt, re.S)
    d = {}
    if fm:
        for line in fm.group(1).splitlines():
            if ':' in line:
                k, v = line.split(':', 1)
                d[k.strip()] = v.strip()
    status = d.get('status', 'open')
    assignee = d.get('assignee', '')
    raw = d.get('blocked_by', '[]').strip('[]')
    blockers = [x.strip() for x in raw.split(',') if x.strip()]
    return d.get('title', p.stem), status, assignee, blockers

issues = {p.stem: parse(p) for p in ISSUE_DIR.glob('bp-*.md') if p.stem != 'bp-map'}
frontier, blocked = [], []
for iid, (title, status, assignee, blockers) in issues.items():
    if status != 'open':
        continue
    open_blockers = [b for b in blockers if issues.get(b, ('', 'open'))[1] != 'closed']
    if open_blockers:
        blocked.append((iid, title, open_blockers))
    elif not assignee:
        frontier.append((iid, title))

print(f"Frontier ({len(frontier)}):")
for iid, title in sorted(frontier):
    print(f"  - {iid}  {title}")
if blocked:
    print(f"\nBlocked ({len(blocked)}):")
    for iid, title, ob in sorted(blocked):
        print(f"  - {iid}  {title}   ← {', '.join(ob)}")
