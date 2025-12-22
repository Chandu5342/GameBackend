import Sequelize from 'sequelize';
import sequelize from '../config/db.js';
import UserModel from './user.js';
import GameModel from './game.js';

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.User = UserModel(sequelize, Sequelize.DataTypes);
db.Game = GameModel(sequelize, Sequelize.DataTypes);

// Associations (if needed)
db.User.hasMany(db.Game, { as: 'playerGames', foreignKey: 'player1Id' });

export default db;
