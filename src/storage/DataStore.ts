// src/storage/DataStore.ts

import { User } from '../models/User';
import { ToolCall } from '../models/ToolCallHistory';

// In-memory stores
const users: Map<string, User> = new Map(); // key: sessionId
const toolCallHistories: ToolCall[] = [];

// User Operations
export const addUser = (sessionId: string): User => {
    const user: User = { sessionId };
    users.set(sessionId, user);
    return user;
};

export const getUser = (sessionId: string): User | undefined => {
    return users.get(sessionId);
};

// Tool Call Operations
export const addToolCall = (toolCall: ToolCall): void => {
    toolCallHistories.push(toolCall);
};

export const getToolCallsBySessionId = (sessionId: string): ToolCall[] => {
    return toolCallHistories.filter(call => call.sessionId === sessionId);
};