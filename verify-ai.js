
const { AIService } = require('./dist/services/ai.service');

async function testAI() {
    console.log("Testing AI Service...");
    
    // Simulate Context
    const context = "Q: What is your return policy?\nA: You can return items within 30 days for a full refund.";
    const question = "Can I get my money back if I don't like it?";
    
    console.log("Context:", context);
    console.log("Question:", question);
    
    // Call Service
    const answer = await AIService.generateCustomerResponse("Demo Store", question, context);
    
    console.log("\nAI Answer:");
    console.log(answer);
    
    if (answer.includes("30 days") || answer.includes("refund")) {
        console.log("\nSUCCESS: Answer seems relevant (or fallback works).");
    } else {
        console.log("\nWARNING: Answer might be off.");
    }
}

testAI();
