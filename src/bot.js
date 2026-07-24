require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const XLSX = require('xlsx');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('./db');
const workflow = require('./workflow');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ محتاج تحط TELEGRAM_BOT_TOKEN في ملف .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (err) => console.error('⚠️ Polling error:', err.message));
process.on('unhandledRejection', (err) => console.error('⚠️ Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught exception:', err));

const pendingRequests = new Map();

// دلوقتي شغالين بس على فرعين للتجربة - لازم تتطابق مع ACTIVE_BRANCHES في seedApprovers.js
const ACTIVE_BRANCHES = ['C', 'NS']; // C = القاهرة الكبرى, NS = شمال الصعيد

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '👋 أهلاً بيك في نظام تتبع حركة السيارات والمعدات.\n\n' +
    'الأوامر المتاحة:\n' +
    '/newrequest — طلب نقل عربية أو معدة جديد\n' +
    '/status <رقم الطلب> — متابعة حالة أي طلب، مثال: /status 1\n' +
    '/export — تحميل ملف إكسل فيه كل بيانات المعدات المحدّثة دلوقتي');
});

/** بيتأكد إن اللي بعت الأمر مسجّل كموافِق بدور top_management (الإدارة العليا) */
async function isAdmin(telegramId) {
  const row = await db.get(`
    SELECT 1 FROM approvers
    WHERE role = 'top_management' AND is_active = 1
      AND (telegram_id = ? OR backup_telegram_id = ?)
    LIMIT 1
  `, [telegramId, telegramId]);
  return !!row;
}

bot.onText(/\/export/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  try {
    if (!(await isAdmin(userId))) {
      bot.sendMessage(chatId, '⛔ الأمر ده متاح بس للإدارة العليا.');
      return;
    }

    const rows = await db.all(`
      SELECT current_code AS "الكود الحالي", full_name AS "اسم المعدة", brand AS "الماركة",
             plate_number AS "رقم اللوحة", chassis_number AS "رقم الشاسيه", engine_number AS "رقم المحرك",
             driver_name AS "اسم السائق", current_branch AS "الفرع الحالي", status AS "الحالة",
             updated_at AS "آخر تحديث"
      FROM assets ORDER BY current_branch, current_code
    `);

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الأصول الحالية');

    const filePath = path.join(os.tmpdir(), `تصدير_الأصول_${Date.now()}.xlsx`);
    XLSX.writeFile(wb, filePath);

    await bot.sendDocument(chatId, filePath, {}, { filename: 'تصدير_الأصول_المحدّثة.xlsx' });
    fs.unlink(filePath, () => {});
  } catch (err) {
    console.error('⚠️ خطأ أثناء التصدير:', err.message);
    bot.sendMessage(chatId, '❌ حصل خطأ أثناء تجهيز أو إرسال ملف التصدير.');
  }
});

bot.onText(/\/newrequest/, (msg) => {
  const chatId = msg.chat.id;
  pendingRequests.set(String(msg.from.id), { step: 'asset_code', chatId });
  bot.sendMessage(chatId, '🚗 ابعتلي كود العربية أو المعدة المطلوب نقلها (مثال: C-005)');
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const userId = String(msg.from.id);
  const state = pendingRequests.get(userId);
  if (!state) return;

  const chatId = msg.chat.id;

  try {
    if (state.step === 'asset_code') {
      const asset = await db.get(`SELECT * FROM assets WHERE current_code = ?`, [msg.text.trim()]);
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
      const branch = await db.get(`SELECT * FROM branches WHERE branch_code = ?`, [msg.text.trim()]);
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
      const request = await workflow.createTransferRequest({
        assetId: state.asset.asset_id,
        fromBranch: state.asset.current_branch,
        toBranch: state.toBranch,
        reason: state.reason,
        requestedByTelegramId: userId,
      });
      pendingRequests.delete(userId);
      bot.sendMessage(chatId, `✅ اتسجل الطلب رقم #${request.request_id}. هيتبعت دلوقتي للإدارة العليا للموافقة.`);
      await notifyApprover(request);
      return;
    }

    if (state.step === 'rejection_reason') {
      const outcome = await workflow.recordDecision(state.requestId, {
        approverTelegramId: userId, decision: 'rejected', reason: msg.text.trim(),
      });
      pendingRequests.delete(userId);
      bot.sendMessage(state.chatId, `🚫 اتسجل الرفض. الطلب #${state.requestId} اتقفل وهيتبعت السبب لصاحب الطلب.`);
      bot.sendMessage(outcome.request.requested_by_telegram_id,
        `❌ طلبك رقم #${outcome.request.request_id} اتُرفض.\nالسبب: ${outcome.request.rejection_reason}`);
      return;
    }
  } catch (err) {
    console.error('⚠️ خطأ أثناء معالجة رسالة:', err.message);
    bot.sendMessage(chatId, '❌ حصل خطأ غير متوقع، جرب تاني.');
  }
});

async function notifyApprover(request) {
  const approver = await workflow.getApproverForStage(request, request.current_stage);
  if (!approver) {
    console.error(`⚠️ مفيش موافق مسجّل لمرحلة ${request.current_stage} في الفرع ${request.from_branch}`);
    return;
  }
  const asset = await db.get(`SELECT * FROM assets WHERE asset_id = ?`, [request.asset_id]);
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

bot.on('callback_query', async (query) => {
  try {
    const [action, requestIdStr] = query.data.split(':');
    const requestId = Number(requestIdStr);
    const approverTelegramId = String(query.from.id);
    const request = await workflow.getRequestById(requestId);

    if (!request) {
      return bot.answerCallbackQuery(query.id, { text: 'الطلب غير موجود.' });
    }
    if (request.status !== 'pending') {
      return bot.answerCallbackQuery(query.id, { text: 'الطلب ده مقفول بالفعل.' });
    }

    const expectedApprover = await workflow.getApproverForStage(request, request.current_stage);
    const isAuthorized = expectedApprover && (
      expectedApprover.telegram_id === approverTelegramId ||
      expectedApprover.backup_telegram_id === approverTelegramId
    );
    if (!isAuthorized) {
      return bot.answerCallbackQuery(query.id, { text: '⛔ مش مسموحلك توافق على المرحلة دي.', show_alert: true });
    }

    if (action === 'reject') {
      pendingRequests.set(approverTelegramId, {
        step: 'rejection_reason',
        chatId: query.message.chat.id,
        requestId,
      });
      await bot.answerCallbackQuery(query.id);
      return bot.sendMessage(query.message.chat.id, 'اكتب سبب الرفض:');
    }

    const outcome = await workflow.recordDecision(requestId, { approverTelegramId, decision: 'approved' });
    await bot.answerCallbackQuery(query.id, { text: '✅ تم تسجيل الموافقة' });
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: query.message.chat.id, message_id: query.message.message_id,
    });

    if (outcome.result === 'advanced') {
      bot.sendMessage(query.message.chat.id, `تم. الطلب اتحول للمرحلة الجاية: ${workflow.STAGES[outcome.stage].label}`);
      await notifyApprover(outcome.request);
    } else if (outcome.result === 'completed') {
      bot.sendMessage(query.message.chat.id,
        `🎉 اكتمل الطلب #${requestId}. الكود الجديد للعربية: ${outcome.newCode}\n` +
        `(هيتبعت QR رسمي لحارس البوابة - خطوة قادمة).`);

      if (outcome.request.requested_by_telegram_id !== approverTelegramId) {
        bot.sendMessage(outcome.request.requested_by_telegram_id,
          `✅ طلبك رقم #${requestId} اتوافق عليه بالكامل!\n` +
          `الكود الجديد للعربية بقى: ${outcome.newCode}`);
      }
    }
  } catch (err) {
    console.error('⚠️ خطأ أثناء معالجة ضغطة زرار:', err.message);
    try {
      await bot.answerCallbackQuery(query.id, { text: 'حصل خطأ، جرب تاني.' });
    } catch (_) { /* تجاهل */ }
  }
});

bot.onText(/\/status(.*)/, async (msg, match) => {
  try {
    const digits = match[1].replace(/\D/g, '');
    if (!digits) {
      return bot.sendMessage(msg.chat.id, 'اكتب رقم الطلب بعد الأمر، مثال: /status 4');
    }
    const requestId = Number(digits);
    const request = await workflow.getRequestById(requestId);
    if (!request) return bot.sendMessage(msg.chat.id, 'الطلب مش موجود.');

    const log = await db.all(`SELECT * FROM approval_log WHERE request_id = ? ORDER BY decided_at`, [requestId]);
    let text = `📋 طلب #${requestId} - الحالة: ${request.status}\n`;
    text += `المرحلة الحالية: ${request.status === 'pending' ? workflow.STAGES[request.current_stage].label : '-'}\n\n`;
    text += log.map(l => `${workflow.STAGES[l.stage].label}: ${l.decision === 'approved' ? '✅ وافق' : '❌ رفض'} (${l.decided_at})`).join('\n');
    bot.sendMessage(msg.chat.id, text || 'لسه مفيش قرارات مسجّلة.');
  } catch (err) {
    console.error('⚠️ خطأ في /status:', err.message);
    bot.sendMessage(msg.chat.id, '❌ حصل خطأ، جرب تاني.');
  }
});

console.log('🤖 البوت شغال...');
