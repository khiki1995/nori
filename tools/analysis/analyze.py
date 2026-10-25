"""CLI: bounded exact search of NORI V0.0.6 as a simultaneous zero-sum game. Run: python3 analyze.py --depth 2 --control"""
import argparse, csv, json, os, sys, time
import numpy as np
import nori_rules as R
from solver import Solver, TimeLimit

def control_state():
    """Control position: outer ring except 3-4 and 1-10, no chords, streak White=1, Black=0, history = start position + current position once each."""
    mask = R.mask_of([k for k in R.EDGES[:10] if k not in ('3-4', '1-10')]); st0 = R.initial_state()
    seen = dict(st0[3]); seen[R.key_str(mask, 1, 0)] = 1
    return (mask, 1, 0, seen)

def load_state(path):
    d = json.load(open(path)); mask = R.mask_of(d['edges']); s0, s1 = d['streak']; k = R.key_str(mask, s0, s1)
    seen = d.get('seen') or {k: 1}
    assumed = 'seen' not in d
    return (mask, s0, s1, seen), assumed

def label(a): e, act, c = a; return f'{R.EDGES[e]} {act} {"committed" if c else "uncommitted"}'

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--depth', type=int, default=1, help='number of rounds searched (1, 2, 3...)')
    ap.add_argument('--state', help='JSON: {"edges":[...], "streak":[a,b], "seen":{"<mask>|a,b":count}}'); ap.add_argument('--control', action='store_true', help='use the documented control position')
    ap.add_argument('--time-limit', type=float, default=None, help='seconds; the report states clearly if the search did not finish'); ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), 'reports'))
    a = ap.parse_args(); assumed_history = False
    if a.control: state, which = control_state(), 'control position (ring minus 3-4 and 1-10, streak W=1 B=0, history = start + current once each)'
    elif a.state: state, assumed_history = load_state(a.state); which = f'state from {a.state}'
    else: state, which = R.initial_state(), 'standard start position'
    S = Solver(boundary=0.0, time_limit=a.time_limit); t0 = time.time(); finished = True; res = None
    try: res = S.solve(state, a.depth)
    except TimeLimit: finished = False
    el = time.time() - t0
    rep = {'tool': 'nori-analysis', 'rules_version': '0.0.6', 'position': which, 'depth_rounds': a.depth, 'finished': finished,
           'stats': {'states_visited_(matrices_started)': S.visited, 'unique_cache_keys': len(S.cache), 'matrices_solved': S.matrices, 'lp_games_solved_(non_zero_matrices)': S.lp_solved, 'cells_evaluated': S.cells,
                     'terminal_cells': S.terminal_cells, 'cache_hits': S.hits, 'seconds': round(el, 2)},
           'terminal_criteria': ['simultaneous Signal Break -> draw (0)', 'single Signal Break -> win for the opponent (+1/-1 for White)', 'threefold repetition -> draw (0), checked only if no Signal Break'],
           'boundary_evaluation': 'non-terminal positions at the horizon get the neutral estimate 0.0. This is NOT a draw; it is an assumption about the unexplored continuation.',
           'assumptions': (['the repetition history was not provided; only the given position was assumed to have occurred once'] if assumed_history else []) + ['abstract actions (14 edges x 2 actions x 2 commitment classes = 56) are transition-equivalent to the 280 concrete choices'],
           'exact_facts': 'The root value is the exact value of the horizon-limited game with the boundary estimate above, computed by LP for every matrix. It is not a proof about the full game.'}
    if res:
        v, x, y, M = res
        rep['root_value_for_white'] = round(float(v), 9) + 0.0
        rep['white_strategy'] = [{'action': label(A), 'p': round(float(p), 6)} for A, p in zip(S.actions, x) if p > 1e-9]
        rep['black_strategy'] = [{'action': label(A), 'p': round(float(p), 6)} for A, p in zip(S.actions, y) if p > 1e-9]
        rep['note_uniqueness'] = 'Equilibrium strategies are not claimed to be unique.'
    os.makedirs(a.out, exist_ok=True); stem = os.path.join(a.out, f'report_depth{a.depth}' + ('_control' if a.control else ''))
    json.dump(rep, open(stem + '.json', 'w'), indent=1)
    with open(stem + '.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['player', 'action', 'probability'])
        for pl in ('white_strategy', 'black_strategy'):
            for r in rep.get(pl, []): w.writerow([pl.split('_')[0], r['action'], r['p']])
    with open(stem + '.md', 'w') as f:
        f.write(f"# NORI analysis report\n\nPosition: {which}\n\nDepth: {a.depth} round(s). Finished: **{finished}**.\n\n")
        f.write('## Exact facts / bounded result / assumptions\n\n- ' + rep['exact_facts'] + '\n- Boundary: ' + rep['boundary_evaluation'] + '\n' + ''.join(f'- Assumption: {x}\n' for x in rep['assumptions']) + '\n## Statistics\n\n' + ''.join(f'- {k}: {v}\n' for k, v in rep['stats'].items()))
        if res: f.write(f"\n## Result\n\nValue for White: **{rep['root_value_for_white']}**\n\nWhite mixed strategy:\n" + ''.join(f"- {r['action']}: {r['p']}\n" for r in rep['white_strategy']) + "\nBlack mixed strategy:\n" + ''.join(f"- {r['action']}: {r['p']}\n" for r in rep['black_strategy']) + '\n' + rep['note_uniqueness'] + '\n')
        else: f.write('\n## Result\n\nThe search did NOT finish within the time limit. No value is reported.\n')
    print(json.dumps({k: rep[k] for k in ('position', 'depth_rounds', 'finished', 'stats') + (('root_value_for_white',) if res else ())}, indent=1)); print('reports:', stem + '.{json,csv,md}')
    return 0 if finished else 2
if __name__ == '__main__': sys.exit(main())
