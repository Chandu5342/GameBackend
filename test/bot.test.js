import { describe, it, expect } from '@jest/globals';
import { ConnectFour } from '../game/index.js';
import { chooseMove } from '../game/bot.js';

describe('Bot logic', () => {
  it('chooses winning move if available', () => {
    const g = new ConnectFour();
    g.dropDisc(0, 2);
    g.dropDisc(1, 2);
    g.dropDisc(2, 2);
    const col = chooseMove(g, 2, 1);
    expect(col).toBe(3);
  });

  it('blocks opponent win', () => {
    const g = new ConnectFour();
    g.dropDisc(0, 1);
    g.dropDisc(1, 1);
    g.dropDisc(2, 1);
    const col = chooseMove(g, 2, 1);
    expect(col).toBe(3);
  });

  it('prefers center on empty board', () => {
    const g = new ConnectFour();
    const col = chooseMove(g, 2, 1);
    expect(col).toBe(3);
  });
});
