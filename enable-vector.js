
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'tryk',
  password: 'root',
  port: 5432,
});

async function run() {
    try {
        console.log("Enabling vector extension...");
        await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
        console.log("Vector extension enabled successfully.");
    } catch (e) {
        console.error("Error enabling extension:", e.message);
    } finally {
        await pool.end();
    }
}

run();
