import { z } from 'zod';

// Entity Types
export enum EntityType {
    ACCOUNT = 'Account',
    CONTACT = 'Contact',
    DEAL = 'Deal',
    ARTICLE = 'Article',
    CASE = 'Case',
    LEAD = 'Lead'
}

// Tool Configuration Types
export interface ToolConfig {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, ParameterDefinition>;
        required?: string[];
    };
    default_params: Record<string, any>;
}

export interface ParameterDefinition {
    type: 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    enum?: string[];
    format?: string;
    optional?: boolean;
    default?: any;
    items?: {
        type: string;
        enum?: string[];
    };
}

// Provider Configuration
export interface ProviderConfig {
    endpoint: string;
    objects: string[];
    provider_config_key: string;
    connection_id: string;
    scopes?: string[];
}

// Tool Call History
export interface ToolCall {
    id: string;
    sessionId: string;
    toolName: string;
    args: Record<string, any>;
    result: any;
    timestamp: Date;
}

// Email Types
export interface EmailMessage {
    id?: string;
    threadId?: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    date?: string;
    labels?: string[];
}

export interface EmailOptions {
    limit?: number;
    modified_after?: string;
    cursor?: string;
    filter?: Record<string, any>;
    labelIds?: string[];
}

// Entity Schemas
export const AccountSchema = z.object({
    name: z.string(),
    Website: z.string().url().optional(),
    Description: z.string().optional(),
    NumberOfEmployees: z.number().int().positive().optional()
});

export const ContactSchema = z.object({
    LastName: z.string(),
    FirstName: z.string().optional(),
    Email: z.string().email().optional(),
    Phone: z.string().optional(),
    AccountId: z.string().optional()
});

export const DealSchema = z.object({
    Name: z.string(),
    Amount: z.number().positive().optional(),
    StageName: z.string(),
    CloseDate: z.string(),
    AccountId: z.string().optional()
});

export const ArticleSchema = z.object({
    Title: z.string(),
    UrlName: z.string(),
    Summary: z.string().optional()
});

export const CaseSchema = z.object({
    Subject: z.string(),
    Status: z.string(),
    Priority: z.string().optional(),
    Description: z.string().optional(),
    AccountId: z.string().optional(),
    ContactId: z.string().optional(),
    CaseNumber: z.string()
});

export const LeadSchema = z.object({
    LastName: z.string(),
    Company: z.string(),
    FirstName: z.string().optional(),
    Email: z.string().email().optional(),
    Status: z.string().optional(),
    Phone: z.string().optional()
});

// Tool Response Types
export interface ToolResponse<T = any> {
    status: 'success' | 'error';
    data?: T;
    message?: string;
}

export interface EmailToolResponse extends ToolResponse {
    data?: {
        emails: string[];
        count: number;
    };
}

export interface EntityToolResponse extends ToolResponse {
    data?: {
        id?: string;
        fields: Record<string, any>;
        type: EntityType;
    };
}

// Tool Operation Types
export type ToolOperation = 'fetch' | 'create' | 'update';

export interface BaseToolArgs {
    operation?: ToolOperation;
    [key: string]: any;
}

export interface EmailToolArgs extends BaseToolArgs {
    limit?: number;
    modified_after?: string;
    cursor?: string;
    filter?: Record<string, any>;
}

export interface EntityToolArgs extends BaseToolArgs {
    entityType: EntityType;
    identifier?: string;
    fields?: Record<string, any>;
}

// Error Types
export class ToolError extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: any
    ) {
        super(message);
        this.name = 'ToolError';
    }
}

export class ValidationError extends ToolError {
    constructor(message: string, details?: any) {
        super(message, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}

export class ConfigurationError extends ToolError {
    constructor(message: string, details?: any) {
        super(message, 'CONFIGURATION_ERROR', details);
        this.name = 'ConfigurationError';
    }
}

// Tool Chain Types
export interface ToolChain {
    tools: string[];
    context: Record<string, any>;
    sessionId: string;
    connectionId: string;
    provider: string;
}

// Tool History Types
export interface ToolHistory {
    toolCalls: ToolCall[];
    sessionId: string;
    startTime: Date;
    endTime?: Date;
    status: 'running' | 'completed' | 'failed';
    error?: Error;
}

// Utility Types
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type ValidatedArgs<T> = {
    [K in keyof T]: T[K] extends z.ZodType ? z.infer<T[K]> : T[K];
};

// Tool Function Types
export type ToolFunction = (
    args: Record<string, any>,
    context: {
        sessionId: string;
        connectionId: string;
        provider: string;
    }
) => Promise<ToolResponse>;

// Tool Registry Type
export interface ToolRegistry {
    [toolName: string]: {
        function: ToolFunction;
        config: ToolConfig;
    };
}

// Tool Service Types
export interface ToolServiceOptions {
    configPath: string;
    nangoBaseUrl: string;
    nangoSecretKey: string;
    groqApiKey?: string;
}

export interface ToolServiceConfig {
    tools: Record<string, ToolConfig>;
    providers: Record<string, ProviderConfig>;
}