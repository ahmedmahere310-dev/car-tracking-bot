// استيراد الفروع والعربيات من ملف "قاعدة_بيانات_الأصول_بالأكواد_الموحدة.xlsx"
// شغّله مرة واحدة بعد init-db: node src/importFromExcel.js path/to/file.xlsx
const path = require('path');
const XLSX = require('xlsx'); // npm install xlsx
const db = require('./db');

const filePath = process.argv[2];
if (!filePath) {
  console.error('استخدام: node src/importFromExcel.js path/to/file.xlsx');
  process.exit(1);
}

const wb = XLSX.readFile(filePath);

// ---- 1) استيراد جدول الفروع من شيت "مفتاح أكواد الفروع" ----
const legendSheet = wb.Sheets['مفتاح أكواد الفروع'];
const legendRows = XLSX.utils.sheet_to_json(legendSheet, { defval: null });

const insertBranch = db.prepare(`
  INSERT INTO branches (branch_code, branch_name) VALUES (?, ?)
  ON CONFLICT(branch_code) DO UPDATE SET branch_name = excluded.branch_name
`);
const insertCounter = db.prepare(`
  INSERT INTO branch_counters (branch_code, last_number) VALUES (?, ?)
  ON CONFLICT(branch_code) DO UPDATE SET last_number = excluded.last_number
`);

for (const row of legendRows) {
  const code = row['الكود المقترح'];
  const name = row['الفرع / المجموعة'];
  const count = row['عدد المعدات'] || 0;
  if (!code) continue;
  insertBranch.run(code, name);
  insertCounter.run(code, count); // العداد يبدأ من آخر رقم مستخدم فعليًا
}
console.log(`✅ اتسجل ${legendRows.length} فرع/مجموعة`);

// ---- 2) استيراد الأصول من شيت "الأصول الموحدة" ----
const assetsSheet = wb.Sheets['الأصول الموحدة'];
const assetRows = XLSX.utils.sheet_to_json(assetsSheet, { defval: null });

const insertAsset = db.prepare(`
  INSERT INTO assets (
    current_code, full_name, brand, model_code, manufacture_year,
    plate_number, chassis_number, engine_number, driver_name,
    current_branch, beneficiary, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')
  ON CONFLICT(current_code) DO NOTHING
`);

let count = 0;
for (const row of assetRows) {
  const code = row['الكود الموحد (جديد)'];
  if (!code) continue;
  insertAsset.run(
    code,
    row['اسم المعده بالكامل'],
    row['الماركه'],
    String(row['كود الموديل'] ?? ''),
    row['سنة الصنع'] ? Number(row['سنة الصنع']) : null,
    row['رقم اللوحه'] ? String(row['رقم اللوحه']) : null,
    row['رقم الشاسيه'] ? String(row['رقم الشاسيه']) : null,
    row['رقم المحرك'] ? String(row['رقم المحرك']) : null,
    row['اسم السائق'],
    code.split('-')[0], // الفرع الحالي = بادئة الكود
    row['المستفاد'],
  );
  count++;
}
console.log(`✅ اتسجل ${count} أصل (عربية/معدة)`);
