import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer, RawData } from 'ws';
import { Buffer } from 'buffer';
import * as path from 'path';
import { GroqService } from './services/GroqService';
import { ToolConfigManager } from './services/ToolConfigManager';
import { ToolServiceProvider } from './services/ToolServiceProvider';
import { NangoService } from './services/NangoService';
import { config } from 'dotenv';
import winston from 'winston';

// Load environment variables
config();

// Setup logging
const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'WebSocketServer' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({ 
            filename: 'websocket-server.log',
            level: 'debug'
        })
    ],
});

interface ClientMessage {
    messageId: string;
    content: string;
    sessionId: string;
    type: MessageType;
}

interface ServerMessage {
    messageId: string;
    content: string;
    type: MessageType;
    toolCalls: ToolCall[];
    sessionId: string;
    timestamp: string;
    status: MessageStatus;
}

interface StreamChunk {
    type: 'content' | 'tool_call' | 'tool_result';
    content: string | Record<string, any>;
    toolCallId?: string;
}

enum MessageType {
    USER = 'USER',
    ASSISTANT = 'ASSISTANT',
    SYSTEM = 'SYSTEM'
}

enum MessageStatus {
    COMPLETE = 'COMPLETE',
    ERROR = 'ERROR',
    PENDING = 'PENDING'
}

interface ToolCall {
    id: string;
    status: ToolCallStatus;
}

enum ToolCallStatus {
    PENDING = 'PENDING',
    COMPLETE = 'COMPLETE',
    ERROR = 'ERROR'
}

class AssistantServer {
    private readonly groqService: GroqService;
    private readonly wss: WebSocketServer;
    private readonly activeConnections: Map<string, WebSocket>;
    private readonly configManager: ToolConfigManager;

    constructor() {
        const app = express();
        const server = createServer(app);
        this.wss = new WebSocketServer({ server });
        
        // Initialize ConfigManager
        this.configManager = new ToolConfigManager(path.resolve(__dirname, 'config/toolConfig.json'));
        
        // Initialize NangoService
        const nangoService = new NangoService(process.env.NANGO_SECRET_KEY!);

        // Initialize ToolServiceProvider
        const toolServiceProvider = new ToolServiceProvider(
            this.configManager,
            nangoService
        );

        // Initialize GroqService and set ToolServiceProvider
        this.groqService = new GroqService(process.env.GROQ_API_KEY!, this.configManager);
        this.groqService.setToolServiceProvider(toolServiceProvider);
        
        this.activeConnections = new Map();

        // Health check endpoint
        app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                serverType: 'websocket',
                version: '1.0.0',
                connections: this.activeConnections.size
            });
        });

        this.setupWebSocket();
        
        const port = process.env.PORT || 3000;
        server.listen(port, () => {
            logger.info(`Server listening on port ${port}`);
        });
    }

    private setupWebSocket() {
        this.wss.on('connection', (ws: WebSocket) => {
            logger.info('New WebSocket connection established');
            const connectionId = Math.random().toString(36).substring(7);
            this.activeConnections.set(connectionId, ws);

            // Send initial connection acknowledgment
            ws.send(JSON.stringify({
                messageId: 'system',
                content: 'Connected to WebSocket server',
                type: MessageType.SYSTEM,
                toolCalls: [],
                sessionId: connectionId,
                timestamp: new Date().toISOString(),
                status: MessageStatus.COMPLETE
            } as ServerMessage));

            ws.on('message', async (data: RawData) => {
                try {
                    const message: ClientMessage = JSON.parse(data.toString());
                    logger.info('Received message:', message);
                    
                    await this.handleStreamingMessage(ws, message);
                } catch (error) {
                    logger.error('Error processing message:', error);
                    ws.send(JSON.stringify({
                        messageId: 'error',
                        content: `Error processing message: ${error}`,
                        type: MessageType.SYSTEM,
                        toolCalls: [],
                        sessionId: 'error',
                        timestamp: new Date().toISOString(),
                        status: MessageStatus.ERROR
                    } as ServerMessage));
                }
            });

            ws.on('close', () => {
                logger.info(`Connection ${connectionId} closed`);
                this.activeConnections.delete(connectionId);
            });

            ws.on('error', (error: Error) => {
                logger.error('WebSocket error:', error);
            });
        });
    }

    private async handleStreamingMessage(ws: WebSocket, message: ClientMessage) {
        try {
            // Send initial acknowledgment
            ws.send(JSON.stringify({
                messageId: `ack-${message.messageId}`,
                content: 'Starting stream...',
                type: MessageType.SYSTEM,
                toolCalls: [],
                sessionId: message.sessionId,
                timestamp: new Date().toISOString(),
                status: MessageStatus.PENDING
            }));
    
            // Get connection details from config
            const connectionId = this.configManager.getConnectionId('google-mail');
            const providerConfigKey = this.configManager.getProviderConfigKey('google-mail');
    
            logger.debug('Using provider details:', { 
                connectionId,
                providerConfigKey
            });
    
            // Get streaming response
            const messageStream = this.groqService.streamMessage(
                message.content,
                message.sessionId,
                connectionId,
                providerConfigKey
            );

            for await (const chunk of messageStream) {
                logger.debug('Received chunk:', { chunk });

                try {
                    // Format chunk based on its type
                    const formattedMessage = {
                        messageId: `stream-${message.messageId}`,
                        content: typeof chunk.content === 'string' ? 
                            chunk.content : 
                            JSON.stringify(chunk.content),
                        type: chunk.type === 'content' ? 
                            MessageType.ASSISTANT : 
                            MessageType.SYSTEM,
                        toolCalls: [],
                        sessionId: message.sessionId,
                        timestamp: new Date().toISOString(),
                        status: MessageStatus.PENDING
                    };

                    ws.send(JSON.stringify(formattedMessage));
                    logger.debug('Sent formatted message:', { formattedMessage });
                } catch (error) {
                    logger.error('Error processing chunk:', { error, chunk });
                }
            }

            // Send completion message
            ws.send(JSON.stringify({
                messageId: `complete-${message.messageId}`,
                content: 'Stream completed',
                type: MessageType.SYSTEM,
                toolCalls: [],
                sessionId: message.sessionId,
                timestamp: new Date().toISOString(),
                status: MessageStatus.COMPLETE
            }));

        } catch (error) {
            logger.error('Streaming error:', error);
            ws.send(JSON.stringify({
                messageId: `error-${message.messageId}`,
                content: `Streaming error: ${error}`,
                type: MessageType.SYSTEM,
                toolCalls: [],
                sessionId: message.sessionId,
                timestamp: new Date().toISOString(),
                status: MessageStatus.ERROR
            }));
        }
    }

    // Graceful shutdown
    shutdown() {
        logger.info('Initiating graceful shutdown...');
        
        this.activeConnections.forEach((ws, id) => {
            try {
                ws.send(JSON.stringify({
                    messageId: 'shutdown',
                    content: 'Server shutting down...',
                    type: MessageType.SYSTEM,
                    toolCalls: [],
                    sessionId: id,
                    timestamp: new Date().toISOString(),
                    status: MessageStatus.COMPLETE
                }));
                ws.close();
            } catch (e) {
                logger.error(`Error closing connection ${id}:`, e);
            }
        });

        // Close WebSocket server
        this.wss.close((err) => {
            if (err) {
                logger.error('Error during WebSocket server shutdown:', err);
            }
            logger.info('WebSocket server closed');
        });
    }
}

// Create and start the server
const server = new AssistantServer();

// Handle graceful shutdown
process.on('SIGINT', () => server.shutdown());
process.on('SIGTERM', () => server.shutdown());
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    server.shutdown();
});

export default AssistantServer;