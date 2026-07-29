const express = require('express');
const path = require('path');
const fb = require('./firebase');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

function asyncRoute(handler) {
  return (req, res) => {
    handler(req, res).catch((err) => {
      console.error('⚠️ خطأ:', err.message);
      res.status(500).json({ error: 'خطأ' });
    });
  };
}

// نظرة عامة
app.get('/api/overview', asyncRoute(async (req, res) => {
  const branches = await fb.get('branches') || {};
  const assets = await fb.get('assets') || {};
  const requests = await fb.get('transferRequests') || {};
  const stats = await fb.get('stats') || {};

  res.json({
    totalAssets: Object.keys(assets).length,
    totalTransfers: stats.totalTransfers || 0,
    totalApproved: stats.totalApproved || 0,
    totalPending: Object.values(requests).filter(r => r.status === 'pending').length,
    branches: Object.values(branches).length
  });
}));

// الفروع مع الأصول
app.get('/api/branches', asyncRoute(async (req, res) => {
  const branches = await fb.get('branches') || {};
  const assets = await fb.get('assets') || {};

  const branchesWithAssets = {};
  Object.entries(branches).forEach(([code, branch]) => {
    const branchAssets = Object.values(assets).filter(a => a.branch === code);
    branchesWithAssets[code] = {
      ...branch,
      assets: branchAssets,
      assetCount: branchAssets.length
    };
  });

  res.json(branchesWithAssets);
}));

// الأصول (كل البيانات)
app.get('/api/assets', asyncRoute(async (req, res) => {
  const assets = await fb.get('assets') || {};
  res.json(Object.values(assets));
}));

// أصل واحد بالتفاصيل الكاملة
app.get('/api/asset/:code', asyncRoute(async (req, res) => {
  const asset = await fb.get(`assets/${req.params.code}`);
  if (!asset) return res.status(404).json({ error: 'غير موجود' });

  // احصائيات الأصل
  const requests = await fb.get('transferRequests') || {};
  const assetRequests = Object.values(requests).filter(r => r.asset_id === req.params.code);

  res.json({
    ...asset,
    transferHistory: assetRequests,
    transferCount: assetRequests.length,
    lastTransfer: asset.lastTransfer
  });
}));

// الطلبات المعلّقة
app.get('/api/pending-requests', asyncRoute(async (req, res) => {
  const requests = await fb.get('transferRequests') || {};
  const assets = await fb.get('assets') || {};

  const pending = Object.entries(requests)
    .filter(([_, r]) => r.status === 'pending')
    .map(([id, r]) => ({
      id,
      ...r,
      assetName: assets[r.asset_id]?.name || '-'
    }));

  res.json(pending);
}));

// إحصائيات متقدمة
app.get('/api/stats', asyncRoute(async (req, res) => {
  const branches = await fb.get('branches') || {};
  const requests = await fb.get('transferRequests') || {};

  // أكثر فرع نقلات
  const branchTransfers = {};
  Object.values(requests).forEach(r => {
    branchTransfers[r.from] = (branchTransfers[r.from] || 0) + 1;
  });

  const topBranches = Object.entries(branchTransfers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({
      branch: code,
      name: branches[code]?.name,
      transferCount: count
    }));

  // أكثر المسارات (من-إلى)
  const routes = {};
  Object.values(requests).forEach(r => {
    const key = `${r.from}_${r.to}`;
    routes[key] = (routes[key] || 0) + 1;
  });

  const topRoutes = Object.entries(routes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([route, count]) => {
      const [from, to] = route.split('_');
      return {
        from,
        to,
        fromName: branches[from]?.name,
        toName: branches[to]?.name,
        count
      };
    });

  res.json({
    topBranches,
    topRoutes,
    totalTransfers: Object.keys(requests).length,
    totalApproved: Object.values(requests).filter(r => r.status === 'approved').length,
    totalRejected: Object.values(requests).filter(r => r.status === 'rejected').length
  });
}));

// كل البيانات للداشبورد
app.get('/api/dashboard-data', asyncRoute(async (req, res) => {
  const [branches, assets, requests, stats, approvers] = await Promise.all([
    fb.get('branches'),
    fb.get('assets'),
    fb.get('transferRequests'),
    fb.get('stats'),
    fb.get('approvers')
  ]);

  res.json({
    branches: branches || {},
    assets: assets || {},
    requests: requests || {},
    stats: stats || {},
    approvers: approvers || {}
  });
}));

function startDashboard() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`📊 الداشبورد شغال على ${port}`);
  });
}

module.exports = { startDashboard };
