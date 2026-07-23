const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();

app.use(express.static(path.join(__dirname, '..', 'public')));

function asyncRoute(handler) {
  return (req, res) => {
    handler(req, res).catch((err) => {
      console.error('⚠️ خطأ في API:', err.message);
      res.status(500).json({ error: 'internal error' });
    });
  };
}

app.get('/api/overview', asyncRoute(async (req, res) => {
  const totalAssets = (await db.get(`SELECT COUNT(*) c FROM assets`)).c;
  const byStatus = await db.all(`SELECT status, COUNT(*) c FROM assets GROUP BY status`);
  const requestsByStatus = await db.all(`SELECT status, COUNT(*) c FROM transfer_requests GROUP BY status`);
  const totalTransfers = (await db.get(`SELECT COUNT(*) c FROM code_history`)).c;
  const pendingRequests = (await db.get(`SELECT COUNT(*) c FROM transfer_requests WHERE status='pending'`)).c;

  res.json({ totalAssets, byStatus, requestsByStatus, totalTransfers, pendingRequests });
}));

app.get('/api/branch-stats', asyncRoute(async (req, res) => {
  const rows = await db.all(`
    SELECT b.branch_code, b.branch_name, COUNT(a.asset_id) AS asset_count
    FROM branches b
    LEFT JOIN assets a ON a.current_branch = b.branch_code
    GROUP BY b.branch_code
    ORDER BY asset_count DESC
  `);
  res.json(rows);
}));

app.get('/api/transfers-timeline', asyncRoute(async (req, res) => {
  const rows = await db.all(`
    SELECT date(changed_at) AS day, COUNT(*) AS count
    FROM code_history
    GROUP BY day
    ORDER BY day ASC
  `);
  res.json(rows);
}));

app.get('/api/recent-transfers', asyncRoute(async (req, res) => {
  const rows = await db.all(`
    SELECT ch.old_code, ch.new_code, ch.changed_at, a.full_name,
           tr.from_branch, tr.to_branch, tr.reason
    FROM code_history ch
    JOIN assets a ON a.asset_id = ch.asset_id
    LEFT JOIN transfer_requests tr ON tr.request_id = ch.transfer_request_id
    ORDER BY ch.changed_at DESC
    LIMIT 30
  `);
  res.json(rows);
}));

app.get('/api/branch-activity', asyncRoute(async (req, res) => {
  const outgoing = await db.all(`
    SELECT from_branch AS branch_code, COUNT(*) AS c
    FROM transfer_requests WHERE status = 'approved'
    GROUP BY from_branch
  `);
  const incoming = await db.all(`
    SELECT to_branch AS branch_code, COUNT(*) AS c
    FROM transfer_requests WHERE status = 'approved'
    GROUP BY to_branch
  `);
  res.json({ outgoing, incoming });
}));

function startDashboard() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`📊 الداشبورد شغال على المنفذ ${port}`);
  });
}

module.exports = { startDashboard };
