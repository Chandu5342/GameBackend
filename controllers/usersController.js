import db from '../models/index.js';

export async function createUser(req, res) {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const [user] = await db.User.findOrCreate({ where: { username }, defaults: { username } });
    res.json({ id: user.id, username: user.username, wins: user.wins });
  } catch (err) {
    console.error('POST /users error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
