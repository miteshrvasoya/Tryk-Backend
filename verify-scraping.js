
const axios = require('axios');
const jwt = require('jsonwebtoken');
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
        const secret = process.env.JWT_SECRET || 'secret';
        const token = jwt.sign({ id: 1, email: 'test@tryk.ai', role: 'owner' }, secret);
        
        const shopId = 'tryk-dev.myshopify.com';
        const url = 'https://example.com'; 
        
        console.log("Triggering Scan for:", url);
        
        // 1. Trigger Scan
        const response = await axios.post('http://localhost:3000/api/faq/scan', {
            shopId,
            websiteUrl: url,
            crawlDepth: 1
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log("API Response:", response.status, response.data);
        const jobId = response.data.jobId;
        
        // 2. Wait for processing (SimpleQueue is fast but async)
        console.log("Waiting for worker...");
        await new Promise(r => setTimeout(r, 5000));
        
        // 3. Check DB
        console.log("Checking DB for drafts...");
        const res = await pool.query('SELECT * FROM faq_drafts WHERE job_id = $1', [jobId]);
        
        if (res.rows.length > 0) {
            console.log(`SUCCESS: Found ${res.rows.length} drafts!`);
            console.log("First Draft Sample:", res.rows[0].answer.substring(0, 50) + "...");
        } else {
            console.log("FAILURE: No drafts found. Worker might have failed or is still running.");
            
            // Check job status
            const jobRes = await pool.query('SELECT * FROM faq_scan_jobs WHERE id = $1', [jobId]);
            console.log("Job Status:", jobRes.rows[0]);
        }

    } catch (e) {
        console.error("Script Error:", e.response ? e.response.data : e.message);
    } finally {
        await pool.end();
    }
}

run();
