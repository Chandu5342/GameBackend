import db from '../models/index.js';

export async function getGames(req, res) {
  try {
    const games = await db.Game.findAll({ where: { result: ['win', 'draw', 'forfeit'] }, order: [['endedAt', 'DESC']], limit: 50 });
    res.json(games);
  } catch (err) {
    console.error('GET /games error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function getGameById(req, res) {
  try {
    const game = await db.Game.findByPk(req.params.id);
    if (!game) return res.status(404).json({ error: 'Not Found' });
    res.json(game);
  } catch (err) {
    console.error('GET /games/:id error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
