import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';
import dns from 'dns';

// Prefer IPv4 when possible (Node 17+)
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const {
  DB_HOST = 'localhost',
  DB_PORT = 5432,
  DB_NAME = 'gametask',
  DB_USER = 'postgres',
  DB_PASSWORD = 'postgres',
  DATABASE_URL,
  PGSSLMODE
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

function sanitizeDatabaseUrl(url) {
  if (!url) return url;
  try {
    if (!/^postgres(?:ql)?:\/\//i.test(url)) return url;
    const schemeEnd = url.indexOf('//');
    const credStart = schemeEnd + 2;
    const lastAt = url.lastIndexOf('@');
    const colonIdx = url.indexOf(':', credStart);
    if (schemeEnd === -1 || colonIdx === -1 || lastAt === -1 || lastAt < colonIdx) return url;

    const password = url.substring(colonIdx + 1, lastAt);
    if (password.includes('@') || /[^\w\-._~]/.test(password)) {
      const encoded = encodeURIComponent(password);
      const newUrl = url.substring(0, colonIdx + 1) + encoded + url.substring(lastAt);
      return newUrl;
    }
    return url;
  } catch (e) {
    return url;
  }
}

const effectiveDatabaseUrl = sanitizeDatabaseUrl(DATABASE_URL);
if (effectiveDatabaseUrl !== DATABASE_URL && DATABASE_URL) {
  console.warn('Sanitized DATABASE_URL: encoded special characters in password (not logged).');
}

const sequelize = effectiveDatabaseUrl
  ? new Sequelize(effectiveDatabaseUrl, {
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

// Try to authenticate early to give faster, actionable errors in logs
(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established.');
  } catch (err) {
    if (err && err.parent && err.parent.code === 'ENETUNREACH') {
      console.error('⛔ Network unreachable while connecting to DB. This often means the DB host is only reachable via IPv6, but the runtime cannot route IPv6. Consider using an IPv4 host, enabling IPv4-first DNS resolution, or contacting your provider.');
    }
    if (err && err.message && err.message.includes('no pg_hba.conf')) {
      console.error('⛔ Authentication failed; check DB credentials and DB user permissions.');
    }
    console.error(err);
  }
})();

export default sequelize;
