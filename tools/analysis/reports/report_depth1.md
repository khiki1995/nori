# NORI analysis report

Position: standard start position

Depth: 1 round(s). Finished: **True**.

## Exact facts / bounded result / assumptions

- The root value is the exact value of the horizon-limited game with the boundary estimate above, computed by LP for every matrix. It is not a proof about the full game.
- Boundary: non-terminal positions at the horizon get the neutral estimate 0.0. This is NOT a draw; it is an assumption about the unexplored continuation.
- Assumption: abstract actions (14 edges x 2 actions x 2 commitment classes = 56) are transition-equivalent to the 280 concrete choices

## Statistics

- states_visited_(matrices_started): 1
- unique_cache_keys: 1
- matrices_solved: 1
- lp_games_solved_(non_zero_matrices): 0
- cells_evaluated: 3136
- terminal_cells: 0
- cache_hits: 0
- seconds: 0.03

## Result

Value for White: **0.0**

White mixed strategy:
- 1-2 CREATE committed: 0.017857
- 1-2 CREATE uncommitted: 0.017857
- 1-2 CUT committed: 0.017857
- 1-2 CUT uncommitted: 0.017857
- 2-3 CREATE committed: 0.017857
- 2-3 CREATE uncommitted: 0.017857
- 2-3 CUT committed: 0.017857
- 2-3 CUT uncommitted: 0.017857
- 3-4 CREATE committed: 0.017857
- 3-4 CREATE uncommitted: 0.017857
- 3-4 CUT committed: 0.017857
- 3-4 CUT uncommitted: 0.017857
- 4-5 CREATE committed: 0.017857
- 4-5 CREATE uncommitted: 0.017857
- 4-5 CUT committed: 0.017857
- 4-5 CUT uncommitted: 0.017857
- 5-6 CREATE committed: 0.017857
- 5-6 CREATE uncommitted: 0.017857
- 5-6 CUT committed: 0.017857
- 5-6 CUT uncommitted: 0.017857
- 6-7 CREATE committed: 0.017857
- 6-7 CREATE uncommitted: 0.017857
- 6-7 CUT committed: 0.017857
- 6-7 CUT uncommitted: 0.017857
- 7-8 CREATE committed: 0.017857
- 7-8 CREATE uncommitted: 0.017857
- 7-8 CUT committed: 0.017857
- 7-8 CUT uncommitted: 0.017857
- 8-9 CREATE committed: 0.017857
- 8-9 CREATE uncommitted: 0.017857
- 8-9 CUT committed: 0.017857
- 8-9 CUT uncommitted: 0.017857
- 9-10 CREATE committed: 0.017857
- 9-10 CREATE uncommitted: 0.017857
- 9-10 CUT committed: 0.017857
- 9-10 CUT uncommitted: 0.017857
- 1-10 CREATE committed: 0.017857
- 1-10 CREATE uncommitted: 0.017857
- 1-10 CUT committed: 0.017857
- 1-10 CUT uncommitted: 0.017857
- 2-7 CREATE committed: 0.017857
- 2-7 CREATE uncommitted: 0.017857
- 2-7 CUT committed: 0.017857
- 2-7 CUT uncommitted: 0.017857
- 3-8 CREATE committed: 0.017857
- 3-8 CREATE uncommitted: 0.017857
- 3-8 CUT committed: 0.017857
- 3-8 CUT uncommitted: 0.017857
- 4-9 CREATE committed: 0.017857
- 4-9 CREATE uncommitted: 0.017857
- 4-9 CUT committed: 0.017857
- 4-9 CUT uncommitted: 0.017857
- 5-10 CREATE committed: 0.017857
- 5-10 CREATE uncommitted: 0.017857
- 5-10 CUT committed: 0.017857
- 5-10 CUT uncommitted: 0.017857

Black mixed strategy:
- 1-2 CREATE committed: 0.017857
- 1-2 CREATE uncommitted: 0.017857
- 1-2 CUT committed: 0.017857
- 1-2 CUT uncommitted: 0.017857
- 2-3 CREATE committed: 0.017857
- 2-3 CREATE uncommitted: 0.017857
- 2-3 CUT committed: 0.017857
- 2-3 CUT uncommitted: 0.017857
- 3-4 CREATE committed: 0.017857
- 3-4 CREATE uncommitted: 0.017857
- 3-4 CUT committed: 0.017857
- 3-4 CUT uncommitted: 0.017857
- 4-5 CREATE committed: 0.017857
- 4-5 CREATE uncommitted: 0.017857
- 4-5 CUT committed: 0.017857
- 4-5 CUT uncommitted: 0.017857
- 5-6 CREATE committed: 0.017857
- 5-6 CREATE uncommitted: 0.017857
- 5-6 CUT committed: 0.017857
- 5-6 CUT uncommitted: 0.017857
- 6-7 CREATE committed: 0.017857
- 6-7 CREATE uncommitted: 0.017857
- 6-7 CUT committed: 0.017857
- 6-7 CUT uncommitted: 0.017857
- 7-8 CREATE committed: 0.017857
- 7-8 CREATE uncommitted: 0.017857
- 7-8 CUT committed: 0.017857
- 7-8 CUT uncommitted: 0.017857
- 8-9 CREATE committed: 0.017857
- 8-9 CREATE uncommitted: 0.017857
- 8-9 CUT committed: 0.017857
- 8-9 CUT uncommitted: 0.017857
- 9-10 CREATE committed: 0.017857
- 9-10 CREATE uncommitted: 0.017857
- 9-10 CUT committed: 0.017857
- 9-10 CUT uncommitted: 0.017857
- 1-10 CREATE committed: 0.017857
- 1-10 CREATE uncommitted: 0.017857
- 1-10 CUT committed: 0.017857
- 1-10 CUT uncommitted: 0.017857
- 2-7 CREATE committed: 0.017857
- 2-7 CREATE uncommitted: 0.017857
- 2-7 CUT committed: 0.017857
- 2-7 CUT uncommitted: 0.017857
- 3-8 CREATE committed: 0.017857
- 3-8 CREATE uncommitted: 0.017857
- 3-8 CUT committed: 0.017857
- 3-8 CUT uncommitted: 0.017857
- 4-9 CREATE committed: 0.017857
- 4-9 CREATE uncommitted: 0.017857
- 4-9 CUT committed: 0.017857
- 4-9 CUT uncommitted: 0.017857
- 5-10 CREATE committed: 0.017857
- 5-10 CREATE uncommitted: 0.017857
- 5-10 CUT committed: 0.017857
- 5-10 CUT uncommitted: 0.017857

Equilibrium strategies are not claimed to be unique.
