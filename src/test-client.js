const WebSocket = require('ws');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ws = new WebSocket('ws://localhost:3000');
let messageBuffer = '';

console.log('Connecting to WebSocket server...');

ws.on('open', () => {
    console.log('\n🚀 Connected! Type your message and press Enter to send.');
    console.log('Type "exit" to quit.\n');
    promptUser();
});

function promptUser() {
    rl.question('> ', (input) => {
        if (input.toLowerCase() === 'exit') {
            ws.close();
            rl.close();
            return;
        }

        messageBuffer = '';  // Reset buffer for new message
        
        const message = {
            messageId: Date.now().toString(),
            content: input,
            sessionId: "test-session",
            connectionId: "test-conn",
            provider: "groq",
            type: "USER"
        };

        console.log('\n🔵 Sending message...\n');
        ws.send(JSON.stringify(message));
    });
}

ws.on('message', (rawData) => {
    try {
        const message = JSON.parse(rawData.toString());
        
        switch(message.type) {
            case 'SYSTEM':
                if (message.status === 'COMPLETE') {
                    console.log('\n✅ Complete response:', messageBuffer);
                    console.log('\n--- Response complete ---\n');
                    promptUser();
                } else if (message.status === 'ERROR') {
                    console.log('\n❌ ERROR:', message.content, '\n');
                    promptUser();
                } else {
                    console.log('\n🔄 SYSTEM:', message.content);
                }
                break;

            case 'ASSISTANT':
            case 'content':
                if (message.content) {
                    messageBuffer += message.content;
                    process.stdout.write(message.content);
                }
                break;

            case 'tool_call':
                console.log('\n🔧 TOOL CALL:', message.content);
                break;

            case 'tool_result':
                console.log('\n📊 TOOL RESULT:', message.content);
                break;

            default:
                console.log('\nUnknown message type:', message);
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

ws.on('error', (error) => {
    console.error('\n❌ WebSocket error:', error);
    promptUser();
});

ws.on('close', () => {
    console.log('\n👋 Disconnected from server');
    process.exit(0);
});

process.on('SIGINT', () => {
    ws.close();
    rl.close();
});