import db from '../models/index.js';

export async function getLeaderboard(req, res) {
  try {
    const users = await db.User.findAll({ order: [['wins', 'DESC']], attributes: ['id', 'username', 'wins'] });
    res.json(users);
  } catch (err) {
    console.error('Leaderboard error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
