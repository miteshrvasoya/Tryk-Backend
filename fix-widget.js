
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
        const token = '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';
        
        // 1. Get Shop ID
        const res = await pool.query('SELECT shop_id FROM shops WHERE access_token = $1', [token]);
        if (res.rows.length === 0) {
            console.log("No shop found for this token.");
            return;
        }
        
        const shopId = res.rows[0].shop_id;
        console.log(`Found Shop: ${shopId}`);
        
        // 2. Generate Widget
        const widgetKey = 'wgt_' + Math.random().toString(36).substring(2, 12);
        const config = {
            title: 'Ask Tryk Support',
            color: '#0D9488',
            position: 'bottom-right'
        };
        
        await pool.query(
            'INSERT INTO widgets (widget_key, shop_id, config, is_active) VALUES ($1, $2, $3, true)',
            [widgetKey, shopId, JSON.stringify(config)]
        );
        
        console.log(`GENERATED WIDGET KEY: ${widgetKey}`);
        
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await pool.end();
    }
}

run();
