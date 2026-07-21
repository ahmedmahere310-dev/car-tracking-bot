require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const workflow = require('./workflow');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ محتاج تحط TELEGRAM_BOT_TOKEN في ملف .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// حماية عامة: لو حصل أي خطأ غير متوقع في أي حتة، سجّله بس ومتوقفش البوت
bot.on('polling_error', (err) => console.error('⚠️ Polling error:', err.message));
process.on('unhandledRejection', (err) => console.error('⚠️ Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught exception:', err));

// حالة المحادثة المؤقتة لكل مستخدم وهو بيدخل بيانات طلب جديد (in-memory - يكفي للتجربة)
// في الإنتاج الأفضل ينقل لجدول DB لو هيبقى فيه أكتر من instance للبوت
const pendingRequests = new Map();

// دلوقتي شغالين بس على فرعين للتجربة - لازم تتطابق مع ACTIVE_BRANCHES في seedApprovers.js
const ACTIVE_BRANCHES = ['C', 'NS']; // C = القاهرة الكبرى, NS = شمال الصعيد // telegram_id -> { step, assetCode, toBranch, reason }

// ============ /start ============
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '👋 أهلاً بيك في نظام تتبع حركة السيارات والمعدات.\n\n' +
    'الأوامر المتاحة:\n' +
    '/newrequest — طلب نقل عربية أو معدة جديد\n' +
    '/status <رقم الطلب> — متابعة حالة أي طلب، مثال: /status 1');
});

// ============ /newrequest ============
bot.onText(/\/newrequest/, (msg) => {
  const chatId = msg.chat.id;
  pendingRequests.set(String(msg.from.id), { step: 'asset_code', chatId });
  bot.sendMessage(chatId, '🚗 ابعتلي كود العربية أو المعدة المطلوب نقلها (مثال: C-005)');
});

bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const userId = String(msg.from.id);
  const state = pendingRequests.get(userId);
  if (!state) return;

  const chatId = msg.chat.id;

  if (state.step === 'asset_code') {
    const asset = db.prepare(`SELECT * FROM assets WHERE current_code = ?`).get(msg.text.trim());
    if (!asset) {
      bot.sendMessage(chatId, '❌ الكود ده مش موجود في النظام. جرب تاني أو ابعت /newrequest تاني.');
      return;
    }
    if (asset.status !== 'available') {
      bot.sendMessage(chatId, `⚠️ العربية دي حالتها حاليًا "${asset.status}" ومش متاحة للنقل دلوقتي.`);
      pendingRequests.delete(userId);
      return;
    }
    if (!ACTIVE_BRANCHES.includes(asset.current_branch)) {
      bot.sendMessage(chatId, `⚠️ فرع العربية دي (${asset.current_branch}) لسه مش مفعّل في النظام حاليًا. الفروع الشغالة دلوقتي: ${ACTIVE_BRANCHES.join('، ')}.`);
      pendingRequests.delete(userId);
      return;
    }
    state.asset = asset;
    state.step = 'to_branch';
    bot.sendMessage(chatId, `تمام، ${asset.full_name} (${asset.current_code}).\nابعتلي كود الفرع المستقبِل (مثال: BHT):`);
    return;
  }

  if (state.step === 'to_branch') {
    const branch = db.prepare(`SELECT * FROM branches WHERE branch_code = ?`).get(msg.text.trim());
    if (!branch) {
      bot.sendMessage(chatId, '❌ كود الفرع ده مش معروف. جرب تاني.');
      return;
    }
    if (!ACTIVE_BRANCHES.includes(branch.branch_code)) {
      bot.sendMessage(chatId, `⚠️ الفرع ده لسه مش مفعّل في النظام. الفروع الشغالة دلوقتي: ${ACTIVE_BRANCHES.join('، ')}.`);
      return;
    }
    state.toBranch = branch.branch_code;
    state.step = 'reason';
    bot.sendMessage(chatId, 'اكتب سبب النقل باختصار:');
    return;
  }

  if (state.step === 'reason') {
    state.reason = msg.text.trim();
    const request = workflow.createTransferRequest({
      assetId: state.asset.asset_id,
      fromBranch: state.asset.current_branch,
      toBranch: state.toBranch,
      reason: state.reason,
      requestedByTelegramId: userId,
    });
    pendingRequests.delete(userId);
    bot.sendMessage(chatId, `✅ اتسجل الطلب رقم #${request.request_id}. هيتبعت دلوقتي للإدارة العليا للموافقة.`);
    notifyApprover(request);
    return;
  }
});

// ============ إشعار الموافق الحالي بأزرار موافقة/رفض ============
function notifyApprover(request) {
  const approver = workflow.getApproverForStage(request, request.current_stage);
  if (!approver) {
    console.error(`⚠️ مفيش موافق مسجّل لمرحلة ${request.current_stage} في الفرع ${request.from_branch}`);
    return;
  }
  const asset = db.prepare(`SELECT * FROM assets WHERE asset_id = ?`).get(request.asset_id);
  const stageLabel = workflow.STAGES[request.current_stage].label;

  const text =
    `📋 طلب نقل رقم #${request.request_id}\n` +
    `المعدة: ${asset.full_name} (${asset.current_code})\n` +
    `من: ${request.from_branch}  →  إلى: ${request.to_branch}\n` +
    `السبب: ${request.reason}\n\n` +
    `المرحلة: ${stageLabel} (${request.current_stage}/${workflow.TOTAL_STAGES})`;

  bot.sendMessage(approver.telegram_id, text, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ موافقة', callback_data: `approve:${request.request_id}` },
        { text: '❌ رفض', callback_data: `reject:${request.request_id}` },
      ]],
    },
  });
}

// ============ استقبال ضغطات الأزرار ============
bot.on('callback_query', async (query) => {
  try {
    const [action, requestIdStr] = query.data.split(':');
    const requestId = Number(requestIdStr);
    const approverTelegramId = String(query.from.id);
    const request = workflow.getRequestById(requestId);

    if (!request) {
      return bot.answerCallbackQuery(query.id, { text: 'الطلب غير موجود.' });
    }
    if (request.status !== 'pending') {
      return bot.answerCallbackQuery(query.id, { text: 'الطلب ده مقفول بالفعل.' });
    }

    // تحقق أمني: هل الشخص اللي ضغط هو فعلاً الموافق المسجّل لهذه المرحلة (أو البديل الاحتياطي)؟
    const expectedApprover = workflow.getApproverForStage(request, request.current_stage);
    const isAuthorized = expectedApprover && (
      expectedApprover.telegram_id === approverTelegramId ||
      expectedApprover.backup_telegram_id === approverTelegramId
    );
    if (!isAuthorized) {
      return bot.answerCallbackQuery(query.id, { text: '⛔ مش مسموحلك توافق على المرحلة دي.', show_alert: true });
    }

    if (action === 'reject') {
      // نطلب سبب الرفض قبل التنفيذ
      pendingRequests.set(approverTelegramId, {
        step: 'rejection_reason',
        chatId: query.message.chat.id,
        requestId,
      });
      await bot.answerCallbackQuery(query.id);
      return bot.sendMessage(query.message.chat.id, 'اكتب سبب الرفض:');
    }

    // action === 'approve'
    const outcome = workflow.recordDecision(requestId, { approverTelegramId, decision: 'approved' });
    await bot.answerCallbackQuery(query.id, { text: '✅ تم تسجيل الموافقة' });
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: query.message.chat.id, message_id: query.message.message_id,
    });

    if (outcome.result === 'advanced') {
      bot.sendMessage(query.message.chat.id, `تم. الطلب اتحول للمرحلة الجاية: ${workflow.STAGES[outcome.stage].label}`);
      notifyApprover(outcome.request);
    } else if (outcome.result === 'completed') {
      bot.sendMessage(query.message.chat.id,
        `🎉 اكتمل الطلب #${requestId}. الكود الجديد للعربية: ${outcome.newCode}\n` +
        `(هيتبعت QR رسمي لحارس البوابة - خطوة قادمة).`);
    }
  } catch (err) {
    // مهم جدًا: أي خطأ هنا (زي "query is too old" لما البوت يكون واخد فاصل)
    // يتسجل بس، ومش يوقف البوت كله.
    console.error('⚠️ خطأ أثناء معالجة ضغطة زرار:', err.message);
    try {
      await bot.answerCallbackQuery(query.id, { text: 'حصل خطأ، جرب تاني.' });
    } catch (_) { /* تجاهل لو حتى الرد على الزرار فشل */ }
  }
});

// استكمال سبب الرفض كرسالة نصية عادية
bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const userId = String(msg.from.id);
  const state = pendingRequests.get(userId);
  if (!state || state.step !== 'rejection_reason') return;

  const outcome = workflow.recordDecision(state.requestId, {
    approverTelegramId: userId, decision: 'rejected', reason: msg.text.trim(),
  });
  pendingRequests.delete(userId);
  bot.sendMessage(state.chatId, `🚫 اتسجل الرفض. الطلب #${state.requestId} اتقفل وهيتبعت السبب لصاحب الطلب.`);

  // إشعار صاحب الطلب الأصلي
  bot.sendMessage(outcome.request.requested_by_telegram_id,
    `❌ طلبك رقم #${outcome.request.request_id} اتُرفض.\nالسبب: ${outcome.request.rejection_reason}`);
});

// ============ /status ============
bot.onText(/\/status (.+)/, (msg, match) => {
  const requestId = Number(match[1]);
  const request = workflow.getRequestById(requestId);
  if (!request) return bot.sendMessage(msg.chat.id, 'الطلب مش موجود.');

  const log = db.prepare(`SELECT * FROM approval_log WHERE request_id = ? ORDER BY decided_at`).all(requestId);
  let text = `📋 طلب #${requestId} - الحالة: ${request.status}\n`;
  text += `المرحلة الحالية: ${request.status === 'pending' ? workflow.STAGES[request.current_stage].label : '-'}\n\n`;
  text += log.map(l => `${workflow.STAGES[l.stage].label}: ${l.decision === 'approved' ? '✅ وافق' : '❌ رفض'} (${l.decided_at})`).join('\n');
  bot.sendMessage(msg.chat.id, text || 'لسه مفيش قرارات مسجّلة.');
});

console.log('🤖 البوت شغال...');
