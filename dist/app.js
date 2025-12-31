"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(express_1.default.json()); // JSON parser
app.use((0, cookie_parser_1.default)());
// CORS configuration - must specify exact origin when using credentials
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        // Allow localhost for dev
        if (origin.startsWith('http://localhost'))
            return callback(null, true);
        // Allow requests from Shopify stores (custom logic can be added here)
        // For now, we allow all for the widget functionality to work across domains
        // In production, we should validate against the 'shops' table
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Widget-Key'],
}));
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use((0, morgan_1.default)('dev'));
// Routes
const webhook_routes_1 = __importDefault(require("./routes/webhook.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const store_routes_1 = __importDefault(require("./routes/store.routes"));
const faq_routes_1 = __importDefault(require("./routes/faq.routes"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const settings_routes_1 = __importDefault(require("./routes/settings.routes"));
const billing_routes_1 = __importDefault(require("./routes/billing.routes"));
const faq_v2_routes_1 = __importDefault(require("./routes/faq-v2.routes"));
const widget_routes_1 = __importDefault(require("./routes/widget.routes"));
const template_routes_1 = __importDefault(require("./routes/template.routes"));
const escalation_routes_1 = __importDefault(require("./routes/escalation.routes"));
require("./services/faq-scan.service"); // Start workers
require("./services/analytics.service"); // Start workers
app.use('/webhook', webhook_routes_1.default);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/stores', store_routes_1.default);
app.use('/api/stores', faq_routes_1.default); // Overlaps pattern, but faq routes are /:storeId/faqs
app.use('/api/faq', faq_v2_routes_1.default);
app.use('/api/widget', widget_routes_1.default);
app.use('/api/templates', template_routes_1.default);
app.use('/api/escalations', escalation_routes_1.default);
app.use('/api/stores', settings_routes_1.default);
app.use('/api/chat', chat_routes_1.default);
app.use('/api/stores', analytics_routes_1.default);
app.use('/api/user', user_routes_1.default);
app.use('/api/billing', billing_routes_1.default);
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("Debugging Routing Issue");
    // Debug: Log all registered routes
    console.log("Registered Routes:");
    app._router.stack.forEach((r) => {
        if (r.route && r.route.path) {
            console.log(`[ROUTE] ${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
        }
        else if (r.name === 'router') {
            // Middleware router (like /api/auth)
            const pattern = r.regexp.source.replace('^\\', '').replace('\\/?(?=\\/|$)', '').replace('(?=\\/|$)', '');
            console.log(`[ROUTER] /${pattern}`);
        }
    });
});
exports.default = app;
