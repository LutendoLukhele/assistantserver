import { z } from 'zod';
import { EntityType } from '../types/tool.types';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'EntityValidation' },
    transports: [
        new winston.transports.Console(),
    ],
});

// Define schemas for each entity type
const AccountSchema = z.object({
    name: z.string(),
    Website: z.string().url().optional(),
    Description: z.string().optional(),
    NumberOfEmployees: z.number().int().positive().optional()
});

const ContactSchema = z.object({
    LastName: z.string(),
    FirstName: z.string().optional(),
    Email: z.string().email().optional(),
    Phone: z.string().optional(),
    AccountId: z.string().optional()
});

const DealSchema = z.object({
    Name: z.string(),
    Amount: z.number().positive().optional(),
    StageName: z.string(),
    CloseDate: z.string(),
    AccountId: z.string().optional()
});

const ArticleSchema = z.object({
    Title: z.string(),
    UrlName: z.string(),
    Summary: z.string().optional()
});

const CaseSchema = z.object({
    Subject: z.string(),
    Status: z.string(),
    Priority: z.string().optional(),
    Description: z.string().optional(),
    AccountId: z.string().optional(),
    ContactId: z.string().optional()
});

const LeadSchema = z.object({
    LastName: z.string(),
    Company: z.string(),
    FirstName: z.string().optional(),
    Email: z.string().email().optional(),
    Status: z.string().optional(),
    Phone: z.string().optional()
});

export async function validateEntityFields(
    entityType: EntityType,
    fields: Record<string, any>,
    operation: 'create' | 'update',
    identifier?: string
): Promise<Record<string, any>> {
    logger.info('Validating entity fields', { entityType, operation, fields });

    const schema = getSchemaForEntityType(entityType);
    
    try {
        // Validate fields against schema
        const validated = await schema.parseAsync(fields);

        // Additional validation for updates
        if (operation === 'update' && identifier) {
            validateIdentifier(entityType, validated, identifier);
        }

        logger.info('Entity fields validated successfully', { validated });
        return validated;
    } catch (error: any) {
        logger.error('Entity validation failed', { error });
        throw new Error(`Entity validation failed: ${error.message}`);
    }
}

function getSchemaForEntityType(entityType: EntityType): z.ZodObject<any> {
    switch (entityType) {
        case EntityType.ACCOUNT:
            return AccountSchema;
        case EntityType.CONTACT:
            return ContactSchema;
        case EntityType.DEAL:
            return DealSchema;
        case EntityType.ARTICLE:
            return ArticleSchema;
        case EntityType.CASE:
            return CaseSchema;
        case EntityType.LEAD:
            return LeadSchema;
        default:
            throw new Error(`Unsupported entity type: ${entityType}`);
    }
}

function validateIdentifier(
    entityType: EntityType,
    fields: Record<string, any>,
    identifier: string
): void {
    switch (entityType) {
        case EntityType.ACCOUNT:
        case EntityType.DEAL:
            if (fields.name !== identifier) {
                throw new Error(`Name must match identifier for ${entityType} updates`);
            }
            break;
        case EntityType.CONTACT:
        case EntityType.LEAD:
            if (fields.Email !== identifier) {
                throw new Error(`Email must match identifier for ${entityType} updates`);
            }
            break;
        case EntityType.ARTICLE:
            if (fields.Title !== identifier) {
                throw new Error('Title must match identifier for Article updates');
            }
            break;
        case EntityType.CASE:
            if (!fields.CaseNumber || fields.CaseNumber !== identifier) {
                throw new Error('CaseNumber must match identifier for Case updates');
            }
            break;
    }
}