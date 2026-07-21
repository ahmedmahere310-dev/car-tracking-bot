// بيسجّل موافقين تجريبيين لكل الأدوار، وكلهم بيروحوا على نفس حساب التليجرام
// عشان تقدر تجرب السلسلة كاملة من غير ما تحتاج حسابات تانية.
// شغّله بعد init-db و import: node src/seedApprovers.js
const db = require('./db');

const TEST_TELEGRAM_ID = '7255648515'; // Ahmed Maher (@ahmedbero2009)

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

const insertApprover = db.prepare(`
  INSERT INTO approvers (role, branch_code, full_name, telegram_id, backup_telegram_id)
  VALUES (?, ?, ?, ?, ?)
`);

// نمسح أي موافقين تجريبيين قدامى قبل ما نضيف من جديد (اختياري)
db.prepare(`DELETE FROM approvers`).run();

// 1) الأدوار العامة (شاملة كل الفروع): الإدارة العليا + رئيس القطاع
insertApprover.run('top_management', null, nextName(), TEST_TELEGRAM_ID, null);
insertApprover.run('sector_head', null, nextName(), TEST_TELEGRAM_ID, null);

// 2) الأدوار المرتبطة بالفرع: مدير فرع + مدير مخازن
// دلوقتي شغالين بس على فرعين للتجربة (غيّر القائمة دي وقت ما تحب تضيف فروع تانية)
const ACTIVE_BRANCHES = ['C', 'NS']; // C = القاهرة الكبرى, NS = شمال الصعيد
for (const branch_code of ACTIVE_BRANCHES) {
  insertApprover.run('branch_manager', branch_code, nextName(), TEST_TELEGRAM_ID, null);
  insertApprover.run('warehouse_manager', branch_code, nextName(), TEST_TELEGRAM_ID, null);
}

const total = db.prepare(`SELECT COUNT(*) AS c FROM approvers`).get().c;
console.log(`✅ اتسجل ${total} موافق تجريبي، كلهم بيوصلولك على حسابك (${TEST_TELEGRAM_ID}) عشان التجربة.`);
console.log('⚠️ لما تخلص تجربة، شيل السطر اللي بيمسح الموافقين القدامى وحط الأسامي والـ Telegram ID الحقيقية.');
