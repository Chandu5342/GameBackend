import { describe, it, expect } from '@jest/globals';
import { ConnectFour } from '../game/index.js';

describe('ConnectFour engine', () => {
  it('drops disc to lowest row', () => {
    const g = new ConnectFour();
    const pos = g.dropDisc(3, 1);
    expect(pos).not.toBeNull();
    expect(pos.row).toBe(5);
    expect(g.board[5][3]).toBe(1);
  });

  it('detects horizontal win', () => {
    const g = new ConnectFour();
    g.dropDisc(0, 1);
    g.dropDisc(1, 1);
    g.dropDisc(2, 1);
    g.dropDisc(3, 1);
    expect(g.checkLastMoveWin()).toBe(true);
  });

  it('detects vertical win', () => {
    const g = new ConnectFour();
    g.dropDisc(4, 2);
    g.dropDisc(4, 2);
    g.dropDisc(4, 2);
    g.dropDisc(4, 2);
    expect(g.checkLastMoveWin()).toBe(true);
  });

  it('detects diagonal wins', () => {
    // positive slope diagonal
    const g = new ConnectFour();
    // create diagonal for player 1
    g.dropDisc(0, 1); // r5c0
    g.dropDisc(1, 2);
    g.dropDisc(1, 1); // r4c1
    g.dropDisc(2, 2);
    g.dropDisc(2, 2);
    g.dropDisc(2, 1); // r3c2
    g.dropDisc(3, 2);
    g.dropDisc(3, 2);
    g.dropDisc(3, 2);
    g.dropDisc(3, 1); // r2c3
    expect(g.checkLastMoveWin()).toBe(true);
  });

  it('finds winning move for player', () => {
    const g = new ConnectFour();
    g.dropDisc(0, 1);
    g.dropDisc(1, 1);
    g.dropDisc(2, 1);
    const winCol = g.findWinningMove(1);
    expect(winCol).toBe(3);
  });

  it('reports draw when full', () => {
    const g = new ConnectFour(2, 2); // small board for test
    g.dropDisc(0, 1);
    g.dropDisc(0, 2);
    g.dropDisc(1, 1);
    g.dropDisc(1, 2);
    expect(g.checkDraw()).toBe(true);
  });
});
