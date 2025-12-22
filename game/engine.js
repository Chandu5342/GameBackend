/*
Connect Four engine
Board: 6 rows x 7 columns
Representation: rows array [0..5] top->bottom, each row is cols [0..6]
Values: 0 = empty, 1 = player1, 2 = player2
*/

export default class ConnectFour {
  constructor(rows = 6, cols = 7) {
    this.rows = rows;
    this.cols = cols;
    this.board = this.createBoard();
    this.lastMove = null; // { row, col, player }
  }

  createBoard() {
    return Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
  }

  clone() {
    const copy = new ConnectFour(this.rows, this.cols);
    copy.board = this.board.map((r) => r.slice());
    copy.lastMove = this.lastMove ? { ...this.lastMove } : null;
    return copy;
  }

  // returns {row, col} or null if column full/invalid
  dropDisc(col, player) {
    if (col < 0 || col >= this.cols) return null;
    for (let r = this.rows - 1; r >= 0; r--) {
      if (this.board[r][col] === 0) {
        this.board[r][col] = player;
        this.lastMove = { row: r, col, player };
        return { row: r, col };
      }
    }
    return null; // column full
  }

  isValidMove(col) {
    if (col < 0 || col >= this.cols) return false;
    return this.board[0][col] === 0;
  }

  getValidMoves() {
    const moves = [];
    for (let c = 0; c < this.cols; c++) if (this.isValidMove(c)) moves.push(c);
    return moves;
  }

  // Check for win from lastMove or from given (r,c)
  checkWinAt(row, col) {
    const player = this.board[row][col];
    if (player === 0) return false;

    const directions = [
      { dr: 0, dc: 1 }, // horizontal
      { dr: 1, dc: 0 }, // vertical
      { dr: 1, dc: 1 }, // diag down-right
      { dr: 1, dc: -1 } // diag down-left
    ];

    for (const { dr, dc } of directions) {
      let count = 1;
      // forward
      let r = row + dr;
      let c = col + dc;
      while (this.inBounds(r, c) && this.board[r][c] === player) {
        count++;
        r += dr;
        c += dc;
      }
      // backward
      r = row - dr;
      c = col - dc;
      while (this.inBounds(r, c) && this.board[r][c] === player) {
        count++;
        r -= dr;
        c -= dc;
      }
      if (count >= 4) return true;
    }

    return false;
  }

  checkLastMoveWin() {
    if (!this.lastMove) return false;
    return this.checkWinAt(this.lastMove.row, this.lastMove.col);
  }

  checkDraw() {
    // draw if top row has no zeros
    return this.board[0].every((v) => v !== 0);
  }

  inBounds(r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  // Utility to find a winning move for a player: returns column or null
  findWinningMove(player) {
    for (let c = 0; c < this.cols; c++) {
      if (!this.isValidMove(c)) continue;
      const sim = this.clone();
      const pos = sim.dropDisc(c, player);
      if (pos && sim.checkWinAt(pos.row, pos.col)) return c;
    }
    return null;
  }

  // Simple serialization
  toJSON() {
    return {
      rows: this.rows,
      cols: this.cols,
      board: this.board,
      lastMove: this.lastMove
    };
  }
}
