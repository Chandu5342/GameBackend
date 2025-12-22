# GameTask Backend

Quick start (development):

1. Install dependencies

   npm install

2. Create a Postgres database (local)

   createdb gametask

3. Copy `.env.example` to `.env` and update DB credentials if needed

4. (Optional) Run migrations with Sequelize CLI

   # install sequelize-cli globally or use npx
   npx sequelize-cli db:migrate --config ./config/config.js

   Note: The migrations create `users` and `games` tables.

   Simple alternative (recommended for small/dev setups): set `DB_SYNC=true` in `.env` and the server will call `sequelize.sync({ alter: true })` on startup to create/update tables automatically. This is easiest for local development and avoids using the CLI.

5. Start server (dev)

   npm run dev

Notes:
- Uses Sequelize ORM with Postgres. For development you can set `DB_SYNC=true` in `.env` to auto-sync models on startup.
- Migrations are available in `backend/migrations/` for more control in production environments.
