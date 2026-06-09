import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import pg from "pg";
const { Pool } = pg;

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// SQL DATABASE CONNECTION (PostgreSQL)
const isDbConfigured = process.env.DB_HOST && process.env.DB_NAME;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'production_db',
  // Add a small timeout so it doesn't hang if DB is unreachable
  connectionTimeoutMillis: 2000,
});

// Initialize Database Tables
async function initDb() {
  if (!isDbConfigured) {
    console.log("⚠️ Database not configured (DB_HOST/DB_NAME missing). Running in Mock Mode.");
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS production_logs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        value DOUBLE PRECISION NOT NULL,
        temperature DOUBLE PRECISION,
        pressure DOUBLE PRECISION,
        metric_type VARCHAR(50) DEFAULT 'default'
      );
      CREATE INDEX IF NOT EXISTS idx_timestamp ON production_logs(timestamp DESC);
    `);
    console.log("✅ Database initialized successfully");
  } catch (err) {
    console.error("❌ Failed to initialize database. Falling back to Mock Mode.", err.message);
  }
}

initDb();

// Helper to generate mock data
const getMockData = (count = 50) => {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(Date.now() - (count - i) * 60000).toISOString(),
    value: 10 + (Math.random() - 0.5) * 2,
    temperature: 20 + Math.random() * 5,
    pressure: 100 + Math.random() * 10
  })).reverse();
};

// API Route to fetch production data
app.get("/api/production-data", async (req, res) => {
  if (!isDbConfigured) {
    return res.json(getMockData().reverse());
  }

  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const result = await pool.query(
      "SELECT timestamp, value, temperature, pressure FROM production_logs ORDER BY timestamp DESC LIMIT $1",
      [limit]
    );
    
    if (result.rows.length === 0) {
      return res.json(getMockData().reverse());
    }

    res.json(result.rows);
  } catch (error) {
    console.error("Database fetch error, using mock data:", error.message);
    res.json(getMockData().reverse());
  }
});

// API Route to receive new production data
app.post("/api/production-data", async (req, res) => {
  const { timestamp, value, temperature, pressure } = req.body;
  
  if (value === undefined) {
    return res.status(400).json({ error: "Value is required" });
  }

  if (!isDbConfigured) {
    console.log("Mock Mode: Received data point", { value, temperature });
    return res.status(201).json({ message: "Mock Mode: Data received but not saved" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO production_logs (timestamp, value, temperature, pressure) VALUES ($1, $2, $3, $4) RETURNING *",
      [timestamp || new Date(), value, temperature || 20, pressure || 100]
    );
    
    res.status(201).json({ 
      message: "Data saved to database", 
      data: result.rows[0] 
    });
  } catch (error) {
    console.error("Database save error:", error.message);
    res.status(500).json({ error: "Failed to save data to database" });
  }
});

// API Route for the latest point
app.get("/api/latest-point", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT timestamp, value, temperature, pressure FROM production_logs ORDER BY timestamp DESC LIMIT 1"
    );
    
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      // Fallback for empty DB
      res.json({
        timestamp: new Date().toISOString(),
        value: 10 + (Math.random() - 0.5) * 2,
        temperature: 20 + Math.random() * 5,
        pressure: 100 + Math.random() * 10
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch latest point" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
