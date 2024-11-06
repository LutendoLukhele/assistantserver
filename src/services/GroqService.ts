import { Groq } from 'groq-sdk';
import { ToolServiceProvider } from './ToolServiceProvider';
import { ToolConfigManager } from './ToolConfigManager';
import winston from 'winston';
import { summarizeConversation } from '../utils/summarizeConversation';
import { generateEmailContent as generateEmailContentUtil } from '../utils/emailUtils';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'GroqService' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ],
});

interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    tool_calls?: any[];
    name?: string;
    timestamp?: string;
}

interface HistoryContent {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    timestamp: string;
    metadata?: {
        tool_call_id?: string;
        tool_calls?: any[];
        name?: string;
    };
}

export class GroqService {
    private client: Groq;
    private configManager: ToolConfigManager;
    private toolServiceProvider?: ToolServiceProvider;
    private messageHistory: Map<string, Message[]>;
    private readonly contextLimit: number = 4096;

    constructor(apiKey: string, configManager: ToolConfigManager) {
        if (!apiKey) {
            throw new Error('GROQ_API_KEY is required');
        }
        this.client = new Groq({ apiKey });
        this.configManager = configManager;
        this.messageHistory = new Map();
        
        logger.info('GroqService initialized');
    }

    public getConversationHistory(sessionId: string): HistoryContent[] | PromiseLike<HistoryContent[]> {
        const messages = this.messageHistory.get(sessionId) || [];
        return messages.map(msg => ({
            id: Math.random().toString(36).substring(7),
            content: msg.content,
            role: msg.role,
            timestamp: msg.timestamp || new Date().toISOString(),
            metadata: {
                tool_call_id: msg.tool_call_id,
                tool_calls: msg.tool_calls,
                name: msg.name
            }
        }));
    }

    public setToolServiceProvider(toolServiceProvider: ToolServiceProvider) {
        this.toolServiceProvider = toolServiceProvider;
        logger.info('ToolServiceProvider set');
    }

    public async sendMessage(
        message: string,
        sessionId: string,
        connectionId: string,
        provider: string
    ): Promise<string> {
        try {
            logger.info('Processing message', { sessionId, connectionId, provider });

            // Initialize or get message history
            if (!this.messageHistory.has(sessionId)) {
                const initialMessages = this.initializeMessageHistory();
                this.messageHistory.set(sessionId, initialMessages);
                logger.info('Initialized new message history', { sessionId });
            }

            // Add user message
            this.addUserMessage(sessionId, message);

            // Check context limit and summarize if needed
            if (this.isContextLimitExceeded(sessionId)) {
                logger.info('Context limit exceeded, summarizing conversation', { sessionId });
                await this.summarizeConversation(sessionId);
            }

            // Get tool descriptions and run conversation
            const tools = this.configManager.getToolDescriptions();
            const response = await this.runConversation(sessionId, tools, connectionId, provider);

            logger.info('Message processed successfully', { sessionId });
            return response;
        } catch (error) {
            logger.error('Error in sendMessage', { 
                error: error instanceof Error ? error.message : 'Unknown error',
                sessionId 
            });
            throw error;
        }
    }

    public async *streamMessage(
        message: string,
        sessionId: string,
        connectionId: string,
        provider: string
    ): AsyncGenerator<{
        type: 'content' | 'tool_call' | 'tool_result',
        content: string,
        messageId?: string,
        toolCallId?: string
    }> {
        try {
            logger.info('Processing streaming message', { sessionId, connectionId, provider });
    
            if (!this.messageHistory.has(sessionId)) {
                const initialMessages = this.initializeMessageHistory();
                this.messageHistory.set(sessionId, initialMessages);
                logger.info('Initialized new message history', { sessionId });
            }
    
            if (!this.toolServiceProvider) {
                logger.error('ToolServiceProvider not set');
                throw new Error('ToolServiceProvider not set');
            }
    
            this.addUserMessage(sessionId, message);
            let accumulatedContent = '';
            let buffer = '';
    
            const messages = (this.messageHistory.get(sessionId) || []).map(msg => ({
                role: msg.role,
                content: msg.content,
                tool_call_id: msg.tool_call_id,
                tool_calls: msg.tool_calls,
                name: msg.name
            }));
    
            const tools = this.configManager.getToolDescriptions();
            
            const stream = await this.client.chat.completions.create({
                model: 'llama-3.1-70b-versatile',
                messages: messages as any[],
                tools,
                tool_choice: 'auto',
                temperature: 0.7,
                max_tokens: 1000,
                stream: true
            });
    
            let currentToolCall: any = null;
    
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                const toolCalls = chunk.choices[0]?.delta?.tool_calls;
    
                if (content) {
                    buffer += content;
                    accumulatedContent += content;
    
                    if (buffer.match(/[.!?]\s/) || buffer.length > 50) {
                        const toSend = buffer;
                        buffer = '';
                        yield {
                            type: 'content',
                            content: toSend
                        };
                    }
                }
    
                if (toolCalls?.length) {
                    const toolCall = toolCalls[0];
                    
                    if (!currentToolCall) {
                        currentToolCall = {
                            id: toolCall.id,
                            function: {
                                name: toolCall.function?.name || '',
                                arguments: toolCall.function?.arguments || ''
                            }
                        };
                    } else {
                        if (toolCall.function?.arguments) {
                            currentToolCall.function.arguments += toolCall.function.arguments;
                        }
                        if (toolCall.function?.name) {
                            currentToolCall.function.name = toolCall.function.name;
                        }
                    }
    
                    // When tool call is complete
                    if (currentToolCall.function.name && currentToolCall.function.arguments.endsWith('}')) {
                        logger.info('Complete tool call received', { 
                            toolName: currentToolCall.function.name,
                            toolCallId: currentToolCall.id
                        });
    
                        // Add the assistant's message that includes the tool call
                        this.addAssistantMessage(sessionId, {
                            content: accumulatedContent,
                            tool_calls: [currentToolCall]
                        });
    
                        yield {
                            type: 'tool_call',
                            content: JSON.stringify(currentToolCall.function),
                            toolCallId: currentToolCall.id
                        };
    
                        try {
                            const args = JSON.parse(currentToolCall.function.arguments);
                            const toolResult = await this.toolServiceProvider.executeToolCall(
                                currentToolCall.function.name,
                                args,
                                sessionId,
                                connectionId,
                                provider
                            );
    
                            // Add tool result to history
                            this.addToolMessage(
                                sessionId,
                                currentToolCall.id,
                                currentToolCall.function.name,
                                toolResult
                            );
    
                            yield {
                                type: 'tool_result',
                                content: JSON.stringify(toolResult),
                                toolCallId: currentToolCall.id
                            };
    
                            // Get follow-up stream with updated conversation history
                            const updatedMessages = [...messages, {
                                role: 'assistant',
                                content: accumulatedContent,
                                tool_calls: [currentToolCall]
                            }, {
                                role: 'tool',
                                content: JSON.stringify(toolResult),
                                tool_call_id: currentToolCall.id,
                                name: currentToolCall.function.name
                            }];
    
                            // Start new completion stream with tool results
                            const followUpStream = await this.client.chat.completions.create({
                                model: 'llama-3.1-70b-versatile',
                                messages: updatedMessages as any[],
                                tools,
                                tool_choice: 'auto',
                                temperature: 0.7,
                                max_tokens: 1000,
                                stream: true
                            });
    
                            // Reset accumulated content for follow-up response
                            accumulatedContent = '';
                            buffer = '';
    
                            // Stream the follow-up response
                            for await (const followUpChunk of followUpStream) {
                                const followUpContent = followUpChunk.choices[0]?.delta?.content || '';
                                if (followUpContent) {
                                    buffer += followUpContent;
                                    accumulatedContent += followUpContent;
    
                                    if (buffer.match(/[.!?]\s/) || buffer.length > 50) {
                                        const toSend = buffer;
                                        buffer = '';
                                        yield {
                                            type: 'content',
                                            content: toSend
                                        };
                                    }
                                }
                            }
    
                        } catch (error) {
                            logger.error('Error executing tool call', { error, toolCall: currentToolCall });
                            yield {
                                type: 'tool_result',
                                content: JSON.stringify({ error: 'Tool execution failed' }),
                                toolCallId: currentToolCall.id
                            };
                        }
    
                        currentToolCall = null;
                    }
                }
            }
    
            // Send any remaining content
            if (buffer) {
                yield {
                    type: 'content',
                    content: buffer
                };
            }
    
            // Add final assistant message
            if (accumulatedContent) {
                this.addAssistantMessage(sessionId, { 
                    content: accumulatedContent,
                    timestamp: new Date().toISOString()
                });
            }
    
            logger.info('Stream completed', { 
                sessionId,
                contentLength: accumulatedContent.length
            });
    
        } catch (error) {
            logger.error('Error in streamMessage', {
                error: error instanceof Error ? error.message : 'Unknown error',
                sessionId
            });
            throw error;
        }
    }

    private initializeMessageHistory(): Message[] {
        const salesforceObjects = this.configManager.getProviderObjects('salesforce').map(obj => `'${obj}'`).join(', ');
        return [{
            role: 'system',
            content: `You are an AI assistant that can use various tools to help answer questions and perform tasks.
You can fetch, update, and create Salesforce records for the following objects: ${salesforceObjects}.
You can also fetch emails and send emails from Google Mail.
Use the 'fetch_entity' tool for Salesforce data and the 'fetch_emails' tool for emails, and 'send_email' to send.
Use the 'create_entity' tool and 'update_entity' tool for creating and making changes.
Always use the correct tool and object names when making tool calls.

Important guidelines:
1. The required fields must be included in update requests, even if they aren't changing.
2. Account, Deal, and Article updates require the Name/Title field to match the identifier (use 'name').
3. Contact and Lead updates require the Email field to match the identifier (use 'email').
4. Case updates require the CaseNumber field to match the identifier.

If uncertain about fields, include them to ensure all required data is present.
Always structure tool call responses in a clear, user-friendly format.`
        }];
    }

    private addUserMessage(sessionId: string, message: string) {
        const history = this.messageHistory.get(sessionId);
        if (history) {
            history.push({
                role: 'user',
                content: message,
                timestamp: new Date().toISOString()
            });
            logger.debug('Added user message to history', { sessionId });
        }
    }

    private addAssistantMessage(sessionId: string, message: any) {
        const history = this.messageHistory.get(sessionId);
        if (history) {
            history.push({
                role: 'assistant',
                content: message.content || '',
                tool_calls: message.tool_calls,
                timestamp: message.timestamp || new Date().toISOString()
            });
            logger.debug('Added assistant message to history', { sessionId });
        }
    }

    private addToolMessage(sessionId: string, toolCallId: string, name: string, result: any) {
        const history = this.messageHistory.get(sessionId);
        if (history) {
            const content = typeof result === 'string' ? result : JSON.stringify(result);
            history.push({
                role: 'tool',
                tool_call_id: toolCallId,
                name,
                content,
                timestamp: new Date().toISOString()
            });
            logger.debug('Added tool message to history', { sessionId, toolCallId, name });
        }
    }

    private isContextLimitExceeded(sessionId: string): boolean {
        const history = this.messageHistory.get(sessionId);
        if (!history) return false;

        const tokenCount = this.estimateTokenCount(history);
        logger.debug('Checking context limit', { sessionId, tokenCount, limit: this.contextLimit });
        return tokenCount > this.contextLimit;
    }

    private estimateTokenCount(messages: Message[]): number {
        return messages.reduce((count, message) => {
            const contentLength = message.content?.length || 0;
            const toolCallsLength = JSON.stringify(message.tool_calls || '').length;
            return count + Math.ceil((contentLength + toolCallsLength) / 4);
        }, 0);
    }

    private async summarizeConversation(sessionId: string) {
        const history = this.messageHistory.get(sessionId);
        if (!history) return;

        try {
            const summary = await summarizeConversation(history);
            logger.info('Conversation summarized', { sessionId });

            this.messageHistory.set(sessionId, [
                {
                    role: 'system',
                    content: `Previous conversation summary: ${summary}\n\n${history[0].content}`,
                    timestamp: new Date().toISOString()
                }
            ]);
        } catch (error) {
            logger.error('Error summarizing conversation', {
                error: error instanceof Error ? error.message : 'Unknown error',
                sessionId
            });
            this.messageHistory.set(sessionId, [
                history[0],
                ...history.slice(-3)
            ]);
        }
    }

    private async runConversation(
        sessionId: string,
        tools: any[],
        connectionId: string,
        provider: string
    ): Promise<string> {
        try {
            const messages = this.messageHistory.get(sessionId) || [];
            logger.info('Running conversation', { 
                sessionId, 
                messageCount: messages.length 
            });

            const response = await this.client.chat.completions.create({
                model: 'llama-3.1-70b-versatile',
                messages: messages as any[],
                tools,
                tool_choice: 'auto',
                temperature: 0.7,
                max_tokens: 1000,
            });

            const message = response.choices[0].message;
            logger.info('Received response from Groq', {
                hasToolCalls: !!message.tool_calls,
                contentLength: message.content?.length
            });

            if (message.tool_calls && message.tool_calls.length > 0) {
                this.addAssistantMessage(sessionId, message);

                for (const toolCall of message.tool_calls) {
                    if (!toolCall.function || !this.toolServiceProvider) {
                        throw new Error('Invalid tool call or ToolServiceProvider not set');
                    }

                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);
                    
                    logger.info('Executing tool call', { 
                        functionName, 
                        functionArgs 
                    });

                    const toolResult = await this.toolServiceProvider.executeToolCall(
                        functionName,
                        functionArgs,
                        sessionId,
                        connectionId,
                        provider
                    );

                    logger.info('Tool call completed', { 
                        functionName,
                        success: !!toolResult 
                    });

                    this.addToolMessage(sessionId, toolCall.id, functionName, toolResult);
                }

                // Get follow-up response after tool calls
                const followUpResponse = await this.runConversation(
                    sessionId,
                    tools,
                    connectionId,
                    provider
                );
                return followUpResponse;
            } else if (message.content) {
                this.addAssistantMessage(sessionId, {
                    content: message.content,
                    timestamp: new Date().toISOString()
                });
                return message.content;
            } else {
                logger.warn('No content in response', { sessionId });
                return "I apologize, but I couldn't generate a response. Please try rephrasing your question.";
            }
        } catch (error) {
            logger.error('Error in runConversation', {
                error: error instanceof Error ? error.message : 'Unknown error',
                sessionId
            });
            throw error;
        }
    }

    public async generateEmailContent(args: Record<string, any>): Promise<any> {
        try {
            return await generateEmailContentUtil(this.client, args);
        } catch (error) {
            logger.error('Error generating email content', {
                error: error instanceof Error ? error.message : 'Unknown error',
                args
            });
            throw error;
        }
    }
}

export default GroqService;