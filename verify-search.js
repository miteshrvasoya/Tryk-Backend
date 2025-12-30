
const { ChatEngineService } = require('./dist/services/chat-engine.service'); // Using dist for local run
const { query } = require('./dist/db');

async function testLogic() {
    try {
        console.log("Setting up Test Data...");
        // 1. Ensure we have a dummy FAQ
        await query(`
            INSERT INTO faqs (shop_id, question, answer, is_active)
            VALUES ('test_shop', 'fetch CSV file', 'You can fetch CSV files from Gmail automatically.', true)
            ON CONFLICT DO NOTHING
        `);

        // 2. Test Smart Search
        const question = "Can you automatically fetch CSV?";
        console.log(`\nTesting Search Query: "${question}"`);
        
        // We call the private method via 'any' casting or just verify via full flow if public
        // Let's use processMessage to test the whole flow
        const response = await ChatEngineService.processMessage('test_shop', question, { customerId: 'tester' });
        
        console.log("\nResponse:", response.response);
        console.log("Confidence:", response.confidence);
        console.log("Intent:", response.intent);
        
        if (response.response.toLowerCase().includes("gmail")) {
            console.log("\nSUCCESS: Search found the right FAQ!");
        } else {
             console.log("\nFAIL: Search missed it or AI failed relevance.");
        }

        // 3. Test Escalation (Nonsense)
        console.log("\nTesting Nonsense Query: 'What is the capital of Mars?'");
        const nonsense = await ChatEngineService.processMessage('test_shop', 'What is the capital of Mars?', { customerId: 'tester' });
        console.log("Response:", nonsense.response);
        
        if (nonsense.escalated && nonsense.response.includes("not exactly sure")) {
             console.log("\nSUCCESS: Correctly escalated.");
        } else {
             console.log("\nFAIL: Did not escalate properly.");
        }

    } catch (e) {
        console.error("Test Failed:", e);
    }
}

testLogic();
