"""Independent Python reference of NORI V0.0.6 rules (written from the rules text, NOT ported from the JS code).
Cross-checked against the JS engine in test_analysis.py. Values are from White's point of view: +1 White wins, -1 Black wins, 0 draw."""
from functools import lru_cache

EDGES = ['1-2', '2-3', '3-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10', '1-10', '2-7', '3-8', '4-9', '5-10']  # bit i of a mask = EDGES[i]
IDX = {k: i for i, k in enumerate(EDGES)}
ENDS = [tuple(int(x) for x in k.split('-')) for k in EDGES]
SOURCE = (1, 6)
BEACONS = ((4, 7), (9, 2))
RING_MASK = sum(1 << i for i in range(10))          # start network: 10 outer edges, no chords
STREAK_TARGET, REPEAT_TARGET = 2, 3
CREATE, CUT = 'CREATE', 'CUT'

def mask_of(keys): return sum(1 << IDX[k] for k in keys)
def keys_of(mask): return [EDGES[i] for i in range(14) if mask >> i & 1]
def mask_str(mask): return ''.join('1' if mask >> i & 1 else '0' for i in range(14))
def key_str(mask, s0, s1): return f'{mask_str(mask)}|{s0},{s1}'

@lru_cache(maxsize=None)
def connected(mask, a, b):
    seen, stack = {a}, [a]
    while stack:
        v = stack.pop()
        if v == b: return True
        for i in range(14):
            if mask >> i & 1:
                x, y = ENDS[i]
                w = y if x == v else x if y == v else 0
                if w and w not in seen: seen.add(w); stack.append(w)
    return False

@lru_cache(maxsize=None)
def broken(mask, p):
    return all(not connected(mask, bn, SOURCE[p]) for bn in BEACONS[p])

def committed(node, edge_idx): return node in ENDS[edge_idx]

def resolve(mask, wa, ba):
    """wa/ba = (edge_idx, action, committed). Returns the new edge mask (rules 2.4)."""
    (we, wact, wc), (be, bact, bc) = wa, ba
    def ap(m, e, act): return m | (1 << e) if act == CREATE else m & ~(1 << e)
    if we != be: return ap(ap(mask, we, wact), be, bact)
    if wact == bact: return ap(mask, we, wact)
    if wc and not bc: return ap(mask, we, wact)
    if bc and not wc: return ap(mask, be, bact)
    return mask

def initial_state():
    k = key_str(RING_MASK, 0, 0)
    return (RING_MASK, 0, 0, {k: 1})

def full_key(state):
    """Canonical full-history key: network mask, both streaks AND the whole seen map (same format as JS makeFullKey)."""
    mask, s0, s1, seen = state
    return key_str(mask, s0, s1) + '#' + ';'.join(f'{k}={seen[k]}' for k in sorted(seen))

def step(state, wa, ba):
    """One simultaneous round. Order (rules 2.5): resolve, recompute connectivity, streaks, simultaneous break -> draw,
    single break -> win for the opponent, and only if not finished update/check repetition.
    Returns (terminal, next_state): terminal is None or (value_for_white, code)."""
    mask, s0, s1, seen = state
    m = resolve(mask, wa, ba)
    n0 = s0 + 1 if broken(m, 0) else 0
    n1 = s1 + 1 if broken(m, 1) else 0
    l0, l1 = n0 >= STREAK_TARGET, n1 >= STREAK_TARGET
    if l0 and l1: return (0, 'SIMULTANEOUS_SIGNAL_BREAK'), (m, n0, n1, seen)
    if l0: return (-1, 'SIGNAL_BREAK'), (m, n0, n1, seen)     # White lost -> Black wins
    if l1: return (1, 'SIGNAL_BREAK'), (m, n0, n1, seen)
    k = key_str(m, n0, n1); c = seen.get(k, 0) + 1
    ns = dict(seen); ns[k] = c
    return ((0, 'THREEFOLD_REPETITION') if c >= REPEAT_TARGET else None), (m, n0, n1, ns)

def abstract_actions():
    """56 transition-equivalent actions: 14 edges x CREATE/CUT x committed/uncommitted."""
    return [(e, a, c) for e in range(14) for a in (CREATE, CUT) for c in (True, False)]

def concrete_choice(abstract):
    """A concrete legal (node, action, edge_idx) with the requested commitment (lowest suitable node)."""
    e, a, c = abstract
    node = ENDS[e][0] if c else next(n for n in range(1, 11) if n not in ENDS[e])
    return (node, a, e)

def abstract_of(node, action, edge_idx): return (edge_idx, action, committed(node, edge_idx))
