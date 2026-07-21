// نقطة تشغيل واحدة للاستضافة (Railway/أي منصة):
// بيتأكد إن الجداول موجودة (CREATE TABLE IF NOT EXISTS - آمن يتكرر) وبعدين يشغّل البوت.
// ملاحظة: ده مش بيستورد بيانات ولا بيعمل seed للموافقين - دي خطوات تشتغل مرة واحدة يدويًا.
const fs = require('fs');
const path = require('path');
const db = require('./db');

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf8'));
console.log('✅ الجداول جاهزة');

require('./bot');
