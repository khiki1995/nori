"""Reference tests for the analysis tool. Run: python3 -m unittest -v test_analysis  (from tools/analysis)."""
import json, os, random, subprocess, unittest
import numpy as np
import nori_rules as R
from solver import Solver, solve_matrix_game
from analyze import control_state

HERE = os.path.dirname(os.path.abspath(__file__))
WB = R.mask_of(['1-2', '2-3', '8-9', '9-10', '1-10', '5-6', '5-10'])   # White beacons cut off, Black connected
NOOP_W, NOOP_B = (R.IDX['1-2'], R.CREATE, True), (R.IDX['5-6'], R.CREATE, True)

def seen_with(mask, s0, s1, extra=None):
    d = {R.key_str(mask, s0, s1): 1}; d.update(extra or {}); return d

def rot_mask(mask):   # 180-degree rotation n -> n+5 (mod 10) applied to a network
    r = lambda n: (n + 4) % 10 + 1
    return R.mask_of(['-'.join(map(str, sorted((r(a), r(b))))) for a, b in (R.ENDS[i] for i in range(14) if mask >> i & 1)])

class TestActions(unittest.TestCase):
    def test_56_abstract_actions_map_to_legal_concrete_choices(self):
        acts = R.abstract_actions(); self.assertEqual(len(acts), 56); self.assertEqual(len(set(acts)), 56)
        for a in acts:
            node, act, e = R.concrete_choice(a); self.assertTrue(1 <= node <= 10); self.assertEqual(R.abstract_of(node, act, e), a)

class TestJsCrossCheck(unittest.TestCase):
    def test_python_reference_equals_js_engine_on_3000_cases(self):
        rng = random.Random(20261009); cases, py = [], []
        for _ in range(3000):
            mask = rng.getrandbits(14); s0, s1 = rng.choice([(0, 0), (1, 0), (0, 1), (1, 1)])
            seen = seen_with(mask, s0, s1, {R.key_str(rng.getrandbits(14), 0, 0): rng.randint(1, 2) for _ in range(rng.randint(0, 3))})
            if rng.random() < 0.3: seen[R.key_str(mask, s0, s1)] = 2
            ch = [(rng.randint(1, 10), rng.choice([R.CREATE, R.CUT]), rng.randrange(14)) for _ in range(2)]
            if rng.random() < 0.4: ch[1] = (rng.randint(1, 10), rng.choice([R.CREATE, R.CUT]), ch[0][2])   # force same-edge cases often
            cases.append({'edges': R.keys_of(mask), 'streak': [s0, s1], 'seen': seen, 'choices': [{'node': n, 'action': a, 'edge': R.EDGES[e]} for n, a, e in ch]})
            term, nxt = R.step((mask, s0, s1, seen), R.abstract_of(*ch[0]), R.abstract_of(*ch[1])); py.append((term, nxt, R.full_key((mask, s0, s1, seen))))
        out = json.loads(subprocess.run(['node', os.path.join(HERE, 'js_ref.js')], input=json.dumps(cases), capture_output=True, text=True, check=True).stdout)
        self.assertEqual(len(out), 3000); codes = set()
        for c, (term, nxt, fk), j in zip(cases, py, out):
            self.assertEqual(R.mask_of(j['edges']), nxt[0], c); self.assertEqual([nxt[1], nxt[2]], j['streak'], c)
            self.assertEqual(j['code'], term[1] if term else None, c); codes.add(j['code'])
            if term and term[1] == 'SIGNAL_BREAK': self.assertEqual(j['winner'], 0 if term[0] == 1 else 1)
            self.assertEqual(j['fullKey'], fk, 'full history key format must match the JS engine')
            if j['seenKey'] is not None: self.assertEqual(j['seenCount'], nxt[3][j['seenKey']])
        self.assertTrue({None, 'SIGNAL_BREAK', 'THREEFOLD_REPETITION'} <= codes, codes)   # the sample really exercised terminal paths

class TestKeysAndPriorities(unittest.TestCase):
    def test_same_network_and_streak_but_different_history_gives_different_keys(self):
        a = (R.RING_MASK, 0, 0, seen_with(R.RING_MASK, 0, 0)); b = (R.RING_MASK, 0, 0, seen_with(R.RING_MASK, 0, 0, {R.key_str(WB, 0, 0): 1}))
        self.assertNotEqual(R.full_key(a), R.full_key(b)); c = (R.RING_MASK, 0, 0, {R.key_str(R.RING_MASK, 0, 0): 2}); self.assertNotEqual(R.full_key(a), R.full_key(c))
    def test_solver_cache_does_not_merge_states_with_different_history(self):
        S = Solver(); a = (WB, 1, 0, seen_with(WB, 1, 0)); b = (WB, 1, 0, seen_with(WB, 1, 0, {R.key_str(R.RING_MASK, 0, 0): 1}))
        S.solve(a, 1); S.solve(b, 1); self.assertEqual(len(S.cache), 2)
    def test_signal_break_is_checked_before_repetition_and_seen_is_not_updated(self):
        seen = seen_with(WB, 1, 0, {R.key_str(WB, 2, 0): 2}); term, nxt = R.step((WB, 1, 0, seen), NOOP_W, NOOP_B)
        self.assertEqual(term, (-1, 'SIGNAL_BREAK')); self.assertEqual(nxt[3][R.key_str(WB, 2, 0)], 2)
    def test_simultaneous_signal_break_is_a_draw(self):
        s = (0, 1, 1, seen_with(0, 1, 1)); term, _ = R.step(s, (0, R.CUT, True), (4, R.CUT, True)); self.assertEqual(term, (0, 'SIMULTANEOUS_SIGNAL_BREAK'))
    def test_threefold_repetition(self):
        s = R.initial_state(); self.assertIsNone(R.step(s, NOOP_W, NOOP_B)[0]); t1, s1 = R.step(s, NOOP_W, NOOP_B); t2, s2 = R.step(s1, NOOP_W, NOOP_B); self.assertEqual(t2, (0, 'THREEFOLD_REPETITION'))

class TestControlPosition(unittest.TestCase):
    def test_control_position_matches_its_documentation(self):
        m, s0, s1, seen = control_state(); self.assertEqual(sorted(R.keys_of(m)), sorted(k for k in R.EDGES[:10] if k not in ('3-4', '1-10'))); self.assertEqual((s0, s1), (1, 0))
        self.assertEqual(sorted(seen.values()), [1, 1]); self.assertIn(R.key_str(R.RING_MASK, 0, 0), seen); self.assertIn(R.key_str(m, 1, 0), seen)
    def test_abstraction_is_valid_all_280x280_concrete_pairs_match_the_real_js_engine(self):
        m, s0, s1, seen = control_state(); st = (m, s0, s1, seen)
        conc = [(n, a, e) for n in range(1, 11) for a in (R.CREATE, R.CUT) for e in range(14)]; pairs = [(w, b) for w in conc for b in conc]
        payload = {'edges': R.keys_of(m), 'streak': [s0, s1], 'seen': seen, 'pairs': [[{'node': n, 'action': a, 'edge': R.EDGES[e]} for n, a, e in pr] for pr in pairs]}
        out = json.loads(subprocess.run(['node', os.path.join(HERE, 'js_ref.js')], input=json.dumps(payload), capture_output=True, text=True, check=True).stdout)
        self.assertEqual(len(out), 78400)
        for (w, b), j in zip(pairs, out):   # JS runs the CONCRETE choices; Python runs the ABSTRACT class of each choice
            term, nxt = R.step(st, R.abstract_of(*w), R.abstract_of(*b))
            self.assertEqual(R.mask_of(j['edges']), nxt[0], (w, b)); self.assertEqual(j['streak'], [nxt[1], nxt[2]], (w, b)); self.assertEqual(j['code'], term[1] if term else None, (w, b))

class TestLp(unittest.TestCase):
    def test_known_games(self):
        v, x, y = solve_matrix_game([[1, -1], [-1, 1]]); self.assertAlmostEqual(v, 0); np.testing.assert_allclose(x, [.5, .5], atol=1e-7); np.testing.assert_allclose(y, [.5, .5], atol=1e-7)
        v, x, y = solve_matrix_game([[0, -1, 1], [1, 0, -1], [-1, 1, 0]]); self.assertAlmostEqual(v, 0); np.testing.assert_allclose(x, [1 / 3] * 3, atol=1e-7)
        v, x, y = solve_matrix_game([[3, -1], [-2, 1]]); self.assertAlmostEqual(v, 1 / 7, places=7)
        v, x, y = solve_matrix_game([[2, 4], [1, 3]]); self.assertAlmostEqual(v, 2); self.assertAlmostEqual(x[0], 1)   # saddle point
    def test_strategies_guarantee_the_value_on_a_real_matrix(self):
        S = Solver(); M = S.payoff_matrix(control_state(), 1); v, x, y = solve_matrix_game(M)
        self.assertTrue((x @ M >= v - 1e-7).all()); self.assertTrue((M @ y <= v + 1e-7).all()); self.assertAlmostEqual(x.sum(), 1); self.assertAlmostEqual(y.sum(), 1)

class TestHorizon(unittest.TestCase):
    def test_boundary_value_is_a_neutral_estimate_not_a_draw(self):
        for b in (0.0, 0.25):
            S = Solver(boundary=b); v = S.solve((R.RING_MASK, 0, 0, R.initial_state()[3]), 1)[0]; self.assertAlmostEqual(v, b)
    def test_depth_2_from_control_is_consistent_and_antisymmetric_under_rotation(self):
        m, s0, s1, seen = control_state(); rseen = {}
        for k, c in seen.items():
            ms, ss = k.split('|'); mm = sum(1 << i for i, ch in enumerate(ms) if ch == '1'); a, b = ss.split(',')
            rseen[R.key_str(rot_mask(mm), int(b), int(a))] = c
        v1 = Solver().solve((m, s0, s1, seen), 2)[0]; v2 = Solver().solve((rot_mask(m), s1, s0, rseen), 2)[0]
        self.assertAlmostEqual(v1, -v2, places=7)   # symmetry property of the tool, not an independent computation
        self.assertTrue(-1 <= v1 <= 1)

if __name__ == '__main__': unittest.main()
