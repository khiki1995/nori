# NORI V0.2.6 — benchmark findings

Rules version stays **0.0.6**. No rule-engine files were changed. The same ten deterministic profile games (five opposing pairs, both color orders) were run on the V0.2.5 baseline and V0.2.6. A further sample expanded coverage to 20 games. These profiles use variations of one heuristic engine; this is a diagnostic, not an Elo calibration. The anti-cycle heuristic mildly discourages both players from repeatedly accepting a neutral draw; this shared preference means the AI's evaluation is a practical heuristic, not an exact zero-sum equilibrium solver. Official rule outcomes remain unchanged.

## Results

| Batch | Games completed | Wins | Draws by threefold repetition | Avg. rounds | Harness runtime |
|---|---:|---:|---:|---:|---:|
| V0.2.5 baseline, same schedule | 10 | 0 | 10 | 6.30 | 30.95 s |
| V0.2.6, same schedule | 10 | 2 | 8 | 8.90 | 7.98 s |
| V0.2.6, expanded sample | 20 | 4 | 16 | 8.75 | 15.78 s |

All game outcomes respected the existing engine rules. The V0.2.6 expanded sample had 0 games hit the round cap; the four wins ended by Signal Break. The ten-game comparison changed from 0 wins/10 repetition draws to 2 wins/8 repetition draws. The reported time reduction is mostly attributable to evaluating the simultaneous-choice matrix once for both sides and caching network scores; it should not be read as a strategy-strength metric.

## Tests

- JavaScript local suite: **139/139 passed**.
- Optional independent Python analysis suite: **13/13 passed**.
- JavaScript syntax check: passed for `src`, `server`, `tests`, and `tools`.
- Opening-diversity diagnostic: side 0 has 10/20 distinct first choices, side 1 has 12/20, and there are 19/40 combined choice signatures.
- Server integration suite: **not verified** because `ws` was absent and `npm install` did not complete in this environment.

## Reproduce

```sh
node tests/run.js
node tools/quality-benchmark.js
node tools/full-game-benchmark.js --pair-limit=10 --round-cap=60
cd tools/analysis && python3 -m unittest -v test_analysis.py
```

The raw deterministic records are stored next to this report as `v025_baseline_10games.json`, `v026_comparison_10games.json`, and `v026_expanded_20games.json`.
