
const axios = require('axios');
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
        const widgetKey = 'wgt_qoqcpvh7rg'; // From previous step
        const message = `Persistence Test ${Date.now()}`;
        
        console.log("Sending Message:", message);
        
        // 1. Send Message
        try {
            await axios.post('http://localhost:3000/api/chat/message', {
                widgetKey, // Route will look up shopId from this
                message,
                metadata: { customerId: 'test_verifier' }
            });
            console.log("Message Sent Successfully.");
        } catch (e) {
            console.error("API Error:", e.response ? e.response.data : e.message);
            // Don't return, check DB anyway to see if partial fail
        }
        
        // 2. Check Database
        await new Promise(r => setTimeout(r, 1000)); // Wait a bit
        
        console.log("\nChecking DB for:", message);
        const res = await pool.query('SELECT * FROM messages WHERE content = $1', [message]);
        
        if (res.rows.length > 0) {
            console.log("SUCCESS: Message found in DB!");
            console.log(res.rows[0]);
            
            // Check for bot response too
            const conId = res.rows[0].conversation_id;
            const botRes = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 AND role = $2', [conId, 'assistant']);
            console.log(`Found ${botRes.rows.length} bot responses in this conversation.`);
        } else {
            console.log("FAILURE: Message NOT found in DB.");
        }

    } catch (e) {
        console.error("Script Error:", e.message);
    } finally {
        await pool.end();
    }
}

run();
