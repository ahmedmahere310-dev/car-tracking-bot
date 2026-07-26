const XLSX = require('xlsx');
const db = require('./db');

const filePath = process.argv[2];

async function main() {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  
  const BRANCH_MAP = {
    'الاسكندرية': 'ALX',
    'القاهرة': 'C',
    'شمال الصعيد': 'NS',
    'جنوب الصعيد': 'SS',
    'الدلتا': 'DLT',
    'التنفيذ المركزي': 'TNF',
    'عمليات المركز الرئيسي': 'OPR',
    'ادارات المركز الرئيسي': 'ADM',
    'الورش الانتاجية': 'WRK',
    'معدات مواقع': 'MWQ',
    'محزن شبرا': 'SHB',
    'غمرة': 'GMR',
    'بهتيم': 'BHT',
  };
  
  console.log('📍 استيراج المعدات الثقيلة من Sheet1\n');
  
  let count = 0;
  for (const row of rows) {
    if (!row || row.length < 11) continue;
    if (typeof row[0] !== 'number') continue;
    
    const code = row[10];
    const name = row[1];
    const brand = row[2];
    const plate = row[4];
    const chassis = row[5];
    const engine = row[6];
    const branch_name = row[9];
    const branchCode = BRANCH_MAP[branch_name] || 'HQ';
    
    if (!code || !name) continue;
    
    await db.run(
      `INSERT INTO assets (current_code, full_name, brand, plate_number, chassis_number, engine_number, current_branch, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'available')
       ON CONFLICT(current_code) DO NOTHING`,
      [code, name, brand, plate, chassis, engine, branchCode]
    );
    
    count++;
  }
  
  console.log(`✅ اتسجل ${count} معدة ثقيلة`);
}

main().catch(err => console.error('❌ خطأ:', err.message));
