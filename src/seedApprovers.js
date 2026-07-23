// بيسجّل موافقين تجريبيين لكل الأدوار، وكلهم بيروحوا على نفس حساب التليجرام
const db = require('./db');

const TEST_TELEGRAM_ID = '5213443197'; // M7md 7amdi

const randomNames = [
  'محمود عبد الرازق', 'سارة فتحي', 'كريم شحاته', 'نور الهدى سيد',
  'حسام الدين طه', 'ياسمين جلال', 'عبد الرحمن نبيل', 'مريم عصام',
  'إسلام فوزي', 'هبة الله عادل', 'وائل منصور', 'دينا أشرف',
  'عمرو صلاح', 'رحاب مجدي', 'طارق حمدي',
];
let nameIndex = 0;
function nextName() {
  const name = randomNames[nameIndex % randomNames.length];
  nameIndex++;
  return name;
}

// دلوقتي شغالين بس على فرعين للتجربة (غيّر القائمة دي وقت ما تحب تضيف فروع تانية)
const ACTIVE_BRANCHES = ['C', 'NS']; // C = القاهرة الكبرى, NS = شمال الصعيد

async function main() {
  await db.run(`DELETE FROM approvers`);

  await db.run(`INSERT INTO approvers (role, branch_code, full_name, telegram_id, backup_telegram_id) VALUES (?, ?, ?, ?, ?)`,
    ['top_management', null, nextName(), TEST_TELEGRAM_ID, null]);
  await db.run(`INSERT INTO approvers (role, branch_code, full_name, telegram_id, backup_telegram_id) VALUES (?, ?, ?, ?, ?)`,
    ['sector_head', null, nextName(), TEST_TELEGRAM_ID, null]);

  for (const branch_code of ACTIVE_BRANCHES) {
    await db.run(`INSERT INTO approvers (role, branch_code, full_name, telegram_id, backup_telegram_id) VALUES (?, ?, ?, ?, ?)`,
      ['branch_manager', branch_code, nextName(), TEST_TELEGRAM_ID, null]);
    await db.run(`INSERT INTO approvers (role, branch_code, full_name, telegram_id, backup_telegram_id) VALUES (?, ?, ?, ?, ?)`,
      ['warehouse_manager', branch_code, nextName(), TEST_TELEGRAM_ID, null]);
  }

  const total = (await db.get(`SELECT COUNT(*) AS c FROM approvers`)).c;
  console.log(`✅ اتسجل ${total} موافق تجريبي، كلهم بيوصلولك على حسابك (${TEST_TELEGRAM_ID}) عشان التجربة.`);
  console.log('⚠️ لما تخلص تجربة، شيل السطر اللي بيمسح الموافقين القدامى وحط الأسامي والـ Telegram ID الحقيقية.');
}

main().catch((err) => {
  console.error('❌ فشل التسجيل:', err);
  process.exit(1);
});
