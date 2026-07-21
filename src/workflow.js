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
function getApproverForStage(request, stage) {
  const role = STAGES[stage].role;
  const row = db.prepare(`
    SELECT * FROM approvers
    WHERE role = ? AND is_active = 1
      AND (branch_code = ? OR branch_code IS NULL)
    ORDER BY (branch_code IS NULL) ASC  -- الأولوية للموافق المرتبط بالفرع تحديدًا
    LIMIT 1
  `).get(role, request.from_branch);
  return row || null;
}

/** إنشاء طلب نقل جديد وبدء المرحلة الأولى */
function createTransferRequest({ assetId, fromBranch, toBranch, reason, requestedByTelegramId }) {
  const info = db.prepare(`
    INSERT INTO transfer_requests (asset_id, from_branch, to_branch, reason, requested_by_telegram_id, current_stage, status)
    VALUES (?, ?, ?, ?, ?, 1, 'pending')
  `).run(assetId, fromBranch, toBranch, reason, requestedByTelegramId);

  db.prepare(`UPDATE assets SET status = 'in_transfer' WHERE asset_id = ?`).run(assetId);

  return getRequestById(info.lastInsertRowid);
}

function getRequestById(requestId) {
  return db.prepare(`SELECT * FROM transfer_requests WHERE request_id = ?`).get(requestId);
}

/**
 * تسجيل قرار موافقة/رفض على مرحلة معينة.
 * - لو موافقة وفيه مرحلة بعدها: ينتقل للمرحلة التالية ويرجع الموافق الجديد عشان يتبعتله إشعار.
 * - لو موافقة وهي آخر مرحلة: يقفل الطلب، يولّد الكود الجديد، يحدّث الأصل.
 * - لو رفض: يقفل الطلب فورًا في أي مرحلة (مفيش تجاوز).
 */
function recordDecision(requestId, { approverTelegramId, decision, reason }) {
  const request = getRequestById(requestId);
  if (!request) throw new Error('الطلب غير موجود');
  if (request.status !== 'pending') throw new Error('الطلب مقفول بالفعل');

  db.prepare(`
    INSERT INTO approval_log (request_id, stage, approver_telegram_id, decision, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(requestId, request.current_stage, approverTelegramId, decision, reason || null);

  if (decision === 'rejected') {
    db.prepare(`
      UPDATE transfer_requests
      SET status = 'rejected', rejection_reason = ?, completed_at = datetime('now')
      WHERE request_id = ?
    `).run(reason || 'بدون سبب محدد', requestId);

    db.prepare(`UPDATE assets SET status = 'available' WHERE asset_id = ?`).run(request.asset_id);

    return { result: 'rejected', request: getRequestById(requestId) };
  }

  // decision === 'approved'
  if (request.current_stage < TOTAL_STAGES) {
    const nextStage = request.current_stage + 1;
    db.prepare(`UPDATE transfer_requests SET current_stage = ? WHERE request_id = ?`).run(nextStage, requestId);
    const updated = getRequestById(requestId);
    const nextApprover = getApproverForStage(updated, nextStage);
    return { result: 'advanced', stage: nextStage, nextApprover, request: updated };
  }

  // آخر مرحلة اتوافق عليها -> نفّذ النقل فعليًا وولّد الكود الجديد
  const newCode = completeTransfer(request);
  return { result: 'completed', newCode, request: getRequestById(requestId) };
}

/** مساعد بسيط لتنفيذ عدة عمليات كوحدة واحدة (node:sqlite مفهوش .transaction() جاهزة زي better-sqlite3) */
function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * توليد كود جديد بشكل آمن (atomic). ملحوظة: الدالة دي بتفترض إنها بتتنفذ
 * جوه معاملة (transaction) شغالة بالفعل من اللي بينادي عليها - عشان كده
 * مفيهاش BEGIN/COMMIT خاص بيها (تفاديًا لتداخل المعاملات).
 */
function generateNextCode(branchCode) {
  db.prepare(`
    INSERT INTO branch_counters (branch_code, last_number) VALUES (?, 1)
    ON CONFLICT(branch_code) DO UPDATE SET last_number = last_number + 1
  `).run(branchCode);
  const row = db.prepare(`SELECT last_number FROM branch_counters WHERE branch_code = ?`).get(branchCode);
  return `${branchCode}-${String(row.last_number).padStart(3, '0')}`;
}

/** تنفيذ النقلة فعليًا: كود جديد + تحديث الأصل + تسجيل في تاريخ الأكواد + إقفال الطلب */
function completeTransfer(request) {
  const asset = db.prepare(`SELECT * FROM assets WHERE asset_id = ?`).get(request.asset_id);
  const oldCode = asset.current_code;

  return withTransaction(() => {
    const newCode = generateNextCode(request.to_branch);

    db.prepare(`
      UPDATE assets SET current_code = ?, current_branch = ?, status = 'available', updated_at = datetime('now')
      WHERE asset_id = ?
    `).run(newCode, request.to_branch, asset.asset_id);

    db.prepare(`
      INSERT INTO code_history (asset_id, old_code, new_code, transfer_request_id)
      VALUES (?, ?, ?, ?)
    `).run(asset.asset_id, oldCode, newCode, request.request_id);

    db.prepare(`
      UPDATE transfer_requests SET status = 'approved', completed_at = datetime('now')
      WHERE request_id = ?
    `).run(request.request_id);

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
  generateNextCode,
};
