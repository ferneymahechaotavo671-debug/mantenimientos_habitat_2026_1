'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const multer   = require('multer');
const cors     = require('cors');
const path     = require('path');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'habitat_ph_secret_2024';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── AUTH ──────────────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  const t = h ? h.replace('Bearer ', '') : (req.query.token || '');
  if (!t) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token invalido' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

// ── INIT DB ───────────────────────────────────────────────────────────────────
const DEFAULT_BUILDINGS = [
  "ED. ARCOLSA 1","ED. EL PUNTO","ED. CALLE 91","ED. CERROSALES","ED. BALCONES DE EMAUS",
  "ED. TORRE VERNE","ED. SANJAKE","ED. PLAZA 94","ED. PARQUE 86","ED. SANTORINI",
  "ED. 97 IN","ED. IFLAT 63","ED. KUBIK 54","ED. LAGOS DE PONTEVEDRA","ED. VITA 106",
  "ED. CONQUISTADOR","ED. URAPANES","ED. CALLEJON DEL PARQUE","ED. TOSCANA",
  "ED. ALTOS DE LA HERRADURA","ED. LA QUEBRADA"
];

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user', created_at TIMESTAMPTZ DEFAULT NOW()
      )`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS buildings (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL,
        address TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
      )`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenances (
        id SERIAL PRIMARY KEY,
        building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        contacto TEXT DEFAULT '',
        celular TEXT DEFAULT '',
        provider TEXT DEFAULT '',
        periodicidad TEXT DEFAULT '',
        valor TEXT DEFAULT '',
        next_date TEXT DEFAULT '',
        report TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_by TEXT DEFAULT '',
        updated_by TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(building_id, type)
      )`);

    // Add columns if upgrading from older version
    const cols = ['periodicidad','valor','sort_order','contacto','celular'];
    for (const col of cols) {
      try {
        if (col === 'sort_order') {
          await client.query(`ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`);
        } else {
          await client.query(`ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS ${col} TEXT DEFAULT ''`);
        }
      } catch(e) { /* already exists */ }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS monthly_records (
        id SERIAL PRIMARY KEY,
        maintenance_id INTEGER REFERENCES maintenances(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        done BOOLEAN DEFAULT FALSE,
        done_date TEXT DEFAULT '',
        label TEXT DEFAULT '',
        next_date TEXT DEFAULT '',
        report TEXT DEFAULT '',
        recorded_by TEXT DEFAULT '',
        files JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(maintenance_id, year, month)
      )`);

    // Add label column if upgrading
    try { await client.query(`ALTER TABLE monthly_records ADD COLUMN IF NOT EXISTS label TEXT DEFAULT ''`); } catch(e) {}

    // Seed usuarios
    const { rows: u } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(u[0].count) === 0) {
      const h1 = await bcrypt.hash('admin123', 10);
      const h2 = await bcrypt.hash('tecnico123', 10);
      await client.query(
        `INSERT INTO users (name,username,password,role) VALUES ($1,$2,$3,'admin'),($4,$5,$6,'user')`,
        ['Administrador Principal','admin@habitatph.com',h1,'Tecnico Mantenimiento','tecnico@habitatph.com',h2]
      );
    }
    // Seed edificios
    const { rows: b } = await client.query('SELECT COUNT(*) FROM buildings');
    if (parseInt(b[0].count) === 0) {
      for (const name of DEFAULT_BUILDINGS)
        await client.query('INSERT INTO buildings (name,address) VALUES ($1,$2)',[name,'Bogota, Colombia']);
    }
    console.log('✓ Base de datos lista');
  } finally { client.release(); }
}

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE username=$1',[username]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const token = jwt.sign(
      { id: user.id, name: user.name, username: user.username, role: user.role },
      JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── USERS ─────────────────────────────────────────────────────────────────────
app.get('/api/users', auth, adminOnly, async (req, res) => {
  try { const { rows } = await pool.query('SELECT id,name,username,role FROM users ORDER BY id'); res.json(rows); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { name, username, password, role } = req.body;
    if (!name||!username||!password) return res.status(400).json({ error: 'Campos requeridos' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (name,username,password,role) VALUES ($1,$2,$3,$4) RETURNING id,name,username,role',
      [name, username, hash, role||'user']
    );
    res.json(rows[0]);
  } catch(e) {
    if (e.code==='23505') return res.status(400).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: e.message });
  }
});
app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    if (parseInt(req.params.id)===req.user.id) return res.status(400).json({ error: 'No puedes eliminarte' });
    await pool.query('DELETE FROM users WHERE id=$1',[req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BUILDINGS ─────────────────────────────────────────────────────────────────
app.get('/api/buildings', auth, async (req, res) => {
  try { const { rows } = await pool.query('SELECT id,name,address FROM buildings ORDER BY name'); res.json(rows); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/buildings', auth, adminOnly, async (req, res) => {
  try {
    const { name, address } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows } = await pool.query(
      'INSERT INTO buildings (name,address) VALUES ($1,$2) RETURNING id,name,address',
      [name.toUpperCase(), address||'']
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/buildings/:id', auth, adminOnly, async (req, res) => {
  try { await pool.query('DELETE FROM buildings WHERE id=$1',[req.params.id]); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MAINTENANCES ──────────────────────────────────────────────────────────────
function fmtM(m, records) {
  return {
    id: m.id, buildingId: String(m.building_id),
    type: m.type, contacto: m.contacto||'', celular: m.celular||'',
    provider: m.provider||'', periodicidad: m.periodicidad||'',
    valor: m.valor||'', nextDate: m.next_date||'',
    report: m.report||'', sortOrder: m.sort_order||0,
    records: records||[],
    createdAt: m.created_at, updatedAt: m.updated_at
  };
}

app.get('/api/maintenances', auth, async (req, res) => {
  try {
    let q = 'SELECT * FROM maintenances';
    const params = [];
    if (req.query.buildingId) { q += ' WHERE building_id=$1'; params.push(req.query.buildingId); }
    q += ' ORDER BY sort_order ASC, id ASC';
    const { rows: maints } = await pool.query(q, params);
    if (!maints.length) return res.json([]);

    const ids = maints.map(m => m.id);
    let recs = [];
    try {
      const recRes = await pool.query(
        `SELECT id,maintenance_id,year,month,done,done_date,label,next_date,report,recorded_by,files,created_at,updated_at
         FROM monthly_records WHERE maintenance_id = ANY($1) ORDER BY year,month`, [ids]
      );
      recs = recRes.rows;
    } catch(e2) { /* monthly_records table may not exist yet, return empty */ }

    const recsByMaint = {};
    recs.forEach(r => {
      if (!recsByMaint[r.maintenance_id]) recsByMaint[r.maintenance_id] = [];
      recsByMaint[r.maintenance_id].push({
        id: r.id, year: r.year, month: r.month,
        done: r.done, doneDate: r.done_date||'', label: r.label||'',
        nextDate: r.next_date||'', report: r.report||'',
        recordedBy: r.recorded_by||'',
        files: (r.files||[]).map(f=>({ id:f.id, name:f.name, label:f.label, mime:f.mime })),
        createdAt: r.created_at, updatedAt: r.updated_at
      });
    });

    res.json(maints.map(m => fmtM(m, recsByMaint[m.id]||[])));
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/maintenances', auth, async (req, res) => {
  try {
    const { buildingId, type, contacto, celular, provider, periodicidad, valor, nextDate, report } = req.body;
    if (!buildingId||!type) return res.status(400).json({ error: 'Edificio y tipo son obligatorios' });

    const { rows: existing } = await pool.query(
      'SELECT * FROM maintenances WHERE building_id=$1 AND type=$2', [buildingId, type]
    );

    // Get next sort_order
    const { rows: maxOrd } = await pool.query(
      'SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM maintenances WHERE building_id=$1', [buildingId]
    );
    const nextOrder = maxOrd[0].next;

    let maint;
    if (existing.length > 0) {
      const { rows } = await pool.query(
        `UPDATE maintenances SET contacto=$1,celular=$2,provider=$3,periodicidad=$4,valor=$5,next_date=$6,report=$7,
         updated_at=NOW(),updated_by=$8 WHERE id=$9 RETURNING *`,
        [contacto||'', celular||'', provider||'', periodicidad||'', valor||'', nextDate||'', report||'', req.user.name, existing[0].id]
      );
      maint = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO maintenances (building_id,type,contacto,celular,provider,periodicidad,valor,next_date,report,sort_order,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [buildingId, type, contacto||'', celular||'', provider||'', periodicidad||'', valor||'', nextDate||'', report||'', nextOrder, req.user.name]
      );
      maint = rows[0];
    }
    res.json(fmtM(maint, []));
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Any authenticated user can delete a maintenance row
app.delete('/api/maintenances/:id', auth, async (req, res) => {
  try { await pool.query('DELETE FROM maintenances WHERE id=$1',[req.params.id]); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MONTHLY RECORDS ───────────────────────────────────────────────────────────
app.post('/api/monthly-records',
  auth,
  upload.fields([{name:'file1',maxCount:1},{name:'file2',maxCount:1},{name:'file3',maxCount:1}]),
  async (req, res) => {
    try {
      const { maintenanceId, year, month, done, doneDate, label, nextDate, report } = req.body;
      if (!maintenanceId||!year||!month) return res.status(400).json({ error: 'Faltan campos' });

      const newFiles = [];
      const fileLabels = ['Informe','Certificado','Adicional'];
      for (let i=0; i<3; i++) {
        const key = 'file'+(i+1);
        if (req.files && req.files[key]) {
          const f = req.files[key][0];
          newFiles.push({ id: Date.now()+'_'+i, name: f.originalname, label: fileLabels[i], mime: f.mimetype, data: f.buffer.toString('base64') });
        }
      }

      const { rows: existing } = await pool.query(
        'SELECT * FROM monthly_records WHERE maintenance_id=$1 AND year=$2 AND month=$3',
        [maintenanceId, parseInt(year), parseInt(month)]
      );

      let record;
      if (existing.length > 0) {
        const allFiles = [...(existing[0].files||[]), ...newFiles];
        const { rows } = await pool.query(
          `UPDATE monthly_records SET done=$1,done_date=$2,label=$3,next_date=$4,report=$5,
           files=$6::jsonb,recorded_by=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
          [done==='true'||done===true, doneDate||'', label||'', nextDate||'', report||'',
           JSON.stringify(allFiles), req.user.name, existing[0].id]
        );
        record = rows[0];
      } else {
        const { rows } = await pool.query(
          `INSERT INTO monthly_records (maintenance_id,year,month,done,done_date,label,next_date,report,files,recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,
          [maintenanceId, parseInt(year), parseInt(month),
           done==='true'||done===true, doneDate||'', label||'', nextDate||'', report||'',
           JSON.stringify(newFiles), req.user.name]
        );
        record = rows[0];
      }

      res.json({
        id: record.id, maintenanceId: record.maintenance_id,
        year: record.year, month: record.month,
        done: record.done, doneDate: record.done_date||'', label: record.label||'',
        nextDate: record.next_date||'', report: record.report||'',
        recordedBy: record.recorded_by||'',
        files: (record.files||[]).map(f=>({ id:f.id, name:f.name, label:f.label, mime:f.mime })),
        updatedAt: record.updated_at
      });
    } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
  }
);

app.get('/api/monthly-records/:recordId/files/:fileId', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT files FROM monthly_records WHERE id=$1',[req.params.recordId]);
    if (!rows[0]) return res.status(404).json({ error: 'Registro no encontrado' });
    const file = (rows[0].files||[]).find(f => f.id === req.params.fileId);
    if (!file||!file.data) return res.status(404).json({ error: 'Archivo no encontrado' });
    const buf = Buffer.from(file.data, 'base64');
    res.setHeader('Content-Type', file.mime||'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
    res.send(buf);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── STATS ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', auth, async (req, res) => {
  try {
    const now = new Date(); const tm = now.getMonth()+1; const ty = now.getFullYear();
    const bRes = await pool.query('SELECT COUNT(*) FROM buildings');
    const mRes = await pool.query('SELECT COUNT(*) FROM maintenances');
    let doneThisMonth = 0, pending = parseInt(mRes.rows[0].count);
    try {
      const doneRes = await pool.query(
        'SELECT COUNT(*) FROM monthly_records WHERE year=$1 AND month=$2 AND done=true',[ty,tm]
      );
      doneThisMonth = parseInt(doneRes.rows[0].count);
      const pendRows = await pool.query(
        `SELECT COUNT(*) FROM maintenances m
         WHERE NOT EXISTS (SELECT 1 FROM monthly_records r
           WHERE r.maintenance_id=m.id AND r.year=$1 AND r.month=$2 AND r.done=true)`,
        [ty, tm]
      );
      pending = parseInt(pendRows.rows[0].count);
    } catch(e2) { /* monthly_records table may not exist yet */ }
    res.json({
      buildings: parseInt(bRes.rows[0].count),
      total: parseInt(mRes.rows[0].count),
      doneThisMonth,
      pending
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── FRONTEND ──────────────────────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── START ─────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║  HABITAT INTEGRAL PH — Puerto ${PORT}        ║`);
    console.log(`╚══════════════════════════════════════════╝\n`);
  });
}).catch(err => { console.error('Error DB:', err.message); process.exit(1); });
