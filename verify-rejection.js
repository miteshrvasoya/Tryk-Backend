
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
        
        console.log("Fetching a pending draft...");
        const res = await pool.query("SELECT * FROM faq_drafts WHERE status = 'pending_review' LIMIT 1");
        
        if (res.rows.length === 0) {
            console.log("No pending drafts found to reject. Run verify-scraping.js first.");
            return;
        }
        
        const draft = res.rows[0];
        console.log(`Found draft ID ${draft.id}. Rejecting...`);
        
        // Reject via API
        const apiRes = await axios.post('http://localhost:3000/api/faq/reject-batch', {
            jobId: parseInt(draft.job_id),
            rejectedIds: [draft.id]
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log("API Response:", apiRes.data);
        
        // Verify in DB
        const check = await pool.query("SELECT status FROM faq_drafts WHERE id = $1", [draft.id]);
        console.log(`Draft ${draft.id} status is now: ${check.rows[0].status}`);
        
        if (check.rows[0].status === 'rejected') {
            console.log("SUCCESS: Draft was rejected.");
        } else {
            console.log("FAILURE: Draft status was not updated.");
        }

    } catch (e) {
        console.error("Script Error:", e.response ? e.response.data : e.message);
    } finally {
        await pool.end();
    }
}

run();
