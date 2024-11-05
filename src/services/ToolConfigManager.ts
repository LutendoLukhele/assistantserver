import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { z } from 'zod';
import { ToolConfig, ProviderConfig, EntityType } from '../types/tool.types';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'ToolConfigManager' },
    transports: [
        new winston.transports.Console(),
    ],
});

export class ToolConfigManager {
    private configFilePath: string;
    private tools: Record<string, ToolConfig>;
    private providers: Record<string, ProviderConfig>;
    private objects: Record<string, string[]>;

    constructor(configFilePath: string) {
        this.configFilePath = configFilePath;
        this.tools = {};
        this.providers = {};
        this.objects = {};
        this.loadConfig();
    }

    private loadConfig() {
        try {
            logger.info(`Loading configuration from ${this.configFilePath}`);
            const configData = JSON.parse(fs.readFileSync(path.resolve(this.configFilePath), 'utf-8'));
            logger.info('Successfully loaded configuration file', { config: configData });

            configData.tools.forEach((tool: ToolConfig) => {
                this.tools[tool.name] = tool;
            });

            Object.entries(configData.providers).forEach(([providerName, providerData]: [string, any]) => {
                this.providers[providerName] = providerData as ProviderConfig;
                this.objects[providerName] = providerData.objects;
            });
        } catch (error: any) {
            logger.error(`Error loading configuration: ${error.message}`, { error });
            throw new Error(`Error loading configuration: ${error.message}`);
        }
    }

    public validateToolArgs(toolName: string, args: Record<string, any>): Record<string, any> {
        logger.info(`Validating arguments for tool ${toolName}`, { args });
        const toolConfig = this.getToolConfig(toolName);
        
        try {
            // Create dynamic schema based on tool parameters
            const schema = this.createZodSchema(toolConfig.parameters);
            const validated = schema.parse(args);

            // Specific validations for entity operations
            if (toolName.includes('entity') && 'entityType' in args) {
                this.validateEntityType(args.entityType);
            }

            logger.info(`Validation successful for ${toolName}`, { validated });
            return validated;
        } catch (error: any) {
            logger.error(`Validation failed for ${toolName}`, { error });
            throw new Error(`Invalid arguments for tool '${toolName}': ${error.message}`);
        }
    }

    private createZodSchema(parameters: any): z.ZodObject<any> {
        const schemaShape: Record<string, any> = {};

        Object.entries(parameters.properties).forEach(([key, prop]: [string, any]) => {
            let fieldSchema: z.ZodTypeAny;

            switch (prop.type) {
                case 'string':
                    fieldSchema = z.string();
                    if (prop.enum) {
                        fieldSchema = z.enum(prop.enum as [string, ...string[]]);
                    }
                    break;
                case 'integer':
                    fieldSchema = z.number().int();
                    break;
                case 'number':
                    fieldSchema = z.number();
                    break;
                case 'boolean':
                    fieldSchema = z.boolean();
                    break;
                case 'object':
                    fieldSchema = z.record(z.any());
                    break;
                case 'array':
                    fieldSchema = z.array(z.any());
                    break;
                default:
                    fieldSchema = z.any();
            }

            if (!parameters.required?.includes(key)) {
                fieldSchema = fieldSchema.optional();
            }

            schemaShape[key] = fieldSchema;
        });

        return z.object(schemaShape);
    }

    private validateEntityType(entityType: string) {
        if (!Object.values(EntityType).includes(entityType as EntityType)) {
            throw new Error(`Invalid entity type: ${entityType}`);
        }
    }

    public getToolConfig(toolName: string): ToolConfig {
        const tool = this.tools[toolName];
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found in configuration`);
        }
        return tool;
    }

    public getProviderEndpoint(providerName: string): string {
        const provider = this.providers[providerName];
        if (!provider) {
            throw new Error(`Provider '${providerName}' not found in configuration`);
        }
        return provider.endpoint;
    }

    public getProviderConfigKey(providerName: string): string {
        const provider = this.providers[providerName];
        if (!provider) {
            throw new Error(`Provider '${providerName}' not found in configuration`);
        }
        return provider.provider_config_key;
    }

    public getConnectionId(providerName: string): string {
        const provider = this.providers[providerName];
        if (!provider) {
            throw new Error(`Provider '${providerName}' not found in configuration`);
        }
        return provider.connection_id;
    }

    public getProviderObjects(provider: string): string[] {
        return this.objects[provider] || [];
    }

    public getToolDescriptions(): Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: any;
        };
    }> {
        return Object.values(this.tools).map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));
    }
}