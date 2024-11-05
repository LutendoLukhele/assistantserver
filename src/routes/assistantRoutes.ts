import express from 'express';
import { communicateWithAssistant } from '../controllers/assistantController';
import { authenticate } from '../middlewares/authMiddleware';

const router = express.Router();

// Helper function to wrap async route handlers
const asyncHandler = (fn: Function) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Apply authentication middleware to all routes in this router
router.use(authenticate as express.RequestHandler);

// POST /assistant/message
router.post('/message', asyncHandler(communicateWithAssistant));

export default router;