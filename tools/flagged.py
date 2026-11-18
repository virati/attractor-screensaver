#!/usr/bin/env python3
"""List the systems flagged with `c` in the screensaver.

    python3 tools/flagged.py            # one line per system, most recent last
    python3 tools/flagged.py --json     # the latest record per system, as JSON

Each record in the flag file holds the field as GLSL (`deriv`), the parameters
in play when it was flagged (`params`, drifted ones included) next to the
published ones, the Jacobian support, the time step and seed box, and for a Lie
bracket the two dysts systems `f` and `g`. Read it with
`pandas.read_json(path, lines=True)` for anything more than this listing.
"""
import json
import os
import sys

PATH = os.path.abspath(os.path.expanduser(os.environ.get('ATTRACTORS_FLAGS') or os.path.join(
    os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share'),
    'attractors', 'flagged.jsonl')))


def main():
    if not os.path.exists(PATH):
        print(f'nothing flagged yet; press c on a system to add it\nflag file: {PATH}')
        return
    latest, times = {}, {}
    with open(PATH) as f:
        for line in f:
            if line.strip():
                r = json.loads(line)
                latest[r['name']] = r
                times[r['name']] = times.get(r['name'], 0) + 1
    if '--json' in sys.argv[1:]:
        json.dump(list(latest.values()), sys.stdout, indent=2)
        print()
        return
    order = sorted(latest.values(), key=lambda r: r['flaggedAt'])
    for i, r in enumerate(order, 1):
        jac = ' '.join(''.join('■' if v else '·' for v in row) for row in r.get('jacobianSupport') or [])
        print(f"{i:3}. {r['name']:<28} {r['flaggedAt'][:19].replace('T', ' ')}  x{times[r['name']]}  {jac}")
    print(f'\n{len(order)} systems, {sum(times.values())} flags\nflag file: {PATH}')


if __name__ == '__main__':
    main()
