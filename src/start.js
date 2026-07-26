const fs = require('fs');
const path = require('path');

async function main() {
  console.log('✅ Firebase جاهزة');
  
  // شغّل الداشبورد
  require('./server').startDashboard();
  
  // شغّل البوت
  require('./bot');
}

main().catch((err) => {
  console.error('❌ فشل بدء التشغيل:', err);
  process.exit(1);
});
