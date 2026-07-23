// استيراد الفروع والعربيات من ملف "قاعدة_بيانات_الأصول_بالأكواد_الموحدة.xlsx"
// شغّله مرة واحدة بعد init-db: node src/importFromExcel.js path/to/file.xlsx
const XLSX = require('xlsx');
const db = require('./db');

const filePath = process.argv[2];
if (!filePath) {
  console.error('استخدام: node src/importFromExcel.js path/to/file.xlsx');
  process.exit(1);
}

async function main() {
  const wb = XLSX.readFile(filePath);

  // ---- 1) استيراد جدول الفروع من شيت "مفتاح أكواد الفروع" ----
  const legendSheet = wb.Sheets['مفتاح أكواد الفروع'];
  const legendRows = XLSX.utils.sheet_to_json(legendSheet, { defval: null });

  let branchCount = 0;
  for (const row of legendRows) {
    const code = row['الكود المقترح'];
    const name = row['الفرع / المجموعة'];
    const count = row['عدد المعدات'] || 0;
    if (!code) continue;
    await db.run(`
      INSERT INTO branches (branch_code, branch_name) VALUES (?, ?)
      ON CONFLICT(branch_code) DO UPDATE SET branch_name = excluded.branch_name
    `, [code, name]);
    await db.run(`
      INSERT INTO branch_counters (branch_code, last_number) VALUES (?, ?)
      ON CONFLICT(branch_code) DO UPDATE SET last_number = excluded.last_number
    `, [code, count]);
    branchCount++;
  }
  console.log(`✅ اتسجل ${branchCount} فرع/مجموعة`);

  // ---- 2) استيراد الأصول من شيت "الأصول الموحدة" ----
  const assetsSheet = wb.Sheets['الأصول الموحدة'];
  const assetRows = XLSX.utils.sheet_to_json(assetsSheet, { defval: null });

  let count = 0;
  for (const row of assetRows) {
    const code = row['الكود الموحد (جديد)'];
    if (!code) continue;
    await db.run(`
      INSERT INTO assets (
        current_code, full_name, brand, model_code, manufacture_year,
        plate_number, chassis_number, engine_number, driver_name,
        current_branch, beneficiary, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')
      ON CONFLICT(current_code) DO NOTHING
    `, [
      code,
      row['اسم المعده بالكامل'],
      row['الماركه'],
      String(row['كود الموديل'] ?? ''),
      row['سنة الصنع'] ? Number(row['سنة الصنع']) : null,
      row['رقم اللوحه'] ? String(row['رقم اللوحه']) : null,
      row['رقم الشاسيه'] ? String(row['رقم الشاسيه']) : null,
      row['رقم المحرك'] ? String(row['رقم المحرك']) : null,
      row['اسم السائق'],
      code.split('-')[0],
      row['المستفاد'],
    ]);
    count++;
  }
  console.log(`✅ اتسجل ${count} أصل (عربية/معدة)`);
}

main().catch((err) => {
  console.error('❌ فشل الاستيراد:', err);
  process.exit(1);
});
