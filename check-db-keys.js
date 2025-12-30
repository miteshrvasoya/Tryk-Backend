
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
        console.log("Checking database tables...");
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log("Tables:", tables.rows.map(r => r.table_name).join(', '));

        // Check shops table for any config/settings
        if (tables.rows.find(r => r.table_name === 'shops')) {
            console.log("Checking 'shops' table...");
            const shops = await pool.query("SELECT * FROM shops LIMIT 1");
            console.log("Shop Columns:", Object.keys(shops.rows[0] || {}));
            // console.log("Shop Data:", shops.rows); // Caution with logging real data
        }

        // Check widgets table
         if (tables.rows.find(r => r.table_name === 'widgets')) {
            console.log("Checking 'widgets' table...");
            const widgets = await pool.query("SELECT config FROM widgets LIMIT 1");
            if (widgets.rows.length > 0) {
                 console.log("Widget Config Sample:", JSON.stringify(widgets.rows[0].config));
            }
        }
        
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await pool.end();
    }
}

run();
