import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { getToolCallsBySessionId } from '../storage/DataStore';
import { ToolConfigManager } from '../services/ToolConfigManager';
import { NangoService } from '../services/NangoService';
import { ToolServiceProvider } from '../services/ToolServiceProvider';
import { GroqService } from '../services/GroqService';
import dotenv from 'dotenv';

dotenv.config();

// Initialize services with toolConfig.json path
const toolConfigManager = new ToolConfigManager('src/config/toolConfig.json');
const nangoService = new NangoService(process.env.NANGO_SECRET_KEY!);
const toolServiceProvider = new ToolServiceProvider(toolConfigManager, nangoService);
const groqService = new GroqService(process.env.GROQ_API_KEY!, toolConfigManager);

toolServiceProvider.setGroqService(groqService);

// Link services
groqService.setToolServiceProvider(toolServiceProvider);
toolServiceProvider.setGroqService(groqService);

export const communicateWithAssistant = async (req: AuthenticatedRequest, res: Response) => {
    const { message } = req.body;
    const session = req.user; // From sessionMiddleware
    const nango = req.nango;   // From authenticate middleware

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Invalid or missing message in request body.' });
    }

    if (!session || !session.sessionId) {
        return res.status(401).json({ error: 'Unauthorized: Invalid session.' });
    }

    if (!nango || !nango.connectionId || !nango.provider) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Nango connection.' });
    }

    try {
        // Communicate with GroqService
        const assistantResponse = await groqService.sendMessage(message, session.sessionId, nango.connectionId, nango.provider);

        // Retrieve tool call history for the session
        const toolCalls = getToolCallsBySessionId(session.sessionId);

        return res.status(200).json({ response: assistantResponse, toolCalls });
    } catch (error: any) {
        return res.status(500).json({ error: `Error communicating with assistant: ${error.message}` });
    }
};