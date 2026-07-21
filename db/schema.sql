-- ============================================================
-- نظام التحكم المركزي في حركة السيارات والمعدات
-- Schema أساسي (SQLite للتطوير / متوافق مع PostgreSQL بتعديلات بسيطة)
-- ============================================================

-- جدول الفروع/المجموعات وحروف الكود الخاصة بيها
CREATE TABLE IF NOT EXISTS branches (
    branch_code   TEXT PRIMARY KEY,      -- مثال: C, BHT, ALX
    branch_name   TEXT NOT NULL,         -- الاسم الكامل بالعربي
    is_active     INTEGER NOT NULL DEFAULT 1
);

-- عداد آخر رقم مستخدم لكل فرع (المصدر الوحيد للحقيقة عند توليد كود جديد)
CREATE TABLE IF NOT EXISTS branch_counters (
    branch_code   TEXT PRIMARY KEY REFERENCES branches(branch_code),
    last_number   INTEGER NOT NULL DEFAULT 0
);

-- جدول الأصول (السيارات والمعدات)
CREATE TABLE IF NOT EXISTS assets (
    asset_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    current_code    TEXT UNIQUE NOT NULL,   -- الكود الحالي، مثال: C-005
    full_name       TEXT NOT NULL,
    brand           TEXT,
    model_code      TEXT,
    manufacture_year INTEGER,
    plate_number    TEXT,
    chassis_number  TEXT,
    engine_number    TEXT,
    driver_name     TEXT,
    current_branch  TEXT NOT NULL REFERENCES branches(branch_code),
    beneficiary     TEXT,                   -- المستفاد
    status          TEXT NOT NULL DEFAULT 'available',
        -- available | in_transfer | under_maintenance | out_of_service
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- سجل تاريخ الأكواد: كل مرة يتغير فيها كود الأصل بسبب نقلة
CREATE TABLE IF NOT EXISTS code_history (
    history_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id        INTEGER NOT NULL REFERENCES assets(asset_id),
    old_code        TEXT NOT NULL,
    new_code        TEXT NOT NULL,
    transfer_request_id INTEGER,            -- مرتبط بالطلب اللي سبب التغيير
    changed_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- جدول الأدوار والموافقين (Approvers Mapping)
CREATE TABLE IF NOT EXISTS approvers (
    approver_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    role            TEXT NOT NULL,
        -- top_management | sector_head | branch_manager | warehouse_manager
    branch_code     TEXT REFERENCES branches(branch_code),  -- NULL لو الدور شامل كل الفروع (زي رئيس القطاع)
    full_name       TEXT NOT NULL,
    telegram_id     TEXT NOT NULL,
    backup_telegram_id TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1
);

-- جدول طلبات النقل
CREATE TABLE IF NOT EXISTS transfer_requests (
    request_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id        INTEGER NOT NULL REFERENCES assets(asset_id),
    from_branch     TEXT NOT NULL REFERENCES branches(branch_code),
    to_branch       TEXT NOT NULL REFERENCES branches(branch_code),
    reason          TEXT,
    requested_by_telegram_id TEXT NOT NULL,
    current_stage   INTEGER NOT NULL DEFAULT 1,
        -- 1=الإدارة العليا 2=رئيس القطاع 3=مدير الفرع المصدّر 4=مدير المخازن
    status          TEXT NOT NULL DEFAULT 'pending',
        -- pending | approved | rejected | cancelled
    rejection_reason TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
);

-- سجل تدقيق كل قرار موافقة/رفض (Audit Trail)
CREATE TABLE IF NOT EXISTS approval_log (
    log_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      INTEGER NOT NULL REFERENCES transfer_requests(request_id),
    stage           INTEGER NOT NULL,
    approver_telegram_id TEXT NOT NULL,
    decision        TEXT NOT NULL,     -- approved | rejected
    reason          TEXT,
    decided_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assets_branch ON assets(current_branch);
CREATE INDEX IF NOT EXISTS idx_requests_status ON transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvers_role_branch ON approvers(role, branch_code);
