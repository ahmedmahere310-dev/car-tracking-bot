const fs = require('fs');
const path = require('path');
const db = require('./db');
const { startDashboard } = require('./server');

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf8'));
console.log('✅ الجداول جاهزة');

startDashboard();
require('./bot');
