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

app.get('/api/dashboard-data', asyncRoute(async (req, res) => {
  const branches = await fb.get('branches') || {};
  const assets = await fb.get('assets') || {};
  const requests = await fb.get('transferRequests') || {};
  const approvers = await fb.get('approvers') || {};

  res.json({ branches, assets, requests, approvers });
}));

app.get('/api/overview', asyncRoute(async (req, res) => {
  const assets = await fb.all('assets') || [];
  const requests = await fb.all('transferRequests') || [];
  
  res.json({
    totalAssets: Object.keys(assets).length,
    byStatus: [],
    requestsByStatus: [],
    totalTransfers: Object.keys(requests).length,
    pendingRequests: 0
  });
}));

function startDashboard() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`📊 الداشبورد شغال على ${port}`);
  });
}

module.exports = { startDashboard };
