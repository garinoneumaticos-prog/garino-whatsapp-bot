import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

try {
  const result = await pool.query("SELECT NOW()");
  console.log(result.rows[0]);
} catch (err) {
  console.error(err);
}

process.exit();

