import axios from 'axios';
import * as cheerio from 'cheerio';

interface PolicyPage {
    type: string;
    url: string;
    content: string;
}

export class PolicyScraperService {
    
    private static readonly POLICY_PATHS = [
        { type: 'Shipping Policy', path: '/policies/shipping-policy' },
        { type: 'Refund Policy', path: '/policies/refund-policy' },
        { type: 'Privacy Policy', path: '/policies/privacy-policy' },
        { type: 'Terms of Service', path: '/policies/terms-of-service' },
        { type: 'Subscription Policy', path: '/policies/subscription-policy' }
    ];

    /**
     * Scrapes standard policy pages from a Shopify store.
     */
    static async scrapePolicies(baseUrl: string): Promise<PolicyPage[]> {
        console.log(`[PolicyScraper] Starting scan for ${baseUrl}`);
        const results: PolicyPage[] = [];

        // Normalize URL
        const origin = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

        for (const policy of this.POLICY_PATHS) {
            const url = `${origin}${policy.path}`;
            try {
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'TrykBot/1.0 (Integration)' },
                    timeout: 5000,
                    validateStatus: (status) => status === 200 // Only accept 200
                });

                const $ = cheerio.load(response.data);
                
                // Typical Shopify Policy Structure: .shopify-policy__body or main content
                // Fallback to searching common containers
                let content = $('.shopify-policy__body').text().trim();
                
                if (!content) {
                    content = $('main').text().trim();
                }
                
                // Cleanup
                // remove scripts, styles if we grabbed 'main'
                if (!content || content.length < 50) {
                     // Try simpler heuristic
                     $('script, style, nav, footer, header').remove();
                     content = $('body').text().trim();
                }

                if (content && content.length > 100) {
                    // Normalize whitespace
                    content = content.replace(/\s+/g, ' ').trim();
                    
                    console.log(`[PolicyScraper] Found ${policy.type}: ${content.substring(0, 50)}...`);
                    results.push({
                        type: policy.type,
                        url: url,
                        content: content
                    });
                }

            } catch (error: any) {
                // 404 is expected for many policies, just ignore
                if (error.response?.status !== 404) {
                     console.warn(`[PolicyScraper] Error fetching ${url}: ${error.message}`);
                }
            }
        }

        return results;
    }
}
