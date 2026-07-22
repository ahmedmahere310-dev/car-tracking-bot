const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/overview', (req, res) => {
  const totalAssets = db.prepare(`SELECT COUNT(*) c FROM assets`).get().c;
  const byStatus = db.prepare(`SELECT status, COUNT(*) c FROM assets GROUP BY status`).all();
  const requestsByStatus = db.prepare(`SELECT status, COUNT(*) c FROM transfer_requests GROUP BY status`).all();
  const totalTransfers = db.prepare(`SELECT COUNT(*) c FROM code_history`).get().c;
  const pendingRequests = db.prepare(`SELECT COUNT(*) c FROM transfer_requests WHERE status='pending'`).get().c;

  res.json({ totalAssets, byStatus, requestsByStatus, totalTransfers, pendingRequests });
});

app.get('/api/branch-stats', (req, res) => {
  const rows = db.prepare(`
    SELECT b.branch_code, b.branch_name, COUNT(a.asset_id) AS asset_count
    FROM branches b
    LEFT JOIN assets a ON a.current_branch = b.branch_code
    GROUP BY b.branch_code
    ORDER BY asset_count DESC
  `).all();
  res.json(rows);
});

app.get('/api/transfers-timeline', (req, res) => {
  const rows = db.prepare(`
    SELECT date(changed_at) AS day, COUNT(*) AS count
    FROM code_history
    GROUP BY day
    ORDER BY day ASC
  `).all();
  res.json(rows);
});

app.get('/api/recent-transfers', (req, res) => {
  const rows = db.prepare(`
    SELECT ch.old_code, ch.new_code, ch.changed_at, a.full_name,
           tr.from_branch, tr.to_branch, tr.reason
    FROM code_history ch
    JOIN assets a ON a.asset_id = ch.asset_id
    LEFT JOIN transfer_requests tr ON tr.request_id = ch.transfer_request_id
    ORDER BY ch.changed_at DESC
    LIMIT 30
  `).all();
  res.json(rows);
});

app.get('/api/branch-activity', (req, res) => {
  const outgoing = db.prepare(`
    SELECT from_branch AS branch_code, COUNT(*) AS c
    FROM transfer_requests WHERE status = 'approved'
    GROUP BY from_branch
  `).all();
  const incoming = db.prepare(`
    SELECT to_branch AS branch_code, COUNT(*) AS c
    FROM transfer_requests WHERE status = 'approved'
    GROUP BY to_branch
  `).all();
  res.json({ outgoing, incoming });
});

function startDashboard() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`📊 الداشبورد شغال على المنفذ ${port}`);
  });
}

module.exports = { startDashboard };
