const path = require('path');
const { DatabaseSync } = require('node:sqlite');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'db', 'data.sqlite');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

module.exports = db;
