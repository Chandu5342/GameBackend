import { describe, it, expect, beforeEach } from '@jest/globals';
import GameService from '../game/service.js';

// simple mocks for sockets
function makeSocket() {
  const events = [];
  return {
    emit: (evt, payload) => events.push({ evt, payload }),
    getEvents: () => events
  };
}

describe('GameService disconnect and forfeit', () => {
  let svc;
  beforeEach(() => {
    // short timeout and no persistence for tests
    svc = new GameService({ forfeitTimeoutMs: 100, persist: false });
  });

  it('forfeits if player does not reconnect', (done) => {
    const p1 = { id: 'p1', username: 'a', socket: makeSocket() };
    const p2 = { id: 'p2', username: 'b', socket: makeSocket() };

    const game = svc.createGame(p1, p2, false);

    // player1 disconnects
    svc.handleDisconnect('p1');

    // wait longer than timeout
    setTimeout(() => {
      const g = svc.getGame(game.id);
      expect(g.result).toBe('forfeit');
      expect(g.winner).toBe('p2');
      done();
    }, 200);
  });

  it('reconnect cancels forfeit', (done) => {
    const p1 = { id: 'p1', username: 'a', socket: makeSocket() };
    const p2 = { id: 'p2', username: 'b', socket: makeSocket() };

    const game = svc.createGame(p1, p2, false);

    svc.handleDisconnect('p1');

    setTimeout(() => {
      // simulate reconnect before timeout
      const newSocket = makeSocket();
      const ok = svc.handleReconnect('p1', newSocket);
      expect(ok).toBe(true);
    }, 50);

    setTimeout(() => {
      const g = svc.getGame(game.id);
      expect(g.result).toBe('ongoing');
      expect(g.winner).toBeNull();
      done();
    }, 200);
  });
});
