import dns from 'dns/promises';

const deriveHost = () => {
  if (process.argv[2]) return process.argv[2];
  if (process.env.DATABASE_URL) {
    try {
      const { hostname } = new URL(process.env.DATABASE_URL);
      return hostname;
    } catch (e) {
      return null;
    }
  }
  return null;
};

const host = deriveHost() || 'db.pwdcldxgciurmfhztdve.supabase.co';

(async () => {
  console.log('Checking DNS for:', host);
  try {
    const a = await dns.resolve4(host);
    console.log('A records:', a);
  } catch (e) {
    console.log('A lookup error:', e.message || e);
  }

  try {
    const a6 = await dns.resolve6(host);
    console.log('AAAA records:', a6);
  } catch (e) {
    console.log('AAAA lookup error:', e.message || e);
  }
})();