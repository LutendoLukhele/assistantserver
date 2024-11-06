import { Nango } from '@nangohq/node';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'NangoService' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({ 
            filename: 'nango-debug.log',
            level: 'debug'
        })
    ],
});

export class NangoService {
    private nango: Nango;
    private connectionId?: string;

    constructor(secretKey: string) {
        if (!secretKey) {
            throw new Error('NANGO_SECRET_KEY is required');
        }
        this.nango = new Nango({ secretKey });
        logger.info('Nango SDK initialized', {
            secretKeyLength: secretKey.length,
            timestamp: new Date().toISOString()
        });
    }

    setConnectionId(connectionId: string) {
        this.connectionId = connectionId;
        logger.info('Connection ID set', { 
            connectionId,
            timestamp: new Date().toISOString()
        });
    }

    private validateConnection() {
        if (!this.connectionId) {
            throw new Error('Connection ID not set');
        }
    }

    private logActionAttempt(actionName: string, providerConfigKey: string, args: any = {}) {
        logger.debug('Attempting Nango action', {
            action: actionName,
            providerConfigKey,
            connectionId: this.connectionId,
            args: JSON.stringify(args),
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        });
    }

    async fetchEmails(providerConfigKey: string, args: Record<string, any> = {}): Promise<any> {
        try {
            this.validateConnection();
            this.logActionAttempt('fetch-emails', providerConfigKey, args);

            const response = await this.nango.triggerAction(
                providerConfigKey,
                this.connectionId!,
                'fetch-emails',
                args
            );

            logger.debug('Email fetch response received', {
                action: 'fetch-emails',
                success: true,
                responseType: typeof response,
                dataSnapshotLength: JSON.stringify(response).length,
                timestamp: new Date().toISOString()
            });

            return response;

        } catch (error: any) {
            logger.error('Error in fetchEmails', {
                error: {
                    message: error.message,
                    name: error.name,
                    code: error.code,
                    response: error.response?.data
                },
                context: {
                    providerConfigKey,
                    connectionId: this.connectionId,
                    timestamp: new Date().toISOString()
                }
            });
            throw error;
        }
    }

    async sendEmail(providerConfigKey: string, emailData: any): Promise<any> {
        try {
            this.validateConnection();
            this.logActionAttempt('send-email', providerConfigKey, {
                to: emailData.to,
                subject: emailData.subject,
                hasBody: !!emailData.body
            });

            const response = await this.nango.triggerAction(
                providerConfigKey,
                this.connectionId!,
                'send-email',
                emailData
            );

            logger.info('Email sent successfully', {
                to: emailData.to,
                subject: emailData.subject,
                timestamp: new Date().toISOString()
            });

            return response;

        } catch (error: any) {
            logger.error('Error in sendEmail', {
                error: {
                    message: error.message,
                    name: error.name,
                    code: error.code,
                    response: error.response?.data
                },
                context: {
                    to: emailData.to,
                    subject: emailData.subject,
                    providerConfigKey,
                    timestamp: new Date().toISOString()
                }
            });
            throw error;
        }
    }

    async fetchEntity(providerConfigKey: string, entityType: string): Promise<any> {
        try {
            this.validateConnection();
            this.logActionAttempt('fetch-entity', providerConfigKey, { entityType });

            const response = await this.nango.triggerAction(
                providerConfigKey,
                this.connectionId!,
                'fetch-entity',
                { entityType }
            );

            logger.debug('Entity fetch response received', {
                action: 'fetch-entity',
                entityType,
                success: true,
                responseType: typeof response,
                timestamp: new Date().toISOString()
            });

            return response;

        } catch (error: any) {
            logger.error('Error in fetchEntity', {
                error: {
                    message: error.message,
                    name: error.name,
                    code: error.code,
                    response: error.response?.data
                },
                context: {
                    entityType,
                    providerConfigKey,
                    timestamp: new Date().toISOString()
                }
            });
            throw error;
        }
    }

    async updateEntity(
        providerConfigKey: string, 
        entityType: string, 
        identifier: string, 
        fields: Record<string, any>
    ): Promise<any> {
        try {
            this.validateConnection();
            this.logActionAttempt('update-entity', providerConfigKey, {
                entityType,
                identifier,
                fieldsKeys: Object.keys(fields)
            });

            const response = await this.nango.triggerAction(
                providerConfigKey,
                this.connectionId!,
                'update-entity',
                {
                    entityType,
                    identifier,
                    fields
                }
            );

            logger.debug('Entity update response received', {
                action: 'update-entity',
                entityType,
                identifier,
                success: true,
                timestamp: new Date().toISOString()
            });

            return response;

        } catch (error: any) {
            logger.error('Error in updateEntity', {
                error: {
                    message: error.message,
                    name: error.name,
                    code: error.code,
                    response: error.response?.data
                },
                context: {
                    entityType,
                    identifier,
                    providerConfigKey,
                    timestamp: new Date().toISOString()
                }
            });
            throw error;
        }
    }

    async createEntity(
        providerConfigKey: string, 
        entityType: string, 
        fields: Record<string, any>
    ): Promise<any> {
        try {
            this.validateConnection();
            this.logActionAttempt('create-entity', providerConfigKey, {
                entityType,
                fieldsKeys: Object.keys(fields)
            });

            const response = await this.nango.triggerAction(
                providerConfigKey,
                this.connectionId!,
                'create-entity',
                {
                    entityType,
                    fields
                }
            );

            logger.debug('Entity creation response received', {
                action: 'create-entity',
                entityType,
                success: true,
                timestamp: new Date().toISOString()
            });

            return response;

        } catch (error: any) {
            logger.error('Error in createEntity', {
                error: {
                    message: error.message,
                    name: error.name,
                    code: error.code,
                    response: error.response?.data
                },
                context: {
                    entityType,
                    providerConfigKey,
                    timestamp: new Date().toISOString()
                }
            });
            throw error;
        }
    }
}