# NORI analysis report

Position: standard start position

Depth: 2 round(s). Finished: **True**.

## Exact facts / bounded result / assumptions

- The root value is the exact value of the horizon-limited game with the boundary estimate above, computed by LP for every matrix. It is not a proof about the full game.
- Boundary: non-terminal positions at the horizon get the neutral estimate 0.0. This is NOT a draw; it is an assumption about the unexplored continuation.
- Assumption: abstract actions (14 edges x 2 actions x 2 commitment classes = 56) are transition-equivalent to the 280 concrete choices

## Statistics

- states_visited_(matrices_started): 107
- unique_cache_keys: 107
- matrices_solved: 107
- lp_games_solved_(non_zero_matrices): 21
- cells_evaluated: 335552
- terminal_cells: 48760
- cache_hits: 3030
- seconds: 1.86

## Result

Value for White: **0.0**

White mixed strategy:
- 1-2 CREATE committed: 1.0

Black mixed strategy:
- 1-2 CREATE committed: 1.0

Equilibrium strategies are not claimed to be unique.
