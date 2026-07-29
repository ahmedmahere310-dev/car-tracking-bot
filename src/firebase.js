const https = require('https');

// الرابط الصحيح بدون /~2F في الآخر
const DB_URL = 'https://athletelifeos-default-rtdb.firebaseio.com';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    // تأكد من / في البداية
    const fullPath = path.startsWith('/') ? path : '/' + path;
    const url = `${DB_URL}${fullPath}.json`;
    
    console.log(`📡 ${method} ${url}`);

    const options = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : null);
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`❌ خطأ اتصال: ${err.message}`);
      reject(err);
    });

    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function get(path) {
  try {
    return await makeRequest('GET', path);
  } catch (err) {
    console.error('❌ خطأ Firebase:', err.message);
    return null;
  }
}

async function all(path) {
  try {
    const data = await makeRequest('GET', path);
    return data ? Object.values(data) : [];
  } catch (err) {
    console.error('❌ خطأ Firebase:', err.message);
    return [];
  }
}

async function set(path, value) {
  try {
    await makeRequest('PUT', path, value);
    return { success: true };
  } catch (err) {
    console.error('❌ خطأ Firebase:', err.message);
    return { success: false };
  }
}

async function push(path, value) {
  try {
    const result = await makeRequest('POST', path, value);
    return { id: result.name, success: true };
  } catch (err) {
    console.error('❌ خطأ Firebase:', err.message);
    return { success: false };
  }
}

module.exports = { get, all, set, push };
