"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json()); // JSON parser
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
app.use('/webhook', webhook_routes_1.default);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/stores', store_routes_1.default);
app.use('/api/stores', faq_routes_1.default); // Overlaps pattern, but faq routes are /:storeId/faqs
app.use('/api/stores', settings_routes_1.default); // Overlaps pattern, but settings routes are /:storeId/settings
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
});
exports.default = app;
