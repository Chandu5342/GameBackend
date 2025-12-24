import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Set it in the environment and try again.');
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('DB connected successfully');
  } catch (e) {
    console.error('DB connection failed:');
    console.error(e);
  } finally {
    await client.end();
  }
})();