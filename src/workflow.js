const db = require('./db');

// ترتيب المراحل وربطها بالدور المطلوب الموافقة منه
const STAGES = {
  1: { role: 'top_management', label: 'الإدارة العليا' },
  2: { role: 'sector_head', label: 'رئيس القطاع' },
  3: { role: 'branch_manager', label: 'مدير الفرع المُصدِّر' },
  4: { role: 'warehouse_manager', label: 'مدير المخازن' },
};
const TOTAL_STAGES = 4;

/**
 * يرجع الموافِق المسؤول عن مرحلة معينة لطلب معين.
 * البحث بيفضل الموافِق المرتبط بالفرع (from_branch)، ولو مفيش، ياخد الموافِق العام (branch_code = NULL)
 * زي رئيس القطاع أو الإدارة العليا اللي بيغطوا كل الفروع.
 */
async function getApproverForStage(request, stage) {
  const role = STAGES[stage].role;
  const row = await db.get(`
    SELECT * FROM approvers
    WHERE role = ? AND is_active = 1
      AND (branch_code = ? OR branch_code IS NULL)
    ORDER BY (branch_code IS NULL) ASC
    LIMIT 1
  `, [role, request.from_branch]);
  return row || null;
}

/** إنشاء طلب نقل جديد وبدء المرحلة الأولى */
async function createTransferRequest({ assetId, fromBranch, toBranch, reason, requestedByTelegramId }) {
  const info = await db.run(`
    INSERT INTO transfer_requests (asset_id, from_branch, to_branch, reason, requested_by_telegram_id, current_stage, status)
    VALUES (?, ?, ?, ?, ?, 1, 'pending')
  `, [assetId, fromBranch, toBranch, reason, requestedByTelegramId]);

  await db.run(`UPDATE assets SET status = 'in_transfer' WHERE asset_id = ?`, [assetId]);

  return getRequestById(info.lastInsertRowid);
}

async function getRequestById(requestId) {
  return db.get(`SELECT * FROM transfer_requests WHERE request_id = ?`, [requestId]);
}

/**
 * تسجيل قرار موافقة/رفض على مرحلة معينة.
 */
async function recordDecision(requestId, { approverTelegramId, decision, reason }) {
  const request = await getRequestById(requestId);
  if (!request) throw new Error('الطلب غير موجود');
  if (request.status !== 'pending') throw new Error('الطلب مقفول بالفعل');

  await db.run(`
    INSERT INTO approval_log (request_id, stage, approver_telegram_id, decision, reason)
    VALUES (?, ?, ?, ?, ?)
  `, [requestId, request.current_stage, approverTelegramId, decision, reason || null]);

  if (decision === 'rejected') {
    await db.run(`
      UPDATE transfer_requests
      SET status = 'rejected', rejection_reason = ?, completed_at = datetime('now')
      WHERE request_id = ?
    `, [reason || 'بدون سبب محدد', requestId]);

    await db.run(`UPDATE assets SET status = 'available' WHERE asset_id = ?`, [request.asset_id]);

    return { result: 'rejected', request: await getRequestById(requestId) };
  }

  // decision === 'approved'
  if (request.current_stage < TOTAL_STAGES) {
    const nextStage = request.current_stage + 1;
    await db.run(`UPDATE transfer_requests SET current_stage = ? WHERE request_id = ?`, [nextStage, requestId]);
    const updated = await getRequestById(requestId);
    const nextApprover = await getApproverForStage(updated, nextStage);
    return { result: 'advanced', stage: nextStage, nextApprover, request: updated };
  }

  // آخر مرحلة اتوافق عليها -> نفّذ النقل فعليًا وولّد الكود الجديد
  const newCode = await completeTransfer(request);
  return { result: 'completed', newCode, request: await getRequestById(requestId) };
}

/** تنفيذ النقلة فعليًا: كود جديد + تحديث الأصل + تسجيل في تاريخ الأكواد + إقفال الطلب (كله جوه transaction واحدة) */
async function completeTransfer(request) {
  const asset = await db.get(`SELECT * FROM assets WHERE asset_id = ?`, [request.asset_id]);
  const oldCode = asset.current_code;

  return db.withTransaction(async (tx) => {
    await tx.run(`
      INSERT INTO branch_counters (branch_code, last_number) VALUES (?, 1)
      ON CONFLICT(branch_code) DO UPDATE SET last_number = last_number + 1
    `, [request.to_branch]);
    const counterRow = await tx.get(`SELECT last_number FROM branch_counters WHERE branch_code = ?`, [request.to_branch]);
    const newCode = `${request.to_branch}-${String(counterRow.last_number).padStart(3, '0')}`;

    await tx.run(`
      UPDATE assets SET current_code = ?, current_branch = ?, status = 'available', updated_at = datetime('now')
      WHERE asset_id = ?
    `, [newCode, request.to_branch, asset.asset_id]);

    await tx.run(`
      INSERT INTO code_history (asset_id, old_code, new_code, transfer_request_id)
      VALUES (?, ?, ?, ?)
    `, [asset.asset_id, oldCode, newCode, request.request_id]);

    await tx.run(`
      UPDATE transfer_requests SET status = 'approved', completed_at = datetime('now')
      WHERE request_id = ?
    `, [request.request_id]);

    return newCode;
  });
}

module.exports = {
  STAGES,
  TOTAL_STAGES,
  getApproverForStage,
  createTransferRequest,
  getRequestById,
  recordDecision,
};
