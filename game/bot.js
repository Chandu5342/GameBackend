// Simple rule-based bot: win in 1 -> block in 1 -> prefer center
export function chooseMove(engine, botPlayer = 2, humanPlayer = 1) {
  // 1) Win in 1
  const win = engine.findWinningMove(botPlayer);
  if (win !== null) return win;

  // 2) Block human win in 1
  const block = engine.findWinningMove(humanPlayer);
  if (block !== null) return block;

  // 3) Prefer center, then near center
  const order = [3, 2, 4, 1, 5, 0, 6];
  for (const c of order) if (engine.isValidMove(c)) return c;

  return null;
}

export default { chooseMove };
