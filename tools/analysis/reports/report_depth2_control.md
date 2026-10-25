# NORI analysis report

Position: control position (ring minus 3-4 and 1-10, streak W=1 B=0, history = start + current once each)

Depth: 2 round(s). Finished: **True**.

## Exact facts / bounded result / assumptions

- The root value is the exact value of the horizon-limited game with the boundary estimate above, computed by LP for every matrix. It is not a proof about the full game.
- Boundary: non-terminal positions at the horizon get the neutral estimate 0.0. This is NOT a draw; it is an assumption about the unexplored continuation.
- Assumption: abstract actions (14 edges x 2 actions x 2 commitment classes = 56) are transition-equivalent to the 280 concrete choices

## Statistics

- states_visited_(matrices_started): 42
- unique_cache_keys: 42
- matrices_solved: 42
- lp_games_solved_(non_zero_matrices): 4
- cells_evaluated: 131712
- terminal_cells: 10428
- cache_hits: 695
- seconds: 0.46

## Result

Value for White: **-0.5**

White mixed strategy:
- 3-4 CREATE uncommitted: 0.5
- 1-10 CREATE committed: 0.5

Black mixed strategy:
- 1-2 CUT committed: 0.5
- 8-9 CUT committed: 0.5

Equilibrium strategies are not claimed to be unique.
