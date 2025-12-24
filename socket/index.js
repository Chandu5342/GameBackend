import { chooseMove } from '../game/bot.js';

import db from '../models/index.js';

export default function attachSockets(io, matchmaker, gameService) {
  // pending rematch requests: opponentId -> { fromId, fromSocket }
  const pendingRematches = new Map();

  // forward countdowns to players
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
        socket.emit('queue:joined', { token: res.token, position: 'waiting', waitMs: matchmaker.waitMs });
      }
    });

    socket.on('move', async ({ gameId, col }) => {
      const user = socket.data.user;
      if (!user) return socket.emit('error', { message: 'not authenticated' });

      const result = gameService.applyMove(gameId, user.id, col);
      if (result.error) return socket.emit('move:error', result);

      // Broadcast update to both players if present
      let game = gameService.getGame(gameId);
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

      // If game continues and it's a bot's turn, do a short 'thinking' delay then make bot move
      if (game.isBotGame && game.result === 'ongoing' && game.currentTurn === 2) {
        // notify clients that bot is thinking (for UI animation)
        for (const p of game.players) if (p.socket && p.socket.emit) p.socket.emit('game:bot:thinking', { gameId: game.id, message: 'BOT is thinking...' });

        const delay = Math.floor(300 + Math.random() * 700); // 300-1000ms
        setTimeout(() => {
          // re-evaluate and apply bot move
          const botCol = chooseMove(game.engine, 2, 1);
          if (botCol !== null) {
            gameService.applyMove(gameId, game.players[1].id, botCol);
            game = gameService.getGame(gameId);
            for (const p of game.players) if (p.socket && p.socket.emit) p.socket.emit('game:update', {
              gameId: game.id,
              board: game.engine.board,
              result: game.result,
              winner: game.winner,
              currentTurn: game.currentTurn
            });
          }
        }, delay);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected', socket.id, reason);
      // try to remove from queue
      if (socket.data && socket.data.user) {
        matchmaker.leave(socket.data.user.id);
        // if in a game, start forfeit timer
        gameService.handleDisconnect(socket.data.user.id);
        // clear any pending rematch requests involving this user
        pendingRematches.delete(socket.data.user.id);
        for (const [opp, req] of pendingRematches.entries()) {
          if (req.fromId === socket.data.user.id) pendingRematches.delete(opp);
        }
      }
    });

    // allow client to explicitly leave a game immediately (forfeit)
    socket.on('leave', ({ gameId }) => {
      if (!socket.data || !socket.data.user) return socket.emit('error', { message: 'not authenticated' });
      try {
        gameService.forfeitGame(gameId, socket.data.user.id);
      } catch (err) {
        console.error('leave handler error', err);
      }
    });

    // allow 'resign' alias for leave (client compatibility)
    socket.on('resign', ({ gameId }) => {
      if (!socket.data || !socket.data.user) return socket.emit('error', { message: 'not authenticated' });
      try {
        gameService.forfeitGame(gameId, socket.data.user.id);
      } catch (err) {
        console.error('resign handler error', err);
      }
    });

    // allow client to cancel waiting queue
    socket.on('leaveQueue', () => {
      if (!socket.data || !socket.data.user) return socket.emit('error', { message: 'not authenticated' });
      try {
        const ok = matchmaker.leave(socket.data.user.id);
        if (ok && socket.emit) socket.emit('queue:left');
      } catch (err) {
        console.error('leaveQueue handler error', err);
      }
    });

    // rematch / play again handler
    socket.on('rematch', ({ mode } = {}) => {
      if (!socket.data || !socket.data.user) return socket.emit('error', { message: 'not authenticated' });
      try {
        const user = socket.data.user;

        if (mode === 'rematch') {
          // find last finished game this user was in
          const last = Array.from(gameService.games.values()).filter((g) => g.players.some((p) => p.id === user.id) && g.result !== 'ongoing')
            .sort((a, b) => (b.endedAt ? new Date(b.endedAt) - new Date(a.endedAt) : 0))[0];
          if (!last) return socket.emit('rematch:failed', { reason: 'no previous game found' });
          const opponent = last.players.find((p) => p.id !== user.id);
          if (!opponent) return socket.emit('rematch:failed', { reason: 'no opponent' });
          if (!opponent.socket) return socket.emit('rematch:failed', { reason: 'opponent not connected' });

          // store pending request and notify opponent
          pendingRematches.set(opponent.id, { fromId: user.id, fromSocket: socket });
          opponent.socket.emit('rematch:request', { from: user.username });
          socket.emit('rematch:requested', { to: opponent.username });
          return;
        }

        if (mode === 'queue') {
          const res = matchmaker.join({ id: user.id, username: user.username, socket });
          if (!res.matched) socket.emit('queue:joined', { token: res.token, position: 'waiting', waitMs: matchmaker.waitMs });
          return;
        }

        if (mode === 'bot') {
          const botPlayer = { id: `bot-${Date.now()}`, username: 'BOT', socket: null };
          const game = gameService.createGame(user, botPlayer, true);
          game.players[0].socket = socket;
          if (socket) socket.emit('game:start', { gameId: game.id, playerNumber: 1, opponent: 'BOT', board: game.engine.board, bot: true });
          return;
        }

        socket.emit('rematch:failed', { reason: 'unknown mode' });
      } catch (err) {
        console.error('rematch handler error', err);
      }
    });

    socket.on('rematch:accept', () => {
      if (!socket.data || !socket.data.user) return socket.emit('error', { message: 'not authenticated' });
      try {
        const me = socket.data.user;
        const pending = pendingRematches.get(me.id);
        if (!pending) return socket.emit('rematch:failed', { reason: 'no request' });
        const fromSocket = pending.fromSocket;
        const fromUserId = pending.fromId;
        // find from user's name if possible
        const fromUserName = fromSocket && fromSocket.data && fromSocket.data.user ? fromSocket.data.user.username : 'opponent';
        // create a new game
        const p1 = { id: fromUserId, username: fromUserName, socket: fromSocket };
        const p2 = { id: me.id, username: me.username, socket };
        const game = gameService.createGame(p1, p2, false);
        game.players[0].socket = fromSocket;
        game.players[1].socket = socket;
        if (fromSocket) fromSocket.emit('game:start', { gameId: game.id, playerNumber: 1, opponent: me.username, board: game.engine.board });
        if (socket) socket.emit('game:start', { gameId: game.id, playerNumber: 2, opponent: fromUserName, board: game.engine.board });
        pendingRematches.delete(me.id);
      } catch (err) {
        console.error('rematch:accept error', err);
      }
    });

    socket.on('rematch:decline', () => {
      if (!socket.data || !socket.data.user) return socket.emit('error', { message: 'not authenticated' });
      try {
        const me = socket.data.user;
        const pending = pendingRematches.get(me.id);
        if (!pending) return socket.emit('rematch:failed', { reason: 'no request' });
        const fromSocket = pending.fromSocket;
        if (fromSocket && fromSocket.emit) fromSocket.emit('rematch:declined', { by: me.username });
        pendingRematches.delete(me.id);
      } catch (err) {
        console.error('rematch:decline error', err);
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
}
