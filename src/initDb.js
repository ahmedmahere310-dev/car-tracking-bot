// بيقرأ db/schema.sql وينفذه على قاعدة البيانات المحددة في .env
const fs = require('fs');
const path = require('path');
const db = require('./db');

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

db.exec(schema)
  .then(() => {
    console.log('✅ تم إنشاء/تحديث الجداول بنجاح');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ فشل إنشاء الجداول:', err);
    process.exit(1);
  });
