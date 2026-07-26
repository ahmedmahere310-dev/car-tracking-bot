const XLSX = require('xlsx');
const fb = require('./firebase');

const filePath = process.argv[2];

const BRANCH_MAPPING = {
  'القاهرة': 'C',
  'شمال الصعيد': 'NS',
  'جنوب الصعيد': 'SS',
  'الدلتا': 'DLT',
  'الاسكندرية': 'ALX',
  'التنفيذ المركزي ': 'TNF',
  'عمليات المركز الرئيسي': 'OPR',
  'ادارات المركز الرئيسي': 'ADM',
  'الورش الانتاجية': 'WRK',
  'معدات مواقع': 'MWQ',
  'محزن شبرا ': 'SHB',
  'غمرة': 'GMR',
  'بهتيم': 'BHT',
};

async function main() {
  console.log('🔄 بدأ الاستيراج...\n');

  const wb = XLSX.readFile(filePath);
  let assetCount = 0;

  // استيراج الفروع
  console.log('📍 استيراج الفروع...');
  const branches = {};
  for (const [name, code] of Object.entries(BRANCH_MAPPING)) {
    branches[code] = { code, name };
  }
  await fb.set('branches', branches);
  console.log(`✅ ${Object.keys(branches).length} فرع\n`);

  // استيراج السيارات
  console.log('🚗 استيراج السيارات...');
  const assets = {};
  
  for (const [sheetName, branchCode] of Object.entries(BRANCH_MAPPING)) {
    if (!wb.SheetNames.includes(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    let count = 0;
    for (const row of rows) {
      if (!row || row.length < 9) continue;
      const code = row[8], name = row[1], brand = row[2];
      if (!code || !name) continue;

      assets[code] = { code, name, brand, branch: branchCode, type: 'vehicle', status: 'available' };
      count++;
      assetCount++;
    }
    console.log(`  ${sheetName}: ${count}`);
  }

  // استيراج المعدات
  console.log('\n⚙️ استيراج المعدات...');
  if (wb.SheetNames.includes('Sheet1')) {
    const ws = wb.Sheets['Sheet1'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    let count = 0;
    for (const row of rows) {
      if (!row || row.length < 11 || typeof row[0] !== 'number') continue;
      const code = row[10], name = row[1], brand = row[2], branch_name = row[9];
      if (!code || !name) continue;
      const branchCode = BRANCH_MAPPING[branch_name] || 'HQ';
      assets[code] = { code, name, brand, branch: branchCode, type: 'equipment', status: 'available' };
      count++;
      assetCount++;
    }
    console.log(`  المعدات: ${count}`);
  }

  await fb.set('assets', assets);

  // استيراج الموافقين
  console.log('\n👥 استيراج الموافقين...');
  const approvers = {
    'top_management': { role: 'top_management', name: 'الإدارة العليا', telegramId: '5213443197' },
    'sector_head': { role: 'sector_head', name: 'رئيس القطاع', telegramId: '6127885624' },
    'branch_manager': { role: 'branch_manager', name: 'مدير الفرع', telegramId: '5811281915' },
    'warehouse_manager': { role: 'warehouse_manager', name: 'مدير المخازن', telegramId: '7255648515' }
  };
  await fb.set('approvers', approvers);
  console.log(`✅ ${Object.keys(approvers).length} موافق\n`);

  // تهيئة الهياكل
  await fb.set('transferRequests', {});
  await fb.set('approvalLogs', {});

  console.log('🎉 اكتمل الاستيراج!');
  console.log(`   المجموع: ${assetCount} أصل`);
}

main().catch(err => {
  console.error('❌ خطأ:', err.message);
  process.exit(1);
});
