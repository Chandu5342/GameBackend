import { describe, it, expect, beforeEach } from '@jest/globals';
import Matchmaker from '../matchmaking/matchmaker.js';

describe('Matchmaker', () => {
  let mm;
  beforeEach(() => {
    mm = new Matchmaker(200);
  });

  it('pairs two waiting players immediately', (done) => {
    const p1 = { id: 'p1', username: 'a' };
    const p2 = { id: 'p2', username: 'b' };

    mm.on('match', (a, b) => {
      expect(a.id).toBe('p1');
      expect(b.id).toBe('p2');
      done();
    });

    mm.join(p1);
    mm.join(p2);
  });

  it('emits timeout if no match within wait', (done) => {
    const p = { id: 'solo', username: 'solo' };
    mm.on('timeout', (player) => {
      expect(player.id).toBe('solo');
      done();
    });
    mm.join(p);
  });
});
