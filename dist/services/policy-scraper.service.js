"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyScraperService = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
class PolicyScraperService {
    /**
     * Scrapes standard policy pages from a Shopify store.
     */
    static async scrapePolicies(baseUrl) {
        console.log(`[PolicyScraper] Starting scan for ${baseUrl}`);
        const results = [];
        // Normalize URL
        const origin = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
        for (const policy of this.POLICY_PATHS) {
            const url = `${origin}${policy.path}`;
            try {
                const response = await axios_1.default.get(url, {
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
            }
            catch (error) {
                // 404 is expected for many policies, just ignore
                if (error.response?.status !== 404) {
                    console.warn(`[PolicyScraper] Error fetching ${url}: ${error.message}`);
                }
            }
        }
        return results;
    }
}
exports.PolicyScraperService = PolicyScraperService;
PolicyScraperService.POLICY_PATHS = [
    { type: 'Shipping Policy', path: '/policies/shipping-policy' },
    { type: 'Refund Policy', path: '/policies/refund-policy' },
    { type: 'Privacy Policy', path: '/policies/privacy-policy' },
    { type: 'Terms of Service', path: '/policies/terms-of-service' },
    { type: 'Subscription Policy', path: '/policies/subscription-policy' }
];
