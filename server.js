const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORS Ayarı – Frontend bağlantısı için
app.use(cors({
  origin: ["http://localhost:3001"], // Frontend adresi
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));

// Middleware Setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Setup
const DB_PATH = process.env.DB_PATH || './esantiye.db';
let db;

// === Veritabanı bağlantısı ===
async function connectDb() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("Veritabanı bağlantı hatası:", err.message);
        reject(err);
      } else {
        console.log('Veritabanına başarılı şekilde bağlanıldı:', DB_PATH);
        resolve(db);
      }
    });
  });
}

// === Veritabanı tabloları ===
async function initializeDb() {
  if (!db) throw new Error('Database not connected. Call connectDb() first.');

  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'worker',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT,
      type TEXT,
      priority TEXT,
      start_date TEXT,
      end_date TEXT,
      budget REAL,
      duration INTEGER,
      progress INTEGER DEFAULT 0,
      status TEXT DEFAULT 'planning',
      description TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      unit TEXT,
      stockQuantity INTEGER DEFAULT 0,
      minStock INTEGER DEFAULT 0,
      unitPrice REAL,
      supplier TEXT,
      description TEXT,
      barcode TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS personnel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position TEXT,
      tcKimlik TEXT UNIQUE,
      salary REAL,
      joinDate TEXT,
      status TEXT DEFAULT 'Aktif',
      contact TEXT,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS safety_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT,
      description TEXT,
      personnelId INTEGER,
      severity TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (personnelId) REFERENCES personnel(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'TL',
      description TEXT,
      category TEXT,
      date TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to INTEGER,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      start_date TEXT,
      end_date TEXT,
      progress INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (assigned_to) REFERENCES personnel(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      title TEXT NOT NULL,
      file_path TEXT,
      file_type TEXT,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )`, (err) => {
      if (err) reject(err);
      else {
        console.log("Veritabanı tabloları kontrol edildi/oluşturuldu.");
        resolve();
      }
    });
  });
}

// === SQL yardımcıları ===
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

// === ROUTERS ===
const projectsRouter = express.Router();
const materialsRouter = express.Router();
const personnelRouter = express.Router();
const tasksRouter = express.Router();
const transactionsRouter = express.Router();

// === PROJECTS ===
projectsRouter.get('/', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM projects ORDER BY created_at DESC");
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

projectsRouter.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Proje adı gereklidir.' });
    const result = await dbRun(`INSERT INTO projects (name) VALUES (?)`, [name]);
    res.json({ id: result.lastID, message: 'Proje eklendi' });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// === MATERIALS ===
materialsRouter.get('/', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM materials");
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

materialsRouter.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Malzeme adı gerekli.' });
    const result = await dbRun(`INSERT INTO materials (name) VALUES (?)`, [name]);
    res.json({ id: result.lastID });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// === PERSONNEL ===
personnelRouter.get('/', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM personnel");
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

personnelRouter.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'İsim gerekli.' });
    const result = await dbRun(`INSERT INTO personnel (name) VALUES (?)`, [name]);
    res.json({ id: result.lastID });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// === TASKS ===
tasksRouter.get('/', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM tasks");
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === TRANSACTIONS ===
transactionsRouter.get('/', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM transactions");
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === ROUTER MOUNT ===
app.use('/api/projects', projectsRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/personnel', personnelRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/transactions', transactionsRouter);

// === STATISTICS ===
app.get('/api/stats', async (req, res) => {
  try {
    const stats = {
      projects: { total: (await dbAll("SELECT COUNT(*) as c FROM projects"))[0].c },
      materials: { total: (await dbAll("SELECT COUNT(*) as c FROM materials"))[0].c },
      personnel: { total: (await dbAll("SELECT COUNT(*) as c FROM personnel"))[0].c },
      tasks: { total: (await dbAll("SELECT COUNT(*) as c FROM tasks"))[0].c }
    };
    res.json({ data: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// === SERVER START ===
let server;
async function startServer() {
  try {
    await connectDb();
    await initializeDb();
    server = app.listen(PORT, () => {
      console.log(`\nServer is running on http://localhost:${PORT}`);
      console.log(`API: http://localhost:${PORT}/api`);
      console.log(`DB: ${DB_PATH}\n`);
    });
  } catch (err) {
    console.error('Server başlatılamadı:', err);
    process.exit(1);
  }
}

if (require.main === module) startServer();

// Export for tests
module.exports = { app, connectDb, initializeDb, dbAll, dbRun, dbGet };
