import express from 'express';
import users from './users.js';
import games from './games.js';
import leaderboard from './leaderboard.js';
import health from './health.js';

const router = express.Router();
router.use('/users', users);
router.use('/games', games);
router.use('/leaderboard', leaderboard);
router.use('/health', health);

export default router;
