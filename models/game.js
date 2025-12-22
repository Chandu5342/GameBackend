import { v4 as uuidv4 } from 'uuid';

export default (sequelize, DataTypes) => {
  const Game = sequelize.define('Game', {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    players: {
      type: DataTypes.JSONB,
      allowNull: false,
      // [{id, username, slot: 1|2}]
    },
    winnerId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    result: {
      type: DataTypes.ENUM('ongoing', 'win', 'draw', 'forfeit'),
      defaultValue: 'ongoing'
    },
    moves: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    durationSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'games'
  });

  return Game;
};
