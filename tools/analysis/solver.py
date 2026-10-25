"""Depth-limited exact solver for the simultaneous zero-sum game, with full-history caching. See README.md for limits."""
import time
import numpy as np
from scipy.optimize import linprog
import nori_rules as R

class TimeLimit(Exception): pass

def solve_matrix_game(M):
    """Zero-sum matrix game (row player maximises). Returns (value, row_strategy, col_strategy) via two LPs; the two values must agree."""
    M = np.asarray(M, dtype=float); n, m = M.shape
    if not M.any(): return 0.0, np.full(n, 1 / n), np.full(m, 1 / m)   # exact shortcut: all-zero matrix
    def lp(A):  # maximise v s.t. A^T x >= v, sum x = 1, x >= 0
        r, c = A.shape
        res = linprog(np.r_[np.zeros(r), -1], A_ub=np.c_[-A.T, np.ones(c)], b_ub=np.zeros(c), A_eq=[np.r_[np.ones(r), 0]], b_eq=[1], bounds=[(0, None)] * r + [(None, None)], method='highs')
        if res.status != 0: raise RuntimeError('LP failed: ' + res.message)
        return res.x[-1], np.clip(res.x[:r], 0, None)
    v, x = lp(M); w, y = lp(-M.T)
    if abs(v + w) > 1e-7: raise RuntimeError(f'LP values disagree: {v} vs {-w}')
    return v, x / x.sum(), y / y.sum()

class Solver:
    def __init__(self, boundary=0.0, time_limit=None):
        self.boundary, self.time_limit, self.t0 = boundary, time_limit, time.time()
        self.cache, self.hits, self.visited, self.matrices, self.cells, self.lp_solved, self.terminal_cells = {}, 0, 0, 0, 0, 0, 0
        self.actions = R.abstract_actions()
    def payoff_matrix(self, state, depth):
        """Rows: White abstract actions, cols: Black abstract actions. Terminal cells use exact values; non-terminal cells recurse, or take the boundary value at depth 1."""
        A = self.actions; M = np.zeros((len(A), len(A)))
        for i, wa in enumerate(A):
            for j, ba in enumerate(A):
                term, nxt = R.step(state, wa, ba); self.cells += 1
                if term is not None: M[i, j] = term[0]; self.terminal_cells += 1
                elif depth > 1: M[i, j] = self.solve(nxt, depth - 1)[0]
                else: M[i, j] = self.boundary
        return M
    def solve(self, state, depth):
        key = (R.full_key(state), depth)
        if key in self.cache: self.hits += 1; return self.cache[key]
        if self.time_limit and time.time() - self.t0 > self.time_limit: raise TimeLimit()
        self.visited += 1
        M = self.payoff_matrix(state, depth); self.matrices += 1
        if M.any(): self.lp_solved += 1
        out = (*solve_matrix_game(M), M) if depth else None
        self.cache[key] = out
        return out
