const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../firebase-data.json');

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      branches: {},
      assets: {},
      approvers: {},
      transferRequests: {},
      approvalLogs: {}
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function get(path) {
  try {
    const db = readDB();
    const keys = path.split('/').filter(k => k);
    let result = db;
    for (const key of keys) {
      result = result[key];
      if (!result) return null;
    }
    return result;
  } catch (err) {
    console.error('❌ خطأ:', err.message);
    return null;
  }
}

async function all(path) {
  try {
    const data = await get(path);
    return data ? Object.values(data) : [];
  } catch (err) {
    console.error('❌ خطأ:', err.message);
    return [];
  }
}

async function set(path, value) {
  try {
    const db = readDB();
    const keys = path.split('/').filter(k => k);
    let obj = db;
    for (let i = 0; i < keys.length - 1; i++) {
      obj[keys[i]] = obj[keys[i]] || {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    writeDB(db);
    return { success: true };
  } catch (err) {
    console.error('❌ خطأ:', err.message);
    return { success: false };
  }
}

module.exports = { get, all, set };
