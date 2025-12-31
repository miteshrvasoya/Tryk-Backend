import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // JSON parser
app.use(cookieParser());

// CORS configuration - must specify exact origin when using credentials
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost for dev
    if (origin.startsWith('http://localhost')) return callback(null, true);
    
    // Allow requests from Shopify stores (custom logic can be added here)
    // For now, we allow all for the widget functionality to work across domains
    // In production, we should validate against the 'shops' table
    return callback(null, true); 
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Widget-Key'],
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan('dev'));

// Routes
import webhookRoutes from './routes/webhook.routes';
import authRoutes from './routes/auth.routes';
import storeRoutes from './routes/store.routes';
import faqRoutes from './routes/faq.routes';
import chatRoutes from './routes/chat.routes';
import analyticsRoutes from './routes/analytics.routes';
import userRoutes from './routes/user.routes';
import settingsRoutes from './routes/settings.routes';
import billingRoutes from './routes/billing.routes';
import faqV2Routes from './routes/faq-v2.routes';
import widgetRoutes from './routes/widget.routes';
import templateRoutes from './routes/template.routes';
import escalationRoutes from './routes/escalation.routes';
import './services/faq-scan.service'; // Start workers
import './services/analytics.service'; // Start workers

app.use('/webhook', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/stores', faqRoutes); // Overlaps pattern, but faq routes are /:storeId/faqs
app.use('/api/faq', faqV2Routes);
app.use('/api/widget', widgetRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/escalations', escalationRoutes);
app.use('/api/stores', settingsRoutes); 
app.use('/api/chat', chatRoutes);
app.use('/api/stores', analyticsRoutes); 
app.use('/api/user', userRoutes);
app.use('/api/billing', billingRoutes);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  console.log("Debugging Routing Issue")
  
  // Debug: Log all registered routes
  console.log("Registered Routes:");
  app._router.stack.forEach((r: any) => {
    if (r.route && r.route.path) {
      console.log(`[ROUTE] ${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
    } else if (r.name === 'router') {
      // Middleware router (like /api/auth)
      const pattern = r.regexp.source.replace('^\\', '').replace('\\/?(?=\\/|$)', '').replace('(?=\\/|$)', '');
      console.log(`[ROUTER] /${pattern}`);
    }
  });
});

export default app;
