
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
        const inputKey = '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';
        
        console.log("--- WIDGETS TABLE ---");
        const wRes = await pool.query('SELECT widget_key, shop_id, is_active FROM widgets');
        console.table(wRes.rows);
        
        console.log("\n--- SHOPS TABLE (filtered by token) ---");
        const sRes = await pool.query('SELECT shop_id, access_token FROM shops WHERE access_token = $1', [inputKey]);
        if (sRes.rows.length > 0) {
            console.log("MATCH FOUND for input key in shops table (It is an Access Token!):");
            console.log(sRes.rows[0]);
        } else {
            console.log("No match in shops table for this token.");
        }
        
    } catch (e) {
        console.error("DB Error:", e.message);
    } finally {
        await pool.end();
    }
}

run();
