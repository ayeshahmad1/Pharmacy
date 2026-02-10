const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const isPkg = !!process.pkg;
const appRoot = isPkg ? path.dirname(process.execPath) : __dirname;

// Load .env from next to the EXE (or project root in dev)
require('dotenv').config({ path: path.join(appRoot, '.env') });

const authRoutes = require('./routes/authRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const saleRoutes = require('./routes/saleRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/purchases', purchaseRoutes);

// Serve built frontend from /public next to EXE (or project root in prod)
if (isPkg || process.env.NODE_ENV === 'production') {
  const publicDir = path.join(appRoot, 'public');
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// Mongo
mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME })
  .then(() => console.log('Mongo connected → host:', mongoose.connection.host, 'db:', mongoose.connection.name))
  .catch(err => console.error('Mongo error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));

app.get('/ping', (_, res) => res.send('pong'));
