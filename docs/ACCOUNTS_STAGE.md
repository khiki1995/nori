# NORI V0.2.3 accounts, profile, bot catalog and Google sign-in status

## Implemented
- Server-side email/password registration with scrypt password hashes, opaque session tokens and JSON persistence in `data/accounts.json`.
- Separate profile UI with editable username, PNG/JPEG/WebP avatar and short bio; profile card shows current rating, coins, games and wins.
- Shared catalogue with 20 named bot profiles. Each has an ID, rating target, coin reward label, unique color theme/typographic emblem, play-style label, tuning weights, biography and pre-game monologue.
- Catalogue lives under a sub-tab in `Задачи`, not on the profile. Search and difficulty filters are present.
- Selecting a bot and pressing `Играть против…` chooses that bot ID and starts a local AI match. Profile tuning changes the AI evaluation weights.
- Server-side Google OAuth authorization-code routes are present, use random state and a one-use, short-lived exchange ticket, and refuse unverified Google profiles. No provider secret is included in the repo.
- `/api/bots` returns the same 20-profile data used by the UI. Shared public JSON is served as `/src/bots-data.json`.

## Limitations (do not claim otherwise)
- Bot portraits are styled CSS/glyph emblems, not twenty separate rendered character illustrations.
- All bots use the existing deterministic one-round evaluation engine with different heuristic weights. The displayed ratings are difficulty targets, not calibrated ELO values and not evidence of 20 separately trained AIs.
- Coin rewards are displayed in the catalogue but are not automatically credited to a player's account yet. Account rating, wins and games played are not automatically updated after local matches.
- Google sign-in is unavailable until the owner creates an OAuth Web application client and configures a private `.env` file. The live Google redirect/exchange flow has not been end-to-end tested with owner credentials. See `docs/GOOGLE_AUTH_SETUP.md`.
- Google and email/password accounts sharing one email are not auto-linked.
- Email verification, password reset, rate limiting, abuse controls and a production database are still outstanding. JSON storage is for a local prototype, not a public concurrent production service.

## Safe setup
- `.env` is ignored by git. Never paste `GOOGLE_CLIENT_SECRET` into the chat or frontend source.
- Keep `data/accounts.json` and OAuth secrets private; use HTTPS and an externally persisted account store for public deployment.
- For phone testing on the same Wi-Fi, open the computer's LAN IP on the phone. Google OAuth using the local `localhost` redirect only suits the computer browser; phone/public usage requires an HTTPS host and matching Google redirect URI.
