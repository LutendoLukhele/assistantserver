import { createSecureServer, Http2Server, Http2ServerRequest, Http2ServerResponse, ServerHttp2Stream, IncomingHttpHeaders } from 'http2';
import { ServerCredentials } from "@grpc/grpc-js";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as reflection from "@grpc/reflection";
import { loadPackageDefinition } from '@grpc/grpc-js';
import { Buffer } from 'buffer';
import * as proto from './generated/assistant';
import { AssistantService } from "./generated/assistant";
import { 
    ClientMessage, 
    ServerMessage, 
    MessageRequest, 
    MessageResponse, 
    HistoryRequest, 
    HistoryResponse,
    MessageType,
    MessageStatus,
    ToolCallStatus,
    ToolCall
} from "./generated/assistant";
import type { 
    ServerDuplexStream, 
    ServiceError, 
    UntypedHandleCall,
    UntypedServiceImplementation,
    ServiceDefinition,
} from "@grpc/grpc-js";
import * as path from 'path';
import { GroqService } from './services/GroqService';
import { ToolConfigManager } from './services/ToolConfigManager';
import { config } from 'dotenv';

// Load environment variables
config();

// Setup CORS metadata
const corsMetadata = new grpc.Metadata();
corsMetadata.add('Access-Control-Allow-Origin', '*');
corsMetadata.add('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

class AssistantServer {
    private readonly groqService: GroqService;
    private readonly activeStreams: Map<string, ServerHttp2Stream>;
    private readonly serviceImplementation: UntypedServiceImplementation;

    constructor() {
        const configManager = new ToolConfigManager(path.resolve(__dirname, '../src/config/toolConfig.json'));
        this.groqService = new GroqService(process.env.GROQ_API_KEY!, configManager);
        this.activeStreams = new Map();

        // Initialize the service implementation with bound methods
        this.serviceImplementation = {
            streamConversation: this.streamConversation.bind(this),
            sendMessage: this.sendMessage.bind(this),
            getConversationHistory: this.getConversationHistory.bind(this)
        };
    }

    getImplementation(): UntypedServiceImplementation {
        return this.serviceImplementation;
    }

    getActiveStreams(): Map<string, ServerHttp2Stream> {
        return this.activeStreams;
    }

    async processMessage(message: ClientMessage): Promise<ServerMessage> {
        try {
            const response = await this.groqService.sendMessage(
                message.content,
                message.sessionId,
                message.connectionId,
                message.provider
            );

            return {
                messageId: `resp-${message.messageId}`,
                content: response,
                type: MessageType.ASSISTANT,
                toolCalls: [],
                sessionId: message.sessionId,
                timestamp: BigInt(Date.now()),
                status: MessageStatus.COMPLETE
            };
        } catch (error) {
            console.error('Error processing message:', error);
            return {
                messageId: `error-${message.messageId}`,
                content: `Error processing message: ${error}`,
                type: MessageType.SYSTEM,
                toolCalls: [],
                sessionId: message.sessionId,
                timestamp: BigInt(Date.now()),
                status: MessageStatus.ERROR
            };
        }
    }

    // Define the streamConversation method
    streamConversation(call: ServerDuplexStream<ClientMessage, ServerMessage>): void {
        call.on('data', async (message: ClientMessage) => {
            console.log('Received client message for streaming:', message);
            const response = await this.processMessage(message);
            call.write(response);
        });

        call.on('end', () => {
            console.log('Stream ended by client');
            call.end();
        });
    }

    // Define the sendMessage method
    sendMessage(call: ServerDuplexStream<ClientMessage, ServerMessage>): void {
        call.on('data', async (message: ClientMessage) => {
            console.log('Received client message for send:', message);
            const response = await this.processMessage(message);
            call.write(response);
        });

        call.on('end', () => {
            console.log('Send stream ended by client');
            call.end();
        });
    }

    // Define the getConversationHistory method
    getConversationHistory(call: ServerDuplexStream<HistoryRequest, HistoryResponse>): void {
        call.on('data', async (request: HistoryRequest) => {
            console.log('Received history request:', request);

            // Fetch conversation history (replace with actual logic)
            const historyResponse: HistoryResponse = {
                messages: [] // Populate with conversation history data
                ,
                hasMore: false
            };

            call.write(historyResponse);
        });

        call.on('end', () => {
            console.log('History stream ended by client');
            call.end();
        });
    }
}

// Load proto definition
const PROTO_PATH = path.resolve(__dirname, '../proto/assistant.proto');
const protoDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

// Initialize gRPC server (for service implementation)
const grpcServer = new grpc.Server();
const assistantServer = new AssistantServer();

// gRPC Message Handling Functions
interface GrpcError {
    code: number;
    message: string;
}

function sendGrpcMessage(stream: ServerHttp2Stream, message: ServerMessage) {
    try {
        const encoded = proto.ServerMessage.encode(message).finish();
        const header = Buffer.alloc(5);
        
        header.writeUInt8(0, 0);  // Compression flag: 0 = no compression
        header.writeUInt32BE(encoded.length, 1);  // Message length in 4 bytes
        
        stream.write(header);
        stream.write(encoded);
        
        console.log('Sent gRPC message:', {
            type: message.type,
            status: message.status,
            length: encoded.length,
            messageId: message.messageId
        });
    } catch (error) {
        console.error('Error sending gRPC message:', error);
        sendGrpcError(stream, {
            code: 2, // UNKNOWN in gRPC status codes
            message: `Error sending message: ${error}`
        });
    }
}

function sendGrpcError(stream: ServerHttp2Stream, error: GrpcError) {
    stream.respond({
        'grpc-status': error.code.toString(),
        'grpc-message': error.message,
        ':status': 200  // gRPC always uses HTTP 200
    });
    stream.end();
}

export { sendGrpcMessage, sendGrpcError };

async function handleGrpcStream(stream: ServerHttp2Stream, headers: IncomingHttpHeaders) {
    let messageBuffer = Buffer.alloc(0);
    let messageLength = -1;
    let headerByteRead = false;

    stream.on('data', async (chunk: Buffer) => {
        try {
            messageBuffer = Buffer.concat([messageBuffer, chunk]);
            
            while (messageBuffer.length > 0) {
                // Read message header
                if (!headerByteRead && messageBuffer.length >= 5) {
                    const flags = messageBuffer[0];
                    messageLength = messageBuffer.readUInt32BE(1);
                    headerByteRead = true;
                    messageBuffer = messageBuffer.slice(5);
                    console.log('Read message header:', { flags, messageLength });
                }

                // Process complete message
                if (headerByteRead && messageBuffer.length >= messageLength) {
                    const messageBytes = messageBuffer.slice(0, messageLength);
                    messageBuffer = messageBuffer.slice(messageLength);
                    
                    // Process based on method
                    const path = headers[':path'];
                    if (path === '/assistant.AssistantService/StreamConversation') {
                        // Fix: Use the proper protobuf decode method
                        const clientMessage = proto.ClientMessage.decode(messageBytes) as unknown as ClientMessage;
                        console.log('Received client message:', clientMessage);
                        
                        if (clientMessage) {
                            // Process message and send response
                            const response = await assistantServer.processMessage(clientMessage);
                            sendGrpcMessage(stream, response);
                        } else {
                            throw new Error('Failed to decode client message');
                        }
                    }
                    
                    // Reset for next message
                    headerByteRead = false;
                    messageLength = -1;
                } else {
                    // Wait for more data
                    break;
                }
            }
        } catch (error) {
            console.error('Error processing gRPC stream data:', error);
            sendGrpcError(stream, {
                code: 2,
                message: `Stream processing error: ${error}`
            });
        }
    });

}

// Create HTTP/2 server
const http2Server = createSecureServer({
    key: process.env.SSL_KEY,
    cert: process.env.SSL_CERT,
    allowHTTP1: true,
    settings: {
        enableConnectProtocol: true,
        maxConcurrentStreams: 1000,
        initialWindowSize: 1024 * 1024,    // 1MB
        maxHeaderListSize: 8192
    }
});

// HTTP/2 request handling
http2Server.on('stream', async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) => {
    console.log('New stream:', {
        path: headers[':path'],
        method: headers[':method'],
        contentType: headers['content-type']
    });

    if (headers['content-type']?.includes('application/grpc')) {
        handleGrpcStream(stream, headers);
    } else {
        // Health check / regular HTTP response
        stream.respond({
            'content-type': 'application/json',
            ':status': 200
        });
        
        stream.end(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            serverType: 'grpc-http2',
            protocols: ['http2', 'grpc'],
            endpoints: {
                streamConversation: '/assistant.AssistantService/StreamConversation',
                sendMessage: '/assistant.AssistantService/SendMessage',
                getConversationHistory: '/assistant.AssistantService/GetConversationHistory',
                health: '/'
            },
            version: '1.0.0'
        }, null, 2));
    }
});

// Server event handlers
http2Server.on('session', (session) => {
    console.log('New HTTP/2 session established');
    
    session.on('error', (error) => {
        console.error('Session error:', error);
    });

    session.on('end', () => {
        console.log('Session ended');
    });
});

http2Server.on('error', (error) => {
    console.error('HTTP/2 server error:', error);
});

// Start server
const port = 8080;
const host = '0.0.0.0';

console.log(`Starting HTTP/2 server on ${host}:${port}`);

http2Server.listen(port, host, () => {
    console.log(`Server listening on port ${port}`);
});

// Graceful shutdown
const shutdownGracefully = () => {
    console.log('Initiating graceful shutdown...');
    
    // Close all active streams
    assistantServer.getActiveStreams().forEach((stream) => {
        try {
            stream.end();
        } catch (e) {
            console.error('Error closing stream:', e);
        }
    });

    const shutdownTimeout = setTimeout(() => {
        console.error('Shutdown timeout exceeded, forcing exit');
        process.exit(1);
    }, 10000);

    http2Server.close(() => {
        clearTimeout(shutdownTimeout);
        console.log('Server shut down successfully');
        process.exit(0);
    });
};

process.on('SIGINT', shutdownGracefully);
process.on('SIGTERM', shutdownGracefully);
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    shutdownGracefully();
});

export default AssistantServer;