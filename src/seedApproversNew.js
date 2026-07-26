const db = require('./db');

const approvers = [
  { role: 'top_management', telegram_id: '5213443197', name: 'الإدارة العليا' },
  { role: 'sector_head', telegram_id: '6127885624', name: 'رئيس القطاع' },
  { role: 'branch_manager', telegram_id: '5811281915', name: 'مدير الفرع' },
  { role: 'warehouse_manager', telegram_id: '7255648515', name: 'مدير المخازن' },
];

async function main() {
  console.log('بدأ تسجيل الموافقين...\n');
  
  for (const approver of approvers) {
    await db.run(
      `INSERT INTO approvers (role, branch_code, full_name, telegram_id, is_active)
       VALUES (?, NULL, ?, ?, 1)`,
      [approver.role, approver.name, approver.telegram_id]
    );
    console.log(`✅ ${approver.name} (${approver.telegram_id})`);
  }
  
  console.log(`\n✅ اتسجل ${approvers.length} موافق`);
}

main().catch(err => console.error('❌ خطأ:', err.message));
