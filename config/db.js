import dns from 'dns';
import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';

// Prefer IPv4 when possible to avoid IPv6 routing/timeouts in some environments
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
    console.log('🔧 DNS result order set to prefer IPv4 (ipv4first)');
  } catch (e) {
    /* ignore if not supported */
  }
}

// Simple DB connection that prefers DATABASE_URL from .env
// If your DB password contains an `@`, either URL-encode it (preferred)
// or this small sanitizer will encode the password part for you.

dotenv.config();

const { DATABASE_URL, PGSSLMODE } = process.env;

function sanitizeDatabaseUrl(url) {
  if (!url) return url;
  try {
    const m = url.match(/^(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@.*)$/i);
    if (!m) return url;
    const [, prefix, password, suffix] = m;
    if (password.includes('@')) {
      return prefix + encodeURIComponent(password) + suffix;
    }
    return url;
  } catch (e) {
    return url;
  }
}

const dbUrl = sanitizeDatabaseUrl(DATABASE_URL);

const sequelize = dbUrl
  ? new Sequelize(dbUrl, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: PGSSLMODE ? { ssl: { require: true, rejectUnauthorized: false } } : undefined
    })
  : new Sequelize(process.env.DB_NAME || 'gametask', process.env.DB_USER || 'postgres', process.env.DB_PASSWORD || 'postgres', {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false
    });

export default sequelize;
