import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ConnectFour } from './index.js';
import db from '../models/index.js';

export default class GameService extends EventEmitter {
  constructor({ forfeitTimeoutMs = 30000, persist = true } = {}) {
    super();
    this.games = new Map(); // id -> game object
    this.forfeitTimeoutMs = forfeitTimeoutMs;
    this.forfeitTimers = new Map(); // gameId -> timer
    this.persist = persist; // whether to persist completed games
  }

  createGame(player1, player2, isBotGame = false) {
    const id = uuidv4();
    const engine = new ConnectFour();
    const game = {
      id,
      engine,
      players: [player1, player2],
      startedAt: new Date(),
      currentTurn: 1, // player1 -> 1, player2 -> 2
      moves: [],
      result: 'ongoing',
      winner: null,
      isBotGame,
      disconnected: null
    };
    this.games.set(id, game);
    return game;
  }

  getGame(id) {
    return this.games.get(id) || null;
  }

  getGameByPlayer(playerId) {
    for (const g of this.games.values()) {
      if (g.players.some((p) => p.id === playerId) && g.result === 'ongoing') return g;
    }
    return null;
  }

  registerSocket(gameId, playerId, socket) {
    const game = this.games.get(gameId);
    if (!game) return false;
    const p = game.players.find((pl) => pl.id === playerId);
    if (!p) return false;
    p.socket = socket;
    return true;
  }

  applyMove(gameId, playerId, col) {
    const game = this.games.get(gameId);
    if (!game) return { error: 'NotFound' };

    const playerIndex = game.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return { error: 'NotPlayer' };

    const playerNum = playerIndex === 0 ? 1 : 2;

    // enforce turn
    if (game.currentTurn !== playerNum) return { error: 'NotYourTurn' };

    if (!game.engine.isValidMove(col)) return { error: 'InvalidMove' };

    const pos = game.engine.dropDisc(col, playerNum);
    game.moves.push({ playerId, col, row: pos.row, at: new Date() });

    // check win
    if (game.engine.checkLastMoveWin()) {
      game.result = 'win';
      game.winner = playerId;
      game.endedAt = new Date();
      game.durationSeconds = Math.floor((game.endedAt - game.startedAt) / 1000);
      this.finalizeGame(game);
      return { ok: true, result: 'win', winner: playerId, pos };
    }

    // check draw
    if (game.engine.checkDraw()) {
      game.result = 'draw';
      game.endedAt = new Date();
      game.durationSeconds = Math.floor((game.endedAt - game.startedAt) / 1000);
      this.finalizeGame(game);
      return { ok: true, result: 'draw', pos };
    }

    // switch turn
    game.currentTurn = playerNum === 1 ? 2 : 1;
    return { ok: true, result: 'ongoing', nextTurn: game.currentTurn, pos };
  }

  handleDisconnect(playerId) {
    const game = this.getGameByPlayer(playerId);
    if (!game) return false;
    // mark disconnected
    game.disconnected = { playerId, at: new Date() };

    // notify opponent
    const opponent = game.players.find((p) => p.id !== playerId);
    if (opponent && opponent.socket && opponent.socket.emit) {
      opponent.socket.emit('player:disconnected', { playerId, timeoutMs: this.forfeitTimeoutMs });
    }

    // start forfeit timer
    const timer = setTimeout(() => {
      this.forfeitGame(game.id, playerId);
    }, this.forfeitTimeoutMs);

    this.forfeitTimers.set(game.id, timer);
    return true;
  }

  handleReconnect(playerId, socket) {
    const game = this.getGameByPlayer(playerId);
    if (!game) return false;

    // clear timer
    const timer = this.forfeitTimers.get(game.id);
    if (timer) {
      clearTimeout(timer);
      this.forfeitTimers.delete(game.id);
    }

    // clear disconnected flag
    game.disconnected = null;

    // reattach socket
    const player = game.players.find((p) => p.id === playerId);
    if (player) player.socket = socket;

    // notify both players
    for (const p of game.players) if (p.socket && p.socket.emit) p.socket.emit('game:resume', {
      gameId: game.id,
      board: game.engine.board,
      currentTurn: game.currentTurn
    });

    return true;
  }

  forfeitGame(gameId, loserId) {
    const game = this.getGame(gameId);
    if (!game || game.result !== 'ongoing') return false;

    const loserIdx = game.players.findIndex((p) => p.id === loserId);
    if (loserIdx === -1) return false;

    const winner = game.players[loserIdx === 0 ? 1 : 0];

    game.result = 'forfeit';
    game.winner = winner.id;
    game.endedAt = new Date();
    game.durationSeconds = Math.floor((game.endedAt - game.startedAt) / 1000);

    // notify players
    for (const p of game.players) if (p.socket && p.socket.emit) p.socket.emit('game:ended', { result: 'forfeit', winner: game.winner });

    // clear any timer
    const timer = this.forfeitTimers.get(game.id);
    if (timer) {
      clearTimeout(timer);
      this.forfeitTimers.delete(game.id);
    }

    this.finalizeGame(game);
    return true;
  }

  async finalizeGame(game) {
    // persist game and update leaderboard if desired
    try {
      if (this.persist) {
        await db.Game.create({
          id: game.id,
          players: game.players.map((p) => ({ id: p.id, username: p.username })),
          winnerId: game.winner || null,
          // persist player columns for easier querying/associations
          player1Id: game.players[0]?.id || null,
          player2Id: game.players[1]?.id || null,
          result: game.result,
          moves: game.moves,
          startedAt: game.startedAt,
          endedAt: game.endedAt,
          durationSeconds: game.durationSeconds
        });

        if (game.winner) {
          await db.User.increment('wins', { where: { id: game.winner } });

          // emit updated leaderboard to listeners
          try {
            const top = await db.User.findAll({ order: [['wins', 'DESC']], attributes: ['id', 'username', 'wins'], limit: 10 });
            this.emit('leaderboard', top);
          } catch (e) {
            console.error('Failed to fetch leaderboard after win increment', e);
          }
        }
      }
    } catch (err) {
      console.error('Failed to persist game:', err);
    }

    // keep game in memory for now but maybe we can move to archive later
  }
}
