// src/models/ToolCallHistory.ts

export interface ToolCall {
    id: string;
    sessionId: string;
    toolName: string;
    args: Record<string, any>;
    result: Record<string, any>;
    timestamp: Date;
}