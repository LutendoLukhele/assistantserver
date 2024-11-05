const WebSocket = require('ws');

// Your IDX token 
const IDX_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2Nsb3VkLmdvb2dsZS5jb20vd29ya3N0YXRpb25zIiwiYXVkIjoiaWR4LXNnMDgwOC0xNzIzMDk5MjM5NjE1LmNsdXN0ZXItcDZxY3lqcGlsamR3dXNtcmp4ZHNweWI1bTIuY2xvdWR3b3Jrc3RhdGlvbnMuZGV2IiwiaWF0IjoxNzMwMDQyNzUxLCJleHAiOjE3MzAwNDYzNTF9.RiBxJV7DBG7UU_P3psB-fsaVojpOKMLTPmu2keHtfbbtAseUCBfDFZm9pfQPKqStTxuhEwxMITgpAfNOWti6hnx9ZCF59mjdcwwFnn5PkVMSAGc-jOC3mt1r8EgiuVANtdj-VfFaMJJEmmSPZh253_cEUnYXm_6SYrW5k0NsW8uBP5glou1qilSGMf9pnPO0iQ5ObBsYpnacKtw5-fiMX6uUQwR_YeqdvvqOoNGS2CIIpmI2aJ6SDp0YYzREUsW0jN8x5pWKHBXQMOaS9dwdN_lq0mmbXM7nuTd5-_dFiqqk5f8Dx_JPINCW4exVyMHK0yS9p7Ae2DwXdwCL9ZzMkQ";

// Use the IDX preview URL
const ws = new WebSocket('wss://9000-idx-sg0808-1723099239615.cluster-p6qcyjpiljdwusmrjxdspyb5m2.cloudworkstations.dev/preview/ws/session123', {
 headers: {
   'Authorization': `Bearer ${IDX_TOKEN}`,
   'Connection': 'Upgrade',
   'Upgrade': 'websocket',
   'Sec-WebSocket-Version': '13'
 }
});

// Track connection state
let isAlive = false;
const pingInterval = 30000;
let pingTimer;

function heartbeat() {
 isAlive = true;
}

ws.on('open', () => {
 console.log('Connected to WebSocket server through IDX preview');
 isAlive = true;
 
 // Start ping interval
 pingTimer = setInterval(() => {
   if (!isAlive) {
     console.log('Connection is not alive, terminating');
     clearInterval(pingTimer);
     return ws.terminate();
   }
   
   isAlive = false;
   console.log('Sending ping');
   ws.ping();

   // Also send a ping message
   const pingMessage = {
     type: 'ping',
     data: {
       timestamp: new Date().toISOString()
     }
   };
   ws.send(JSON.stringify(pingMessage));
 }, pingInterval);

 // Send initial test message
 const testMessage = {
   type: 'custom',
   data: {
     message: 'Hello from test client!',
     timestamp: new Date().toISOString()
   }
 };
 
 console.log('Sending test message:', testMessage);
 ws.send(JSON.stringify(testMessage));
});

ws.on('ping', () => {
 console.log('Received ping from server');
 ws.pong();
});

ws.on('pong', () => {
 console.log('Received pong from server');
 heartbeat();
});

ws.on('message', (data) => {
 try {
   const message = JSON.parse(data.toString());
   console.log('Received message:', message);
   
   // If we receive a message, consider the connection alive
   heartbeat();
 } catch (e) {
   console.log('Received raw message:', data.toString());
 }
});

ws.on('error', (error) => {
 console.error('WebSocket error:', error);
 clearInterval(pingTimer);
});

ws.on('close', (code, reason) => {
 console.log('Connection closed:', {
   code,
   reason: reason.toString()
 });
 clearInterval(pingTimer);
});

// Handle process termination
process.on('SIGINT', () => {
 console.log('Closing connection...');
 clearInterval(pingTimer);
 ws.close();
 process.exit(0);
});

// Keep the process running
process.stdin.resume();
console.log('Test client running. Press Ctrl+C to exit.');