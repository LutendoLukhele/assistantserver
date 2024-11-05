import { ToolConfigManager } from './ToolConfigManager';
import { NangoService } from './NangoService';
import { GroqService } from './GroqService';
import winston from 'winston';
import { ToolCall, EntityType } from '../types/tool.types';
import { addToolCall } from '../storage/DataStore';
import { generateUniqueId } from '../utils/generateUniqueId';
import { cleanAndFormatEmails } from '../utils/emailUtils';
import { validateEntityFields } from '../utils/entityValidation';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'ToolServiceProvider' },
    transports: [
        new winston.transports.Console(),
    ],
});

export class ToolServiceProvider {
    private configManager: ToolConfigManager;
    private nangoService: NangoService;
    private groqService?: GroqService;

    constructor(configManager: ToolConfigManager, nangoService: NangoService) {
        this.configManager = configManager;
        this.nangoService = nangoService;
    }

    public setGroqService(groqService: GroqService) {
        this.groqService = groqService;
    }

    public async executeToolCall(
        toolName: string,
        toolArgs: Record<string, any>,
        sessionId: string,
        connectionId: string,
        provider: string
    ): Promise<any> {
        try {
            logger.info('Executing tool call', {
                toolName,
                toolArgs,
                sessionId,
                connectionId,
                provider
            });

            // Set the connection ID for this request
            this.nangoService.setConnectionId(connectionId);

            const toolConfig = this.configManager.getToolConfig(toolName);
            logger.info('Tool configuration', { toolConfig });

            const validatedArgs = this.configManager.validateToolArgs(toolName, toolArgs);
            logger.info('Arguments validated successfully', { validatedArgs });

            let result;
            switch (toolName) {
                case 'fetch_emails':
                    result = await this.fetchEmails();
                    break;
                case 'send_email':
                    result = await this.sendEmail(validatedArgs);
                    break;
                case 'fetch_entity':
                    result = await this.fetchEntity(validatedArgs);
                    break;
                case 'update_entity':
                    result = await this.updateEntity(validatedArgs);
                    break;
                case 'create_entity':
                    result = await this.createEntity(validatedArgs);
                    break;
                default:
                    throw new Error(`Unsupported tool: ${toolName}`);
            }

            const toolCall: ToolCall = {
                id: generateUniqueId(),
                sessionId,
                toolName,
                args: toolArgs,
                result,
                timestamp: new Date(),
            };
            await addToolCall(toolCall);

            logger.info('Tool call completed successfully', {
                toolName,
                result
            });

            return result;
        } catch (error: any) {
            logger.error('Error executing tool call', {
                toolName,
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Error executing tool call: ${error.message}`);
        }
    }

    private async fetchEmails(): Promise<any> {
        try {
            logger.info('Fetching emails');
            const response = await this.nangoService.fetchEmails('google-mail');

            logger.info('Received email response', { 
                responseType: typeof response,
                isArray: Array.isArray(response),
                count: Array.isArray(response) ? response.length : 0
            });

            if (Array.isArray(response)) {
                const formattedEmails = cleanAndFormatEmails(response);
                return {
                    status: 'success',
                    data: {
                        emails: formattedEmails,
                        count: formattedEmails.length
                    }
                };
            }

            return {
                status: 'success',
                data: response
            };
        } catch (error: any) {
            logger.error('Error in fetchEmails', { error });
            throw new Error(`Error fetching emails: ${error.message}`);
        }
    }

    private async sendEmail(args: Record<string, any>): Promise<any> {
        if (!this.groqService) {
            throw new Error('GroqService not set. Call setGroqService() first.');
        }

        try {
            logger.info('Generating email content', { args });
            const emailContent = await this.groqService.generateEmailContent(args);

            logger.info('Sending email', { emailContent });
            const emailData = {
                to: args.to,
                subject: args.subject,
                body: emailContent.body,
                headers: args.headers
            };

            const response = await this.nangoService.sendEmail(
                'google-mail',
                emailData
            );

            return {
                status: 'success',
                data: {
                    id: response.id,
                    threadId: response.threadId,
                    generated_body: emailContent.body
                }
            };
        } catch (error: any) {
            logger.error('Error in sendEmail', { error });
            throw new Error(`Error sending email: ${error.message}`);
        }
    }

    private async fetchEntity(args: Record<string, any>): Promise<any> {
        try {
            logger.info('Fetching entity', { args });
            
            const entityType = args.entityType as EntityType;
            
            const response = await this.nangoService.fetchEntity(
                'salesforce',
                entityType
            );

            return {
                status: 'success',
                data: response
            };
        } catch (error: any) {
            logger.error('Error in fetchEntity', { error });
            throw new Error(`Error fetching entity: ${error.message}`);
        }
    }

    private async updateEntity(args: Record<string, any>): Promise<any> {
        try {
            logger.info('Updating entity', { args });
            
            const entityType = args.entityType as EntityType;
            const { identifier, fields } = args;

            const validatedFields = await validateEntityFields(entityType, fields, 'update', identifier);

            const response = await this.nangoService.updateEntity(
                'salesforce',
                entityType,
                identifier,
                validatedFields
            );

            return {
                status: 'success',
                data: response
            };
        } catch (error: any) {
            logger.error('Error in updateEntity', { error });
            throw new Error(`Error updating entity: ${error.message}`);
        }
    }

    private async createEntity(args: Record<string, any>): Promise<any> {
        try {
            logger.info('Creating entity', { args });
            
            const entityType = args.entityType as EntityType;
            const { fields } = args;

            const validatedFields = await validateEntityFields(entityType, fields, 'create');

            const response = await this.nangoService.createEntity(
                'salesforce',
                entityType,
                validatedFields
            );

            return {
                status: 'success',
                data: response
            };
        } catch (error: any) {
            logger.error('Error in createEntity', { error });
            throw new Error(`Error creating entity: ${error.message}`);
        }
    }
}