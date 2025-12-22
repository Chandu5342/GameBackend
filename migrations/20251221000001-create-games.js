"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('games', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
        primaryKey: true
      },
      players: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      winnerId: {
        type: Sequelize.UUID,
        allowNull: true
      },
      result: {
        type: Sequelize.ENUM('ongoing', 'win', 'draw', 'forfeit'),
        defaultValue: 'ongoing'
      },
      moves: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      startedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      endedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      durationSeconds: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('games');
    await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_games_result\";");
  }
};