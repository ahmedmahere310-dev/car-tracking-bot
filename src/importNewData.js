const XLSX = require('xlsx');
const db = require('./db');

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
  const wb = XLSX.readFile(filePath);
  
  console.log('بدأ الاستيراج...\n');
  let branchCount = 0;
  let assetCount = 0;

  for (const [sheetName, branchCode] of Object.entries(BRANCH_MAPPING)) {
    await db.run(
      `INSERT INTO branches (branch_code, branch_name) VALUES (?, ?)
       ON CONFLICT(branch_code) DO UPDATE SET branch_name = excluded.branch_name`,
      [branchCode, sheetName]
    );
    branchCount++;
  }
  
  console.log(`✅ اتسجل ${branchCount} فرع\n`);

  for (const [sheetName, branchCode] of Object.entries(BRANCH_MAPPING)) {
    if (!wb.SheetNames.includes(sheetName)) continue;
    
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    console.log(`📍 الفرع: ${sheetName} (${branchCode})`);
    
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
      
      await db.run(
        `INSERT INTO assets (current_code, full_name, brand, plate_number, chassis_number, engine_number, current_branch, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'available')
         ON CONFLICT(current_code) DO NOTHING`,
        [code, name, brand, plate, chassis, engine, branchCode]
      );
      
      count++;
      assetCount++;
    }
    
    console.log(`  ✓ ${count} معدة`);
  }
  
  console.log(`\n✅ اتسجل ${assetCount} أصل (عربية/معدة)`);
}

main().catch(err => console.error('❌ خطأ:', err.message));
