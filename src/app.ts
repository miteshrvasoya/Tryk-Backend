import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import dotenv from 'dotenv';
import { initializePassport } from './config/passport';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Please set these environment variables and restart the server');
  process.exit(1);
}

// Initialize Passport
initializePassport();

// Test database connection
const { query } = require('./db');

async function testDatabaseConnection() {
  try {
    await query('SELECT 1');
    console.log('✅ Database connection successful');
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Please check DATABASE_URL environment variable');
    process.exit(1);
  }
}

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
app.use(express.static('public')); // Serve static files (widget.js)

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
import kbRoutes from './routes/kb.routes';
import enhancedChatRoutes from './routes/enhanced-chat.routes';
import './services/faq-scan.service'; // Start workers
import './services/analytics.service'; // Start workers
import oauthRoutes from './routes/oauth.routes';

// Initialize Passport middleware
app.use(passport.initialize());

app.use('/webhook', webhookRoutes);
app.use('/api/auth', oauthRoutes); // OAuth routes
app.use('/api/auth', authRoutes); // Regular auth routes
app.use('/api/stores', storeRoutes);
app.use('/api/stores', faqRoutes); // Overlaps pattern, but faq routes are /:storeId/faqs
app.use('/api/faq', faqV2Routes);
app.use('/api/widget', widgetRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/chat/enhanced', enhancedChatRoutes);
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

// Test database and start server
async function startServer() {
  await testDatabaseConnection();
  
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    console.log("Debugging Routing Issue")
    
    // Debug: Log all registered routes
    console.log("Registered Routes:");
    app._router.stack.forEach((middleware: any) => {
      if (middleware.route) {
        console.log(`[ROUTER] ${middleware.route.path}`);
      }
    });
  });

  // Handle server errors
  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use`);
    } else {
      console.error('Server error:', error);
    }
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
      process.exit(0);
    });
  });
}

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
