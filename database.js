/**
 * =============================================
 *   PostgreSQL Database Handler
 *   Smart Traffic Management System
 * =============================================
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'traffic_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('⚠️  Unexpected PostgreSQL pool error:', err.message);
});

// ─────────────────────────────────────────
//  INITIALIZE DATABASE TABLES
// ─────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    // Vehicles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id            SERIAL PRIMARY KEY,
        vehicle_number VARCHAR(20)  NOT NULL,
        vehicle_type   VARCHAR(30)  NOT NULL,
        priority       INTEGER      NOT NULL,
        arrival_time   TIMESTAMPTZ  NOT NULL,
        lane_number    INTEGER      NOT NULL CHECK (lane_number BETWEEN 1 AND 4),
        status         VARCHAR(20)  DEFAULT 'waiting' CHECK (status IN ('waiting', 'passed', 'cleared')),
        created_at     TIMESTAMPTZ  DEFAULT NOW()
      )
    `);

    // Logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS logs (
        log_id     SERIAL PRIMARY KEY,
        vehicle_id INTEGER      REFERENCES vehicles(id) ON DELETE SET NULL,
        action     VARCHAR(50)  NOT NULL,
        message    TEXT,
        timestamp  TIMESTAMP    DEFAULT NOW()
      )
    `);

    // Index on status and priority for fast queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vehicles_status   ON vehicles(status);
      CREATE INDEX IF NOT EXISTS idx_vehicles_priority ON vehicles(priority);
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp    ON logs(timestamp DESC);
    `);

    console.log('✅ PostgreSQL: Database tables initialized successfully');
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────
//  VEHICLE CRUD OPERATIONS
// ─────────────────────────────────────────

async function insertVehicle(vehicle) {
  const result = await pool.query(
    `INSERT INTO vehicles 
       (vehicle_number, vehicle_type, priority, arrival_time, lane_number, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      vehicle.vehicle_number.toUpperCase().trim(),
      vehicle.vehicle_type,
      vehicle.priority,
      vehicle.arrival_time,
      vehicle.lane_number,
      vehicle.status || 'waiting'
    ]
  );
  return result.rows[0];
}

async function updateVehicleStatus(id, status) {
  const result = await pool.query(
    'UPDATE vehicles SET status = $1 WHERE id = $2 RETURNING *',
    [status, id]
  );
  return result.rows[0];
}

async function updateVehiclePriority(id, newPriority, newArrivalTime = null) {
  if (newArrivalTime) {
    const result = await pool.query(
      'UPDATE vehicles SET priority = $1, arrival_time = $2 WHERE id = $3 RETURNING *',
      [newPriority, newArrivalTime, id]
    );
    return result.rows[0];
  } else {
    const result = await pool.query(
      'UPDATE vehicles SET priority = $1 WHERE id = $2 RETURNING *',
      [newPriority, id]
    );
    return result.rows[0];
  }
}

async function getAllVehicles(limit = 100) {
  const result = await pool.query(
    'SELECT * FROM vehicles ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

async function getWaitingVehicles() {
  const result = await pool.query(
    `SELECT * FROM vehicles 
     WHERE status = 'waiting' 
     ORDER BY priority ASC, arrival_time ASC`
  );
  return result.rows;
}


// ─────────────────────────────────────────
//  LOG OPERATIONS
// ─────────────────────────────────────────

async function addLog(vehicleId, action, message) {
  await pool.query(
    'INSERT INTO logs (vehicle_id, action, message) VALUES ($1, $2, $3)',
    [vehicleId, action, message]
  );
}

async function getLogs(limit = 50) {
  const result = await pool.query(
    `SELECT 
       l.log_id, l.vehicle_id, l.action, l.message,
       l.timestamp, v.vehicle_number, v.vehicle_type
     FROM logs l
     LEFT JOIN vehicles v ON l.vehicle_id = v.id
     ORDER BY l.timestamp DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ─────────────────────────────────────────
//  STATISTICS QUERIES
// ─────────────────────────────────────────

async function getStats() {
  const result = await pool.query(`
    SELECT 
      COUNT(*)                                                   AS total,
      COUNT(CASE WHEN status = 'waiting'  THEN 1 END)           AS waiting,
      COUNT(CASE WHEN status = 'passed'   THEN 1 END)           AS passed,
      COUNT(CASE WHEN status = 'cleared'  THEN 1 END)           AS cleared,
      COUNT(CASE WHEN priority <=  3 AND status = 'waiting' THEN 1 END) AS emergency,
      ROUND(
        AVG(
          CASE WHEN status = 'passed'
            THEN EXTRACT(EPOCH FROM (NOW() - arrival_time)) / 60
          END
        )::NUMERIC, 2
      )                                                          AS avg_wait_minutes
    FROM vehicles
  `);
  const row = result.rows[0];
  return {
    total: parseInt(row.total) || 0,
    waiting: parseInt(row.waiting) || 0,
    passed: parseInt(row.passed) || 0,
    cleared: parseInt(row.cleared) || 0,
    emergency: parseInt(row.emergency) || 0,
    avgWait: parseFloat(row.avg_wait_minutes) || 0
  };
}

async function getLaneStats() {
  const result = await pool.query(`
    SELECT 
      lane_number,
      COUNT(*) AS vehicle_count,
      COUNT(CASE WHEN priority <= 3 THEN 1 END) AS emergency_count
    FROM vehicles
    WHERE status = 'waiting'
    GROUP BY lane_number
    ORDER BY lane_number
  `);
  return result.rows;
}

// Health check
async function ping() {
  const result = await pool.query('SELECT NOW() AS time');
  return result.rows[0].time;
}

module.exports = {
  initDB,
  insertVehicle,
  updateVehicleStatus,
  updateVehiclePriority,
  getAllVehicles,
  getWaitingVehicles,
  addLog,
  getLogs,
  getStats,
  getLaneStats,
  ping
};
