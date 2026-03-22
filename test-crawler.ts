import { WebsiteManagementService } from './src/services/website-management.service';
import { WebsiteCrawlerService } from './src/services/website-crawler.service';
import { query } from './src/db';

async function testCrawl() {
    console.log('Testing crawler on mailos.in...');
    
    // 1. Get a random shop or create one
    const shopResult = await query("SELECT shop_id FROM shops LIMIT 1");
    let shopId = "test-shop-id";
    if (shopResult.rows.length > 0) {
        shopId = shopResult.rows[0].shop_id;
    } else {
        await query("INSERT INTO shops (shop_id, platform) VALUES ($1, 'generic') ON CONFLICT DO NOTHING", [shopId]);
    }
    
    console.log(`Using shopId: ${shopId}`);
    
    // 2. Register website
    const url = "https://www.mailos.in/";
    const websiteResult = await WebsiteManagementService.registerWebsite(shopId, { websiteUrl: url });
    const websiteId = websiteResult.id;
    
    console.log(`Registered websiteId: ${websiteId}`);
    
    // 3. Run crawler
    console.log("Starting crawl...");
    await WebsiteCrawlerService.startCrawl(websiteId, shopId, url);
    
    console.log('Crawl finished. Checking kb_documents...');
    
    const docs = await query("SELECT id, title, source_url, content, token_count FROM kb_documents WHERE website_id = $1", [websiteId]);
    console.log(`\nFound ${docs.rows.length} documents.`);
    for (const doc of docs.rows) {
        console.log(`\n---------------------------------`);
        console.log(`URL: ${doc.source_url}`);
        console.log(`Title: ${doc.title}`);
        console.log(`Len: ${doc.content?.length} | Tokens: ${doc.token_count}`);
        console.log(`Snippet: ${doc.content?.substring(0, 150)}...`);
    }
    process.exit(0);
}
testCrawl().catch(e => { console.error(e); process.exit(1); });
