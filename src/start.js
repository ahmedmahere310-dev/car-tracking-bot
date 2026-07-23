const fs = require('fs');
const path = require('path');
const db = require('./db');
const { startDashboard } = require('./server');

async function main() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  await db.exec(fs.readFileSync(schemaPath, 'utf8'));
  console.log('✅ الجداول جاهزة');

  startDashboard();
  require('./bot');
}

main().catch((err) => {
  console.error('❌ فشل بدء التشغيل:', err);
  process.exit(1);
});
