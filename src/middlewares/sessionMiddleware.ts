// src/middlewares/sessionMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import { addUser, getUser } from '../storage/DataStore';
import { generateUniqueId } from '../utils/generateUniqueId';

export interface AuthenticatedRequest extends Request {
    user?: {
        sessionId: string;
    };
}

export const sessionMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    let sessionId = req.headers['x-session-id'] as string;

    if (!sessionId || !getUser(sessionId)) {
        // Create new session
        sessionId = generateUniqueId();
        addUser(sessionId);
        res.setHeader('x-session-id', sessionId);
    }

    req.user = { sessionId };
    next();
};