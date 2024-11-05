// src/app.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import assistantRoutes from './routes/assistantRoutes';
import bodyParser from 'body-parser';
import { sessionMiddleware } from './middlewares/sessionMiddleware';

const app = express();

// Basic CORS setup
const corsOptions = {
  origin: true, // Allow all origins during development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*']  // Allow all headers during development
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(sessionMiddleware);

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    next();
  });
}

// Routes
app.use('/assistant', assistantRoutes);

// Health check endpoint with WebSocket info
app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'Grok Assistant API is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    websocket: {
      endpoint: 'wss://3000-idx-sg0808-1723099239615.cluster-p6qcyjpiljdwusmrjxdspyb5m2.cloudworkstations.dev/ws'
    }
  });
});

// Error handling
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

// Export the Express app
export default app;