// src/tests/integration/cliTest.ts

import axios from 'axios';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const API_URL = 'http://localhost:3000/assistant/message';

interface Options {
    sessionId: string;
    connectionId: string;
    provider: string;
    message: string;
}

const argv = yargs(hideBin(process.argv))
    .option('sessionId', {
        type: 'string',
        description: 'Session ID',
        default: 'test-session-id', // Default session ID for testing
    })
    .option('connectionId', {
        type: 'string',
        description: 'Nango Connection ID',
        default: 'test-connection-id', // Hardcoded for testing
    })
    .option('provider', {
        type: 'string',
        description: 'Provider name',
        default: 'google-mail', // Hardcoded provider for testing
    })
    .option('message', {
        type: 'string',
        description: 'Message to send to assistant',
        demandOption: true,
    })
    .help()
    .argv as unknown as Options;

const sendMessage = async (options: Options) => {
    try {
        const response = await axios.post(API_URL, {
            message: options.message,
        }, {
            headers: {
                'x-session-id': options.sessionId,
                'x-connection-id': options.connectionId,
                'Content-Type': 'application/json',
            },
        });

        console.log('Assistant Response:', response.data.response);
        console.log('Tool Calls:', response.data.toolCalls);
    } catch (error: any) {
        if (error.response) {
            console.error('Error:', error.response.data.error);
        } else {
            console.error('Error:', error.message);
        }
    }
};

sendMessage(argv);