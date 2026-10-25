# NORI V0.2.7 — контрольная точка качества

Правила заморожены: V0.0.6. Приложение: V0.2.7.

## Полный бенчмарк эталонных соперников

Запустите `npm run benchmark`. Все 20 профилей сыграют с четырьмя воспроизводимыми эталонными соперниками — random, aggressive, defensive и tactical — при обеих сторонах. Каждая партия сохраняется в `reports/`; стартовое значение seed указано в названии файлов и JSON. Используйте `npm run benchmark:quick` для короткой предварительной проверки.

Рейтинг по очкам в этом наборе — только предварительная сравнительная метрика. Он не равен Elo и может изменяться с набором соперников и seed. Для устойчивой калибровки следует повторять запуск с несколькими значениями `--seed` и несколькими повторениями. Например: `node tools/archetype-benchmark.js --repetitions=3 --seed=20261023`.

## Вход через Google

Откройте приложение через `http://localhost:3000`, а не `file://`. Для Google-входа настройте локальный `.env` по инструкции `docs/GOOGLE_AUTH_SETUP_RU.md`. Без OAuth client credentials live-проверка входа невозможна.

## Звук

Короткий общий звук нажатия заменён на более тихий WAV. Проверка WAV в тестах проверяет, что пик амплитуды мягкого клика ниже установленного порога.

## Проверка сборки V0.2.7

- `node tests/run.js`: **145/145 passed**.
- `node --check` для JavaScript в `src/`, `server/`, `tests/`, `tools/`: пройдено.
- Серверные интеграционные тесты не подтверждены: зависимость `ws` отсутствует в текущем окружении.
- Вход через реальный Google OAuth не тестировался: владельцу проекта нужно создать OAuth Web Client и настроить локальный `.env`.

---

# NORI V0.2.6 — full-game AI quality checkpoint

**App version:** V0.2.6. **Frozen rules:** V0.0.6. Rules and online protocol are unchanged.

## Changes
- Static AI evaluation now differentiates connected beacons by shortest-path length and whether a single edge removal can disconnect the beacon. Board-network scores are cached.
- A single 56×56 simultaneous-choice matrix is evaluated once for both sides per public position.
- The evaluator uses repetition history and cycle-aware move preference: it discourages neutral loops, penalizes repeating the same personal move when returning to a prior position, and still treats a repetition draw as useful for the player behind. These are AI heuristics only; the neutral anti-cycle preference means its evaluation is not an exact zero-sum equilibrium solver. Official game results and threefold-repetition rules are unchanged.
- `node tools/full-game-benchmark.js --pair-limit=10 --round-cap=60` plays 20 deterministic full games across 10 profile pairs, swaps colors, and records round count, result reason, per-profile W/D/L and runtime.

## Results

Detailed game-by-game data and test results: [`AI_BENCHMARK_REPORT.md`](AI_BENCHMARK_REPORT.md). Raw JSON records are kept in `tools/analysis/reports/`.
| Deterministic batch | Wins | Repetition draws | Average rounds | Runtime reported by harness |
|---|---:|---:|---:|---:|
| V0.2.5 baseline, same 10 games | 0 | 10 | 6.3 | 30.95 s |
| V0.2.6, same 10 games | 2 | 8 | 8.9 | 7.8 s |
| V0.2.6, expanded 20 games | 4 | 16 | 8.75 | 15.78 s |

All four wins in the 20-game batch ended by the existing Signal Break rule. All draws ended by the existing threefold-repetition rule. No game hit the 60-round cap. The results are deterministic and limited to these selected profile matchups; they do not establish calibrated Elo, optimal play, or strength against human players.

## Verification
- `node tests/run.js`: **139/139 passed**.
- `node tools/quality-benchmark.js`: opening diversity 10/20 for side 0, 12/20 for side 1, 19/40 across both sides. This is only an opening snapshot.
- `node tools/full-game-benchmark.js --pair-limit=10 --round-cap=60`: 20 completed games, no cap hits.
- Full `npm test` remains **unverified**: the environment lacks the `ws` dependency and the attempted npm install did not complete. Server integration tests and browser E2E are therefore not claimed as passing.

## Reproduce
```sh
node tests/run.js
node tools/quality-benchmark.js
node tools/full-game-benchmark.js --pair-limit=10 --round-cap=60
npm test  # requires npm install to successfully install ws
```

## Remaining work
1. Expand the batch to broader opponent policies, including random and deliberately tactical baselines, before tuning all profile weights.
2. Calibrate displayed bot difficulty labels only after a substantially larger side-swapped match set.
3. Consider bounded multi-round search or a policy trained against diverse strategies; the current engine remains a heuristic one-round evaluator.
4. Move coin-task rewards to server-authoritative verification before describing them as secure or persistent.
