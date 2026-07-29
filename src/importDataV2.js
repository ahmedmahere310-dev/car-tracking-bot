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
  console.log('🔄 استيراج البيانات الجديدة...\n');

  const wb = XLSX.readFile(filePath);
  const branches = {};
  const assets = {};
  let totalAssets = 0;

  // **1. استيراج الفروع والأصول**
  console.log('📍 استيراج الفروع والأصول...');
  
  for (const [sheetName, branchCode] of Object.entries(BRANCH_MAPPING)) {
    if (!wb.SheetNames.includes(sheetName)) continue;

    // هيكل الفرع
    branches[branchCode] = {
      code: branchCode,
      name: sheetName,
      totalAssets: 0,
      totalOutgoing: 0,
      totalIncoming: 0,
      lastUpdate: new Date().toISOString()
    };

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    let count = 0;
    for (const row of rows) {
      if (!row || row.length < 9) continue;

      const code = row[8];
      const name = row[1];
      const brand = row[2];
      const plate = row[4];
      const chassis = row[5];
      const engine = row[6];

      if (!code || !name) continue;

      assets[code] = {
        code: code,
        name: name,
        brand: brand,
        plate: plate,
        chassis: chassis,
        engine: engine,
        type: 'vehicle',
        branch: branchCode,
        status: 'available',
        transferCount: 0,
        lastTransfer: null,
        createdAt: new Date().toISOString()
      };

      count++;
      totalAssets++;
    }

    branches[branchCode].totalAssets = count;
    console.log(`  ${sheetName}: ${count} سيارة`);
  }

  // **2. استيراج المعدات من Sheet1**
  console.log('\n⚙️ استيراج المعدات الثقيلة...');
  
  if (wb.SheetNames.includes('Sheet1')) {
    const ws = wb.Sheets['Sheet1'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    let count = 0;
    for (const row of rows) {
      if (!row || row.length < 11 || typeof row[0] !== 'number') continue;

      const code = row[10];
      const name = row[1];
      const brand = row[2];
      const branch_name = row[9];
      const branchCode = BRANCH_MAPPING[branch_name] || 'HQ';

      if (!code || !name) continue;

      assets[code] = {
        code: code,
        name: name,
        brand: brand,
        type: 'equipment',
        branch: branchCode,
        status: 'available',
        transferCount: 0,
        lastTransfer: null,
        createdAt: new Date().toISOString()
      };

      if (branchCode !== 'HQ' && branches[branchCode]) {
        branches[branchCode].totalAssets += 1;
      }

      count++;
      totalAssets++;
    }

    console.log(`  المعدات الثقيلة: ${count} معدة`);
  }

  // **3. حفظ البيانات**
  console.log('\n💾 حفظ البيانات...');
  await fb.set('branches', branches);
  await fb.set('assets', assets);

  console.log(`\n✅ اكتمل الاستيراج!`);
  console.log(`   المجموع: ${totalAssets} أصل`);
  console.log(`   الفروع: ${Object.keys(branches).length}`);
  console.log(`   الموافقين: 4`);
}

main().catch(err => {
  console.error('❌ خطأ:', err.message);
  process.exit(1);
});
