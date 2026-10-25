## Не выпущено: надёжность сервера, рейтинг онлайн-партий, быстрый ИИ
- Правила V0.0.6 не менялись. Ходы ИИ остались такими же: отпечаток всех ходов самоигры 20 профилей совпадает с версией 0.2.7.
- **Безопасность входа.** scrypt теперь асинхронный и не блокирует сервер. Вход, регистрация и проверка побед ограничены по IP: 10 запросов в минуту, ответ 429 `RATE_LIMITED`; за прокси нужен `TRUST_PROXY=1`. OAuth-состояния очищаются по таймеру, их число ограничено. Запросы к Google прерываются через 10 с. Тело запроса считается по байтам.
- **Несколько устройств.** Вход на одном устройстве больше не завершает сессию на другом: хранятся до 10 последних сессий на пользователя.
- **Рейтинг онлайн-партий.** Если оба игрока вошли в аккаунт, клиент передаёт `auth` в `create_room`/`join_room`. Завершённая партия двух разных аккаунтов один раз меняет Elo, `gamesPlayed` и `wins`.
- **Монеты за ботов на сервере.** `POST /api/rewards/bot-win`: сервер переигрывает партию и проверяет, что каждый ход Чёрных совпадает с ходом бота. За первую победу над каждым ботом начисляется его награда. Монеты за учебные задачи пока хранятся локально.
- **ИИ примерно в 17 раз быстрее**: в среднем 18,9 → 1,1 мс на ход, p95 48,7 → 1,9 мс. Анализ ходов теперь идёт на 14-битных масках сети. Тест сверяет быстрый путь с `stepCore` на тысячах пар ходов.
- Запись аккаунтов группируется: изменения за 200 мс уходят на диск одной атомарной записью. Перед остановкой сервера всё сбрасывается на диск.
- Тесты больше не грузятся в `index.html`: 15 скриптов загружаются только по кнопке «Самопроверка». Тексты профиля и каталога ботов перенесены в `i18n.js`. Сервер разбит на модули `http`, `static`, `api`, `oauth`, `rewards`.
- CSP разрешает Google Fonts: раньше шрифты блокировались. Добавлены `package-lock.json`, GitHub Actions CI (Node 18 и 22), `npm ci` на Render.
- Тесты: локальные **146/146**, серверные **49/49**, `accounts.test.js` проходит. В браузере самопроверка **134/134**.

## 0.2.7: эталонные соперники, мягкий звук и запуск профиля
- Игровые правила V0.0.6 сохранены без изменений.
- Добавлен диагностический бенчмарк полных партий всех 20 профилей против четырёх эталонов: случайного, жадного агрессивного, жадного защитного и базового maximin-ИИ. Проверяются обе стороны; seed и полные записи сохраняются, результаты воспроизводимы.
- **Два независимых seed, 320 партий, 316 завершены штатно, 4 достигли лимита в 18 раундов.** Среди завершённых исходов профильный ИИ получил 190 побед, 120 ничьих и 6 поражений; средняя длина набора — 4.68 раунда. Все 4 ограниченные партии явно отмечены и не считаются завершёнными результатами.
- По типам соперников: против случайного — 73 победы / 7 ничьих / 0 поражений; против агрессивного — 60 / 19 / 1; против защитного — 57 / 22 / 1; против базового тактического maximin — 0 / 72 / 4, плюс 4 партии достигли лимита. Эти проценты описывают данный набор, а не Elo.
- В объединённой выборке наиболее рискованный профиль «Икар» получил 6 поражений из 16 партий; «Лекс» набрал больше всего очков, но 2 его партии достигли лимита, поэтому рейтинг остаётся предварительным. Числовые рейтинги профилей автоматически не изменены.
- Заменён резкий интерфейсный щелчок на более мягкий короткий WAV; остальные игровые звуки и общий ползунок громкости не изменены.
- Подсказка профиля объясняет `file://` и запуск через `START_NORI_WINDOWS.bat`. Добавлена русская инструкция Google OAuth. Google-вход остаётся выключенным до создания владельцем OAuth-клиента и заполнения локального `.env`.
- Локальные тесты: **145/145**. Серверные интеграционные тесты и реальный вход в Google не подтверждены в этой среде.

# Changelog

## 0.2.6: стратегическая оценка позиции и проверка полных партий
- Метка приложения повышена до V0.2.6; официальные правила остаются V0.0.6 без изменений.
- Оценка ИИ теперь учитывает не только связность маяков, но и длину кратчайшего маршрута и уязвимость маршрута к удалению одной связи. Оценка кэшируется по сетям.
- Оценка всех 56×56 одновременных пар ходов вычисляется один раз на позицию для обеих сторон. Добавлена история-зависимая антициклическая эвристика: нейтральные повторы не поощряются, но ничья остаётся полезным исходом для отстающей стороны. При повторном посещении позиции бот также старается не повторять точь-в-точь свой прошлый выбор из неё.
- Добавлен `tools/full-game-benchmark.js`: воспроизводимые полные партии профилей со сменой сторон, исходами, причинами завершения и статистикой по каждому профилю.
- **Сравнение на одних и тех же 10 партиях (5 пар профилей, оба порядка сторон):** исходный V0.2.5 — 0 побед, 10 ничьих повторением, средняя длина 6.3 раунда, 30.95 с; V0.2.6 — 2 победы по Signal Break, 8 ничьих повторением, средняя длина 8.9 раунда, 7.8 с.
- **Расширенный диагностический запуск:** 20 партий (10 пар профилей, каждая пара сыграла обеими сторонами) — 4 победы по Signal Break, 16 ничьих повторением, средняя длина 8.75 раунда; ни одна партия не дошла до лимита 60 раундов. Это небольшой детерминированный набор против текущих профилей, а не калибровка Elo и не доказательство оптимальной стратегии.
- Локальные проверки: 139/139. Полный `npm test` не завершён: окружение не смогло установить зависимость `ws`, поэтому серверные тесты остаются неподтверждёнными.


## 0.2.3: отдельный каталог 20 ИИ-соперников, профиль и Google OAuth-поток
- Боты вынесены из экрана профиля в отдельную вкладку каталога в разделе «Задачи»; добавлены поиск, фильтры, рейтинговые цели, эмблемы, характеры, монологи и отображаемые награды в койнах.
- «Играть против…» выбирает конкретный профиль и создаёт новую локальную партию в режиме ИИ. Профили настраивают оценку через разные веса риска/среднего результата; это эвристические варианты одного движка, а не 20 независимых моделей.
- Экран профиля оставлен для имени, аватара, описания и статистики. Вход через VK отсутствует. Добавлен server-side Google OAuth Authorization Code flow с state и одноразовым короткоживущим ticket; включается только при заданных GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. См. `.env.example` и `docs/GOOGLE_AUTH_SETUP.md`.
- **Ограничения:** картинки персонажей — стилизованные CSS-эмблемы, не отдельные иллюстрации; койны ботов пока не начисляются автоматически; рейтинг/счётчик побед профиля не обновляются по локальным партиям; live OAuth не проверен с реальным Google OAuth client. Email verification, recovery, throttling и production database отсутствуют.
- Правила игры остаются V0.0.6. Проверено: локальный набор — 135/135; аккаунты/каталог — assertions в `tests/accounts.test.js`; syntax check всех модифицированных JS. Полный серверный интеграционный прогон требует `npm install` и не заявляется как выполненный в данной среде.

## 0.2.2: исправлена отображаемая версия приложения
- В `src/constants.js` обновлена метка интерфейса с V0.2.1 на V0.2.2; `package.json` уже содержал версию 0.2.2.
- Игровые правила не менялись.

## 0.1.1: визуальное обновление, темы и звуковая система
- Обновлены визуальные токены, интервалы, карточки, кнопки, навигация, диалоги, игровые панели и адаптивные состояния; правила V0.0.6 и серверный протокол не менялись.
- Добавлено переключение оформления: тёмная тема, светлая тема и настройка «как на устройстве»; выбор хранится в настройках браузера и применяется к метатегу цвета интерфейса.
- Добавлена типографика Space Grotesk для заголовков и DM Sans для интерфейса с безопасным системным fallback. Веб-шрифты загружаются с Google Fonts при наличии интернета; при отсутствии сети интерфейс использует системные шрифты.
- Заменены простые синтезированные гудки на 17 оригинальных локальных WAV-эффектов (созданы специально для НОРИ, без сторонней музыки/сэмплов). Добавлены выбор звука для предварительного прослушивания, общая громкость и mute. Эффекты загружаются с локальных файлов, не обращаются к внешнему API и не повторяются при перерисовках.
- Настройки темы и выбранного звука сохраняются. Добавлены локализованные названия тем и предпрослушивания для 11 языков.
- Проверено: `npm run test:local` — 134/134 после добавления проверки темы/аудиофайлов; синтаксис JS проверен через `node --check`. Серверные тесты и реальное проигрывание звука на разных устройствах в этой среде отдельно не подтверждены.

## 0.1.0: архив партий, повторы и NORI LAB
- Добавлены `src/replay.js`, `src/games.js`, `src/lab.js`: повтор раундов с детерминированной проверкой, архив до 50 завершённых локальных матчей, изолированная песочница и строгий JSON-импорт/экспорт сценариев.
- Добавлены вкладки «Партии» и «NORI LAB», управление повтором, список итогов, просмотр событий и изменившихся связей, редактирование связей в песочнице, предварительный просмотр пары действий и карта критических связей.
- Карта критических связей отмечает только связи, удаление которых действительно разрывает существующий путь к маяку. В лаборатории явно указано, что история повторений неполная; результаты не влияют на онлайн-матчи или рейтинг.
- Правила остаются V0.0.6; версия приложения повышена до V0.1.0. Профили/рейтинг, ежедневная задача и зрительский режим не реализованы.
- Проверено в этой сборке: `node tests/run.js` — 133/133; все JavaScript-файлы прошли `node --check`. Серверные и браузерные E2E-тесты в этой среде отдельно не подтверждены (см. `docs/STATUS.md`).


## Контрольная точка после V0.0.7: телефоны, меню, задачи
Откат: `nori-backup-before-v008` (вне архива). Правила V0.0.6 и онлайн-протокол не менялись.
- Меню «Ещё», безопасные зоны, ландшафт, 320 px, манифест и иконки, 5 новых звуков (раскрытие, ошибка, вошёл, вышел, вернулся), тишина в фоновой вкладке, быстрое переподключение при возврате на вкладку.
- Экран «Задачи»: `src/tasks.js` (проверка движком), `src/tasks-data.js` (12 задач), `src/tasks-ui.js`; отрисовка доски обобщена для повторного использования.
- Тесты: локальные 115, серверные 39; сценарии `e2e-mobile` (13) и `e2e-tasks` (30); сценарии Playwright переведены на ожидания-функции (политика CSP запрещает `eval`).
- Найдено и исправлено в ходе работы: меню выходило за экран в ландшафте; правило ландшафта перекрывалось общим; у задач «commit» не было позиции по умолчанию.
- Не сделано: история и разбор партий, профили и рейтинг. См. `docs/STATUS.md`.

## 0.0.7: интерфейс, дизайн и звук (правила V0.0.6 и онлайн-протокол не менялись)
Резервная копия до этого этапа: `nori-backup-before-v007` (вне архива); предыдущая версия также лежит в `nori-v0.0.6-online.zip`.
- Новый визуальный язык и типографика, компактная шапка, статус фазы, пошаговый индикатор хода, карточки, лента истории, акцент на изменившихся рёбрах и маяках.
- Диалог настроек (звук, громкость, меньше анимации), правила с коротким туром, необязательная плашка для новичков.
- `src/sound.js`: синтезированные звуки Web Audio и событийный трекер (без повторов при перерисовке; в онлайне только после подтверждения сервером; mute не создаёт даже AudioContext). Новое поле `online.youLocked` в онлайн-представлении (серверно подтверждённый выбор); сам протокол без изменений.
- Подтверждение выхода из онлайн-комнаты только при идущей партии с подключённым соперником.
- 25 новых строк на каждом из 11 языков. Константа `APP_VERSION` ('0.0.7'); `VERSION` ('0.0.6') остаётся версией правил в сохранениях и экспортах.
- Тесты: локальный набор 82 → 102 (звук, онлайн-вид), браузерный сценарий интерфейса (`tests/e2e-ui-playwright.py`, 40 проверок). Серверные тесты и сценарии прежних этапов без изменений.

## 0.0.6 + онлайн-режим (этап «онлайн»)
Правила и локальные режимы не менялись (резервная копия до этого этапа: `nori-backup-before-online`, вне архива).
- Новый сервер `server/` (Node.js + `ws`): статические файлы, `/health`, WebSocket `/ws`, комнаты по коду, места Белые/Чёрные, скрытый выбор, одновременное раскрытие, авторитетное состояние через `NORI.state.playRound`.
- Токены мест (хранится только SHA-256), восстановление места, замена старого соединения (4001), heartbeat, ограничение частоты, проверка Origin, ограничение размера кадра, очистка брошенных комнат.
- Клиент `src/online.js`: переподключение с экспоненциальной паузой, «подключено» только после подтверждения сервера, токен по коду комнаты в localStorage, нейтральные экраны ожидания.
- Интерфейс: окно «Играть онлайн», бейдж статуса, копирование кода с запасным вариантом, понятные ошибки на 11 языках (35 новых строк на язык).
- Протокол задокументирован: `docs/PROTOCOL.md`. Добавлены `render.yaml`, `.gitignore`, `package.json` со скриптами `start`/`test`.
- Тесты: серверная логика (23), интеграция с настоящими WebSocket-клиентами (15), клиент онлайна (18), браузер с двумя профилями против настоящего сервера (32 проверки).

## 0.0.6 — пересборка (архитектура v2)
Создано заново (резервная копия прежнего проекта: `backup/nori-before-rebuild-20261009-1727`, вне архива):
- Движок разделён на модули `src/` (constants, graph, rules, state, ai, controller, storage); интерфейс не содержит правил.
- Состояние неизменяемо; отмена раунда = детерминированный повтор партии без последнего раунда (точно восстанавливает связи, серии, `seen`, журнал, результат).
- Движок валидирует узел, действие и ребро (коды ошибок `INVALID_NODE`, `INVALID_ACTION`, `INVALID_EDGE`, `INVALID_CHOICE(S)`, `GAME_OVER`).
- Результаты структурированы: `type`, `winner`, `loser`, `code`, `reason`.
- Интерфейс: клик по узлам и по всем 14 связям (включая отсутствующие), клавиатура, «Отменить раунд», «Правила», автосохранение в localStorage, экспорт и импорт JSON с проверкой, самопроверка с реальными числами.
- Простой ИИ переписан: worst-case по 56 абстрактным ответам соперника, среднее как tie-break.
- 11 языков, включая полные правила, ошибки и сообщения.
- Тесты: 64 в Node (`node tests/run.js`) и 13 для инструмента анализа (Python).
- Новый необязательный инструмент `tools/analysis/` (ограниченный точный поиск, LP).

Игровые правила V0.0.6 не изменялись.

## V0.2.1 — account screen and Windows launch fix
- Added a visible Profile tab with sign-in/registration, profile statistics, profile editing, and avatar preview/upload.
- Added the four-entry bot catalogue to the UI and clearly label bot match integration and rated-match updates as pending.
- Added `START_NORI_WINDOWS.bat` and clear guidance that account features need the Node server at `http://localhost:3000`; a `file://` page cannot call the account API.
- Declared bundled WAV assets as `audio/wav`.
- Frozen game rules remain V0.0.6.

## V0.2.0 — account and player foundation
- Added server-side account store with scrypt password hashes, opaque bearer sessions (only SHA-256 token hashes persisted), profile validation, and persistent JSON storage.
- Added `/api/register`, `/api/login`, `/api/me`, `/api/profile`, `/api/logout`, and `/api/bots` API foundations.
- Added four bot profile definitions and an Elo-style rating calculation utility. Ratings are not yet applied to real match results; the authoritative online match-finish integration remains a separate step.
- Reduced the amplitude of the 17 bundled WAV effects for a softer, less intrusive baseline.
- Frozen rules remain V0.0.6. Google/VK/Telegram OAuth is not enabled yet because real provider app credentials and callback URLs must be configured.

## V0.2.2 — bot catalogue and mobile LAN
- Added 20 styled bot profile cards with distinct names, ratings, monologues, style labels and catalogue coin values.
- Bot cards now have a working Play action that opens a new local AI game.
- Increased account JSON request limit to allow profile image data URLs selected by the existing avatar form.
- Added phone-on-same-Wi-Fi launch guide.
- Note: all bot profiles still use the existing base AI engine; distinct algorithm strength and rating calibration remain future work.

## V0.2.4 — quality checkpoint
- Kept rules frozen at V0.0.6.
- Added bounded style-aware AI preferences to diversify near-equal choices.
- Added a repeatable self-play/opening-diversity benchmark.
- Reduced effective sound playback gain for softer feedback.
- Added shared top-bar identity (avatar and nickname when signed in).
- Added local coin-task rewards under Tasks; not yet synced with account coins.

## V0.2.4 — gameplay quality checkpoint
- Frozen rules V0.0.6; no commitment, conflict, Signal Break, or repetition changes.
- Added bounded style-specific and profile-specific preferences to AI tie/near-tie scoring.
- Added `tools/quality-benchmark.js` for repeatable opening-diversity diagnostics; it explicitly does not claim empirical win-rate balance.
- Lowered sound playback gain for more comfortable UI feedback.
- Added shared header identity badge for signed-in username/avatar.
- Added a “Coin tasks” subtab with three browser-local reward tasks. These coins are not synced to the server account wallet yet.

## V0.2.5 — strategy-quality checkpoint
- Kept rules version V0.0.6 unchanged.
- Added repetition-aware evaluation to the AI: a previously visited nonterminal state is treated as strategically less attractive when ahead and more attractive when behind, while the official threefold-repetition result remains unchanged.
- Expanded `tools/quality-benchmark.js` to report distinct first choices for both player sides and to explicitly separate automated measurements from fairness and human-retention conclusions.
- This release does not claim calibrated Elo, proven side balance, server-authoritative coin rewards, or human retention results.

## V0.2.5 — strategy-quality checkpoint (verified build)
- Rules version remains V0.0.6.
- Catalog bots now select deterministically among a narrow band of strategically near-equal moves, using their individual profile identity to diversify choices without changing terminal win/loss scores. This is a diversity heuristic, not deeper search or proof of distinct long-term strategies.
- Quality benchmark now measures first-choice diversity for both player sides and explicitly separates automated checks from empirical balance and human retention.
- Coin-task rewards remain local-only; account-authoritative coin transactions are not implemented in this release.
