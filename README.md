# GameTask — Backend (Connect Four)

Server for the Connect Four game (GameTask). Provides matchmaking, real-time gameplay using WebSockets, game persistence, and a small REST API for leaderboard and game inspection.

---

## Features ✅
- Real-time games using Socket.IO
- Matchmaking with 20s wait and fallback to BOT
- Play vs Player and Play vs BOT modes
- Persistent game records (players, moves, result, duration)
- Leaderboard updates emitted via sockets (top wins)
- Rematch and play-again workflow
- Unit tests with Jest

---

## Tech stack 🔧
- Node.js (ES Modules)
- Express
- Socket.IO
- Sequelize (Postgres)
- Jest (tests)
- UUID, dotenv

---

## Setup & Quick start ▶️
1. Copy `.env.example` to `.env` and set DB connection and options:

```bash
cp .env.example .env
# Edit .env (DATABASE_URL, PORT, DB_SYNC, etc.)
```

2. Install and run locally:

```bash
cd backend
npm install
# run DB migrations (recommended)
npx sequelize-cli db:migrate
# or use DB_SYNC=true for local convenience
npm run dev
# run tests
npm test
```

Default server port: `4000` (use `PORT` to override).

---

## Important files & migrations 📁
- `server.js` — server entry and socket attachment
- `game/service.js` — in-memory game engine and persistence
- `socket/index.js` — socket handlers (join, move, resign, rematch, queue)
- `controllers/` — REST endpoints (`games`, `leaderboard`, `users`)
- `models/` — Sequelize models (User, Game)
- `migrations/` — DB migrations
  - `20251221000001-create-games.js` — create `games` table
  - `20251223000000-add-player-ids-to-games.js` — add `player1Id`/`player2Id`
  - `20251223010000-fill-player-ids-from-players.js` — fill player ids from `players` JSON

---

## REST API Endpoints 🔍
- `GET /leaderboard` — top users by wins
- `GET /games` — recent finished games (win/draw/forfeit)
- `GET /games/:id` — game detail
- `POST /users` — create user
- `GET /health` — server health

---

## WebSocket events (summary) 🔁
Client → Server:
- `join` { username }
- `move` { gameId, col }
- `resign` / `leave` { gameId }
- `leaveQueue` — cancel matchmaking wait
- `rematch` { mode } — `'rematch' | 'queue' | 'bot'`
- `rematch:accept`, `rematch:decline`

Server → Client:
- `queue:joined`, `queue:countdown`, `queue:left`
- `game:start`, `game:update` (includes `lastMove`), `game:ended`
- `game:bot:thinking` — UX hint for BOT delay
- `player:disconnected`, `game:resume`
- `rematch:*` events
- `leaderboard:update` — leaderboard push

---

## Persistence / Data model notes 🧾
- `games.players` stored as JSONB (array of {id, username})
- `player1Id`/`player2Id` included as convenience columns
- `moves` stored as JSONB: { at, col, row, playerId }
- `winnerId`, `endedAt`, `durationSeconds` are set when a game ends

---

## Tests & coverage ✅
- Run unit tests: `npm test` (Jest)
- Tests cover engine, bot, matchmaker and finalize/persistence logic

---

## Troubleshooting ⚠️
- If you see `gameService.on is not a function`, make sure you are on a version where `GameService` extends EventEmitter (pull latest changes and restart).
- If DB migrations fail, verify `DATABASE_URL` and that Postgres is reachable.

---

## Contributing
- Add tests for new behavior and open a PR describing changes.

License: MIT
