import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import cors from 'cors';
import db from './models/index.js';

dotenv.config();

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

// Basic routes
app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/leaderboard', async (req, res) => {
  try {
    const users = await db.User.findAll({ order: [['wins', 'DESC']], attributes: ['id', 'username', 'wins'] });
    res.json(users);
  } catch (err) {
    console.error('Leaderboard error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// list recent completed games
app.get('/games', async (req, res) => {
  try {
    const games = await db.Game.findAll({ where: { result: ['win', 'draw', 'forfeit'] }, order: [['endedAt', 'DESC']], limit: 50 });
    res.json(games);
  } catch (err) {
    console.error('GET /games error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/games/:id', async (req, res) => {
  try {
    const game = await db.Game.findByPk(req.params.id);
    if (!game) return res.status(404).json({ error: 'Not Found' });
    res.json(game);
  } catch (err) {
    console.error('GET /games/:id error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// simple user creation
app.post('/users', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const [user] = await db.User.findOrCreate({ where: { username }, defaults: { username } });
    res.json({ id: user.id, username: user.username, wins: user.wins });
  } catch (err) {
    console.error('POST /users error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  cors: {
    origin: '*'
  }
});

import Matchmaker from './matchmaking/matchmaker.js';
import GameService from './game/service.js';
import { chooseMove } from './game/bot.js';

const matchmaker = new Matchmaker(20000);
const gameService = new GameService();

// forward countdown events from matchmaker to individual sockets
matchmaker.on('countdown', (player, remainingSec) => {
  if (player && player.socket && player.socket.emit) {
    player.socket.emit('queue:countdown', { remaining: remainingSec });
  }
});

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  socket.on('join', async ({ username }) => {
    if (!username) return socket.emit('error', { message: 'username required' });

    // find or create user record
    let [user] = await db.User.findOrCreate({ where: { username }, defaults: { username } });

    socket.data.user = { id: user.id, username: user.username, socketId: socket.id };

    // if user has an ongoing game, reattach socket
    const existing = gameService.getGameByPlayer(user.id);
    if (existing) {
      gameService.registerSocket(existing.id, user.id, socket);
      socket.emit('game:resume', { gameId: existing.id, board: existing.engine.board, currentTurn: existing.currentTurn });
      return;
    }

    // Join matchmaking
    const res = matchmaker.join({ id: user.id, username: user.username, socket });
    if (res.matched) {
      // matched handled by match event
    } else {
      socket.emit('queue:joined', { token: res.token, position: 'waiting' });
    }
  });

  socket.on('move', async ({ gameId, col }) => {
    const user = socket.data.user;
    if (!user) return socket.emit('error', { message: 'not authenticated' });

    const result = gameService.applyMove(gameId, user.id, col);
    if (result.error) return socket.emit('move:error', result);

    // Broadcast update to both players if present
    const game = gameService.getGame(gameId);
    for (const p of game.players) {
      if (p.socket && p.socket.emit) {
        p.socket.emit('game:update', {
          gameId: game.id,
          board: game.engine.board,
          result: game.result,
          winner: game.winner,
          currentTurn: game.currentTurn
        });
      }
    }

    // If game continues and it's a bot's turn, make bot move
    if (game.isBotGame && game.result === 'ongoing' && game.currentTurn === 2) {
      const botCol = chooseMove(game.engine, 2, 1);
      if (botCol !== null) {
        const botRes = gameService.applyMove(gameId, game.players[1].id, botCol);
        for (const p of game.players) if (p.socket && p.socket.emit) p.socket.emit('game:update', {
          gameId: game.id,
          board: game.engine.board,
          result: game.result,
          winner: game.winner,
          currentTurn: game.currentTurn
        });
      }
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected', socket.id, reason);
    // try to remove from queue
    if (socket.data && socket.data.user) {
      matchmaker.leave(socket.data.user.id);
      // if in a game, start forfeit timer
      gameService.handleDisconnect(socket.data.user.id);
    }
  });
});

// matchmaker handlers
matchmaker.on('match', (p1, p2) => {
  // create a game: p1 is player1, p2 is player2
  const game = gameService.createGame(p1, p2, false);
  // attach sockets to players for broadcasting
  game.players[0].socket = p1.socket;
  game.players[1].socket = p2.socket;

  // notify both clients
  if (p1.socket) p1.socket.emit('game:start', { gameId: game.id, playerNumber: 1, opponent: p2.username, board: game.engine.board });
  if (p2.socket) p2.socket.emit('game:start', { gameId: game.id, playerNumber: 2, opponent: p1.username, board: game.engine.board });
});

matchmaker.on('timeout', async (player) => {
  // start a bot game for this player
  const botPlayer = { id: `bot-${Date.now()}`, username: 'BOT', socket: null };
  const game = gameService.createGame(player, botPlayer, true);
  game.players[0].socket = player.socket;
  // store bot id in player slot; notify client
  if (player.socket) player.socket.emit('game:start', { gameId: game.id, playerNumber: 1, opponent: 'BOT', board: game.engine.board, bot: true });

  // if bot is first to move (player 2 is bot so currentTurn remains 1), nothing to do now
});

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connected');

    if (process.env.DB_SYNC === 'true') {
      await db.sequelize.sync({ alter: true });
      console.log('Database schema synced (alter:true)');
    }

    httpServer.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
