import { Request, Response, NextFunction } from 'express';
import { NangoService } from '../services/NangoService';
import dotenv from 'dotenv';

dotenv.config();

const nangoService = new NangoService(process.env.NANGO_SECRET_KEY!);

export interface AuthenticatedRequest extends Request {
    user: any;
    nango?: {
        connectionId: string;
        provider: string;
    };
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const connectionIdHeader = authReq.headers['x-connection-id'];

    // For testing purposes, if no connectionId is provided, use 'test-connection-id'
    const connectionId: string = typeof connectionIdHeader === 'string' ? connectionIdHeader : 'test-connection-id';

    // Set the connection ID in the NangoService
    nangoService.setConnectionId(connectionId);

    // Hardcode provider for testing, e.g., 'google-mail'
    const provider = 'google-mail';

    nangoService.getConnectionDetails()
        .then(connectionDetails => {
            authReq.nango = {
                connectionId,
                provider: connectionDetails.provider || provider,
            };
            next();
        })
        .catch(error => {
            if (connectionId !== 'test-connection-id') {
                res.status(401).json({ error: `Unauthorized: ${error.message}` });
            } else {
                authReq.nango = {
                    connectionId,
                    provider,
                };
                next();
            }
        });
};