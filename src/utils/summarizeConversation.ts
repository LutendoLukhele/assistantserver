// src/utils/summarizeConversation.ts

import { Groq } from 'groq-sdk'; // Import Groq from the SDK
import winston from 'winston';
import dotenv from 'dotenv';

dotenv.config();

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'SummarizeConversation' },
    transports: [
        new winston.transports.Console(),
    ],
});

// Ensure that environment variable is defined
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not set.");
}

// Initialize Groq client with the API key
const groqClient = new Groq({ apiKey });

export const summarizeConversation = async (messages: { role: string; content: string }[]): Promise<string> => {
    try {
        const summaryPrompt = `
You are an AI assistant. Please summarize the following conversation succinctly:

${messages
    .filter(msg => msg.role !== 'system')
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n')}
`;

        const summaryResponse = await groqClient.chat.completions.create({
            model: 'llama-3.1-70b-versatile',
            messages: [
                { role: 'system', content: 'You are a helpful assistant that summarizes conversations.' },
                { role: 'user', content: summaryPrompt },
            ],
            temperature: 0.5,
            max_tokens: 150,
        });

        // Check if choices exist and handle null case
        const choices = summaryResponse.choices;
        if (!choices || choices.length === 0) {
            throw new Error("No choices returned from the API.");
        }

        // Safely access message content
        const messageContent = choices[0]?.message?.content; // Optional chaining to prevent null access
        if (!messageContent) {
            throw new Error("Message content is null or undefined.");
        }

        const summary = messageContent.trim();
        logger.info(`Conversation summary: ${summary}`);
        return summary;
    } catch (error: any) {
        logger.error(`Error in summarizeConversation: ${error.message}`);
        throw new Error(`Error in summarizeConversation: ${error.message}`);
    }
};