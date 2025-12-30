
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
        console.log("FETCHING WIDGETS...");
        const res = await pool.query('SELECT widget_key, shop_id, is_active FROM widgets');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await pool.end();
    }
}

run();
