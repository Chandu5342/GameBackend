import express from 'express';
import { getGames, getGameById } from '../controllers/gamesController.js';
const router = express.Router();
router.get('/', getGames);
router.get('/:id', getGameById);
export default router;
