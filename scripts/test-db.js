import sequelize from '../config/db.js';

async function test() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection OK');
    process.exit(0);
  } catch (err) {
    console.error('❌ Database connection failed');
    console.error(err);
    process.exit(1);
  }
}

test();
