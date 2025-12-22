import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';

dotenv.config();

const {
  DB_HOST = 'localhost',
  DB_PORT = 5432,
  DB_NAME = 'gametask',
  DB_USER = 'postgres',
  DB_PASSWORD = 'postgres',
  DATABASE_URL
} = process.env;

const commonOptions = {
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

// If a full connection URL is provided (e.g. Supabase), prefer it and enable SSL options
const sequelize = DATABASE_URL
  ? new Sequelize(DATABASE_URL, {
      ...commonOptions,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    })
  : new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
      host: DB_HOST,
      port: DB_PORT,
      ...commonOptions
    });

export default sequelize;
