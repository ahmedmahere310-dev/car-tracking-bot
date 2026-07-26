const express = require('express');
const path = require('path');
const fb = require('./firebase');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

function asyncRoute(handler) {
  return (req, res) => {
    handler(req, res).catch((err) => {
      console.error('⚠️ خطأ في API:', err.message);
      res.status(500).json({ error: 'خطأ داخلي' });
    });
  };
}

// نظرة عامة
app.get('/api/overview', asyncRoute(async (req, res) => {
  const assets = await fb.all('assets');
  const requests = await fb.all('transferRequests');
  
  const totalAssets = Object.keys(assets).length;
  const byStatus = { available: 0, in_transfer: 0 };
  Object.values(assets).forEach(a => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  });

  const requestsByStatus = { pending: 0, approved: 0, rejected: 0 };
  Object.values(requests).forEach(r => {
    requestsByStatus[r.status] = (requestsByStatus[r.status] || 0) + 1;
  });

  res.json({
    totalAssets,
    byStatus: Object.entries(byStatus).map(([k, v]) => ({ status: k, c: v })),
    requestsByStatus: Object.entries(requestsByStatus).map(([k, v]) => ({ status: k, c: v })),
    totalTransfers: Object.keys(requests).length,
    pendingRequests: requestsByStatus.pending
  });
}));

// توزيع الفروع
app.get('/api/branch-stats', asyncRoute(async (req, res) => {
  const branches = await fb.get('branches');
  const assets = await fb.all('assets');

  const stats = Object.entries(branches || {}).map(([code, branch]) => {
    const count = Object.values(assets).filter(a => a.branch === code).length;
    return { branch_code: code, branch_name: branch.name, asset_count: count };
  });

  res.json(stats.sort((a, b) => b.asset_count - a.asset_count));
}));

// الطلبات المعلّقة
app.get('/api/pending-requests', asyncRoute(async (req, res) => {
  const requests = await fb.all('transferRequests');
  const assets = await fb.get('assets');

  const pending = Object.entries(requests)
    .filter(([_, r]) => r.status === 'pending')
    .map(([id, r]) => ({
      request_id: id,
      ...r,
      asset_name: assets[r.asset_id]?.name || '-'
    }));

  res.json(pending);
}));

// تفاصيل طلب واحد
app.get('/api/request/:id', asyncRoute(async (req, res) => {
  const request = await fb.get(`transferRequests/${req.params.id}`);
  if (!request) return res.status(404).json({ error: 'طلب غير موجود' });

  const asset = await fb.get(`assets/${request.asset_id}`);
  const logs = await fb.all(`approvalLogs/${req.params.id}`);

  res.json({ request, asset, logs: logs || [] });
}));

// إحصائيات
app.get('/api/advanced-stats', asyncRoute(async (req, res) => {
  const requests = await fb.all('transferRequests');
  const approved = Object.values(requests).filter(r => r.status === 'approved').length;
  const rejected = Object.values(requests).filter(r => r.status === 'rejected').length;
  const total = Object.keys(requests).length;

  res.json({
    approvalRate: { approved, rejected, total },
    avgApprovalTime: { avg_days: 0.5 }
  });
}));

// البيانات الكاملة للداشبورد
app.get('/api/dashboard-data', asyncRoute(async (req, res) => {
  const [branches, assets, requests, approvers] = await Promise.all([
    fb.get('branches'),
    fb.get('assets'),
    fb.get('transferRequests'),
    fb.get('approvers')
  ]);

  res.json({
    branches: branches || {},
    assets: assets || {},
    requests: requests || {},
    approvers: approvers || {}
  });
}));

function startDashboard() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`📊 الداشبورد شغال على المنفذ ${port}`);
  });
}

module.exports = { startDashboard };
