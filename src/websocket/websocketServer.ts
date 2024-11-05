import { Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { RawData } from 'ws';
import jwt from 'jsonwebtoken';

interface AuthenticatedWebSocket extends WebSocket {
  sessionId: string;
  isAuthenticated: boolean;
  isAlive: boolean;
}

export class WebSocketHandler {
  private wss: WebSocketServer;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();
  private readonly heartbeatInterval = 30000; // 30 seconds

  constructor(server: Server) {
    console.log('Initializing WebSocket Server with JWT Authentication');
    
    this.wss = new WebSocketServer({ 
      server,
      verifyClient: this.verifyClient.bind(this)
    });

    this.initialize();
    this.startHeartbeatCheck();
  }

  private startHeartbeatCheck() {
    setInterval(() => {
      this.clients.forEach((ws, id) => {
        if (!ws.isAlive) {
          console.log(`Client ${id} failed heartbeat check, terminating`);
          ws.terminate();
          return;
        }
        
        ws.isAlive = false;
        console.log(`Sending ping to client ${id}`);
        ws.ping();
      });
    }, this.heartbeatInterval);
  }

  private verifyClient(
    info: { origin: string; secure: boolean; req: IncomingMessage }, 
    callback: (verified: boolean, code?: number, message?: string) => void
  ): void {
    try {
      const authHeader = info.req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        console.log('No bearer token provided');
        callback(false, 4001, 'Bearer token required');
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      console.log('Received token:', token.substring(0, 50) + '...');

      try {
        // Verify token structure and expiration
        const decoded = jwt.decode(token, { complete: true });
        console.log('Decoded token:', decoded);

        if (!decoded) {
          console.log('Invalid token format');
          callback(false, 4003, 'Invalid token format');
          return;
        }

        // Check if token is expired
        const expirationTime = (decoded.payload as any).exp * 1000; // Convert to milliseconds
        if (Date.now() >= expirationTime) {
          console.log('Token expired');
          callback(false, 4003, 'Token expired');
          return;
        }

        // Check audience (aud) claim if present
        const audience = (decoded.payload as any).aud;
        if (audience && !audience.includes('idx-sg0808-1723099239615.cluster-p6qcyjpiljdwusmrjxdspyb5m2.cloudworkstations.dev')) {
          console.log('Invalid token audience');
          callback(false, 4003, 'Invalid token audience');
          return;
        }

        // If we get here, token is valid
        (info.req as any).isAuthenticated = true;
        callback(true);

      } catch (err) {
        console.error('Token verification error:', err);
        callback(false, 4003, 'Invalid token');
      }
    } catch (error) {
      console.error('Client verification error:', error);
      callback(false, 4000, 'Verification failed');
    }
  }

  private initialize(): void {
    this.wss.on('connection', (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
      console.log('New authenticated connection attempt:', {
        url: request.url,
        isAuthenticated: (request as any).isAuthenticated
      });

      const sessionId = this.extractSessionId(request.url || '');
      if (!sessionId) {
        console.log('No session ID provided');
        ws.close(4002, 'Session ID required');
        return;
      }

      // Initialize WebSocket properties
      ws.sessionId = sessionId;
      ws.isAuthenticated = (request as any).isAuthenticated;
      ws.isAlive = true;

      // Store connection
      this.clients.set(sessionId, ws);
      console.log(`Client authenticated and connected with session: ${sessionId}`);

      // Send connection confirmation
      this.sendMessage(ws, {
        type: 'connection_established',
        data: { 
          sessionId,
          authenticated: true,
        }
      });

      // Set up ping/pong handlers
      ws.on('ping', () => {
        console.log(`Received ping from ${sessionId}`);
        ws.pong();
      });

      ws.on('pong', () => {
        console.log(`Received pong from ${sessionId}`);
        ws.isAlive = true;
      });

      // Message handling
      ws.on('message', (data: RawData) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('Received message:', {
            sessionId: ws.sessionId,
            type: message.type,
            data: message.data
          });
          
          switch (message.type) {
            case 'ping':
              this.sendMessage(ws, {
                type: 'pong',
                data: { 
                  timestamp: new Date().toISOString(),
                  echo: message.data 
                }
              });
              break;
            case 'custom':
              this.sendMessage(ws, {
                type: 'custom_response',
                data: { 
                  received: message.data,
                  serverTime: new Date().toISOString() 
                }
              });
              break;
            default:
              console.log(`Received unknown message type: ${message.type}`);
              this.sendMessage(ws, {
                type: 'unknown_type',
                data: { 
                  originalType: message.type,
                  message: 'Unknown message type received'
                }
              });
          }
        } catch (error) {
          console.error('Error handling message:', error);
          this.sendMessage(ws, {
            type: 'error',
            data: { message: 'Invalid message format' }
          });
        }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        console.log(`Client ${sessionId} disconnected:`, {
          code,
          reason: reason.toString()
        });
        this.clients.delete(sessionId);
      });

      ws.on('error', (error: Error) => {
        console.error(`WebSocket error for ${sessionId}:`, error);
        this.clients.delete(sessionId);
      });
    });

    this.wss.on('error', (error: Error) => {
      console.error('WebSocket server error:', error);
    });

    // Handle server shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, closing all connections...');
      this.shutdown();
    });
  }

  private sendMessage(ws: WebSocket, message: any): void {
    try {
      ws.send(JSON.stringify({
        ...message,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  private extractSessionId(url: string): string | null {
    const matches = url.match(/\/ws\/(.+)/);
    return matches ? matches[1] : null;
  }

  public shutdown(): void {
    console.log('Shutting down WebSocket server');
    for (const [sessionId, client] of this.clients) {
      console.log(`Closing connection for session: ${sessionId}`);
      client.close(1001, 'Server shutdown');
    }
    this.clients.clear();
    this.wss.close(() => {
      console.log('WebSocket server closed');
    });
  }

  public broadcastMessage(type: string, data: any): void {
    const message = {
      type,
      data,
      timestamp: new Date().toISOString()
    };

    console.log(`Broadcasting message to ${this.clients.size} clients:`, message);

    this.clients.forEach((client, sessionId) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Error broadcasting to client ${sessionId}:`, error);
        }
      }
    });
  }

  public getConnectedClients(): number {
    return this.clients.size;
  }

  public isClientConnected(sessionId: string): boolean {
    const client = this.clients.get(sessionId);
    return client !== undefined && client.readyState === WebSocket.OPEN;
  }
}