
import { ChatEngineService } from './src/services/chat-engine.service';
import { query } from './src/db';
import dotenv from 'dotenv';
dotenv.config();

async function testLogic() {
    try {
        console.log("Setting up Test Data...");
        // 1. Ensure we have a valid User (for integer ID)
        const userRes = await query(`
            INSERT INTO users (email, password_hash, full_name, role)
            VALUES ('tester@test.com', 'hash', 'Tester', 'owner')
            ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email -- simple trick to get ID
            RETURNING id
        `);
        const userId = userRes.rows[0].id;

        // 2. Ensure we have a dummy Shop & FAQ
        await query(`
            INSERT INTO shops (shop_id, user_id, name, access_token, platform, onboarding_complete)
            VALUES ('test_shop', $1, 'Test Shop', 'dummy_token', 'shopify', true)
            ON CONFLICT (shop_id) DO NOTHING
        `, [userId]);

        await query(`
            INSERT INTO faqs (shop_id, question, answer, is_active)
            VALUES ('test_shop', 'fetch CSV file', 'You can fetch CSV files from Gmail automatically.', true)
            ON CONFLICT DO NOTHING
        `);

        // 2. Test Smart Search
        const question = "Can you automatically fetch CSV?";
        console.log(`\nTesting Search Query: "${question}"`);
        
        // Mock request object if needed, but processMessage handles signature
        const response: any = await ChatEngineService.processMessage('test_shop', question, { customerId: 'tester' });
        
        console.log("\nResponse:", response.response);
        console.log("Confidence:", response.confidence);
        console.log("Escalated:", response.escalated);
        
        if (response.response.toLowerCase().includes("gmail")) {
            console.log("\nSUCCESS: Search found the right FAQ!");
        } else {
             console.log("\nFAIL: Search missed it or AI failed relevance.");
        }

        // 3. Test Escalation (Nonsense)
        console.log("\nTesting Nonsense Query: 'What is the capital of Mars?'");
        const nonsense: any = await ChatEngineService.processMessage('test_shop', 'What is the capital of Mars?', { customerId: 'tester' });
        console.log("Response:", nonsense.response);
        
        if (nonsense.escalated) {
             console.log("\nSUCCESS: Correctly escalated.");
        } else {
             console.log("\nFAIL: Did not escalate properly.");
        }

    } catch (e) {
        console.error("Test Failed:", e);
    }
}

testLogic();
