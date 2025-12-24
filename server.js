import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import cors from 'cors';
import db from './models/index.js';
import apiRoutes from './routes/index.js';

dotenv.config();

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

// Modular routes
app.use('/', apiRoutes);


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

// small in-memory maps to track connected users and pending rematch requests
const connectedUsers = new Map(); // userId -> socket
const pendingRematches = new Map(); // opponentId -> { requesterId }

// forward countdown events from matchmaker to individual sockets
matchmaker.on('countdown', (player, remainingSec) => {
  if (player && player.socket && player.socket.emit) {
    player.socket.emit('queue:countdown', { remaining: remainingSec });
  }
});

// forward leaderboard updates emitted by GameService to all connected clients
// (GameService emits 'leaderboard' with an array of users)
gameService.on('leaderboard', (topList) => {
  try {
    io && io.emit && io.emit('leaderboard:update', topList);
  } catch (err) {
    console.error('Failed to broadcast leaderboard update', err);
  }
});

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  socket.on('join', async ({ username }) => {
    if (!username) return socket.emit('error', { message: 'username required' });

    // find or create user record
    let [user] = await db.User.findOrCreate({ where: { username }, defaults: { username } });

    socket.data.user = { id: user.id, username: user.username, socketId: socket.id };

    // track connected socket for rematch flows
    connectedUsers.set(user.id, socket);

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

    // Broadcast update to both players with lastMove info
    const game = gameService.getGame(gameId);
    const lastMove = game.moves.length ? game.moves[game.moves.length - 1] : null;
    for (const p of game.players) {
      if (p.socket && p.socket.emit) {
        p.socket.emit('game:update', {
          gameId: game.id,
          board: game.engine.board,
          result: game.result,
          winner: game.winner,
          currentTurn: game.currentTurn,
          lastMove,
          bot: false
        });
      }
    }

    // If game continues and it's a bot's turn, make bot move with a short thinking delay
    if (game.isBotGame && game.result === 'ongoing' && game.currentTurn === 2) {
      const botCol = chooseMove(game.engine, 2, 1);
      if (botCol !== null) {
        // simulate thinking time
        setTimeout(() => {
          const botRes = gameService.applyMove(gameId, game.players[1].id, botCol);
          const last = game.moves.length ? game.moves[game.moves.length - 1] : null;
          for (const p of game.players) if (p.socket && p.socket.emit) p.socket.emit('game:update', {
            gameId: game.id,
            board: game.engine.board,
            result: game.result,
            winner: game.winner,
            currentTurn: game.currentTurn,
            lastMove: last,
            bot: true
          });
        }, 500);
      }
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected', socket.id, reason);
    // cleanup connected user tracking
    if (socket.data && socket.data.user) {
      connectedUsers.delete(socket.data.user.id);
      // try to remove from queue
      matchmaker.leave(socket.data.user.id);
      // if in a game, start forfeit timer
      gameService.handleDisconnect(socket.data.user.id);
    }
  });

  // allow a player to resign/leave immediately (forfeit)
  socket.on('resign', () => {
    const user = socket.data && socket.data.user;
    if (!user) return;
    // if in queue, remove
    matchmaker.leave(user.id);
    // if in game, immediately forfeit
    const game = gameService.getGameByPlayer(user.id);
    if (game) {
      gameService.forfeitGame(game.id, user.id);
    }
  });

  // rematch flow: mode = 'rematch'|'queue'|'bot'
  socket.on('rematch', ({ mode = 'queue' } = {}) => {
    const user = socket.data && socket.data.user;
    if (!user) return socket.emit('error', { message: 'not authenticated' });

    const current = gameService.getGameByPlayer(user.id);
    const playerObj = { id: user.id, username: user.username, socket };

    if (mode === 'rematch') {
      // require an existing finished game with an opponent
      if (!current || current.result === 'ongoing') return socket.emit('error', { message: 'no opponent available for rematch' });
      const opponent = current.players.find((p) => p.id !== user.id);
      if (opponent && connectedUsers.has(opponent.id)) {
        pendingRematches.set(opponent.id, { requesterId: user.id });
        // ask opponent to accept
        connectedUsers.get(opponent.id).emit('rematch:request', { from: user.username });
        socket.emit('rematch:waiting', { to: opponent.username });
      } else {
        // opponent not connected -> fallback to queue
        matchmaker.join(playerObj);
        socket.emit('queue:joined', { token: 'fallback', position: 'waiting' });
      }
      return;
    }

    if (mode === 'queue') {
      // leave any previous queue or current game and join matchmaker
      matchmaker.leave(user.id);
      matchmaker.join(playerObj);
      socket.emit('queue:joined', { token: 'manual', position: 'waiting' });
      return;
    }

    if (mode === 'bot') {
      // start bot game immediately
      const botPlayer = { id: `bot-${Date.now()}`, username: 'BOT', socket: null };
      const game = gameService.createGame(playerObj, botPlayer, true);
      game.players[0].socket = socket;
      socket.emit('game:start', { gameId: game.id, playerNumber: 1, opponent: 'BOT', board: game.engine.board, bot: true });
      return;
    }
  });

  // opponent accepts rematch
  socket.on('rematch:accept', () => {
    const user = socket.data && socket.data.user;
    if (!user) return;
    const pending = pendingRematches.get(user.id);
    if (!pending) return socket.emit('error', { message: 'no rematch pending' });
    const requesterSocket = connectedUsers.get(pending.requesterId);
    if (!requesterSocket) {
      pendingRematches.delete(user.id);
      return socket.emit('rematch:declined', { reason: 'requester not connected' });
    }

    // create new game between requester and this user
    const requesterUser = requesterSocket.data.user;
    const p1 = { id: requesterUser.id, username: requesterUser.username, socket: requesterSocket };
    const p2 = { id: user.id, username: user.username, socket };
    const game = gameService.createGame(p1, p2, false);
    game.players[0].socket = requesterSocket;
    game.players[1].socket = socket;

    // notify both
    requesterSocket.emit('game:start', { gameId: game.id, playerNumber: 1, opponent: p2.username, board: game.engine.board });
    socket.emit('game:start', { gameId: game.id, playerNumber: 2, opponent: p1.username, board: game.engine.board });

    pendingRematches.delete(user.id);
  });

  socket.on('rematch:decline', () => {
    const user = socket.data && socket.data.user;
    if (!user) return;
    const pending = pendingRematches.get(user.id);
    if (pending) {
      const requesterSocket = connectedUsers.get(pending.requesterId);
      if (requesterSocket) requesterSocket.emit('rematch:declined', { by: user.username });
      pendingRematches.delete(user.id);
    }
  });

  // allow a player to resign/leave immediately (forfeit)
  socket.on('resign', () => {
    const user = socket.data && socket.data.user;
    if (!user) return;
    // if in queue, remove
    matchmaker.leave(user.id);
    // if in game, immediately forfeit
    const game = gameService.getGameByPlayer(user.id);
    if (game) {
      gameService.forfeitGame(game.id, user.id);
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
