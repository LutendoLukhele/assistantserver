import { Nango } from '@nangohq/node';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'NangoService' },
    transports: [
        new winston.transports.Console(),
    ],
});

export class NangoService {
    private nango: Nango;
    private connectionId: string = 'test-connection-id';

    constructor(secretKey: string) {
        if (!secretKey) {
            throw new Error('Nango secret key is required');
        }
        
        this.nango = new Nango({ secretKey });
        logger.info('Nango SDK initialized');
    }

    public setConnectionId(connectionId: string) {
        this.connectionId = connectionId;
        logger.info('Connection ID set', { connectionId });
    }

    public async fetchEmails(providerConfigKey: string): Promise<any> {
        try {
            logger.info('Fetching emails', { 
                connectionId: this.connectionId, 
                providerConfigKey 
            });

            const response = await this.nango.triggerAction(
                providerConfigKey,
                this.connectionId,
                'fetch-emails'
            );

            logger.info('Emails fetched successfully');
            return response;
        } catch (error: any) {
            logger.error('Error fetching emails', { error });
            throw new Error(`Error fetching emails: ${error.message}`);
        }
    }

    public async sendEmail(
        providerConfigKey: string,
        emailData: Record<string, any>
    ): Promise<any> {
        try {
            logger.info('Sending email', { 
                connectionId: this.connectionId, 
                providerConfigKey 
            });

            const response = await this.nango.triggerAction(
                providerConfigKey,
                this.connectionId,
                'send-email',
                emailData
            );

            logger.info('Email sent successfully');
            return response;
        } catch (error: any) {
            logger.error('Error sending email', { error });
            throw new Error(`Error sending email: ${error.message}`);
        }
    }

    public async fetchEntity(
        providerConfigKey: string,
        entityType: string
    ): Promise<any> {
        try {
            logger.info('Fetching entity', { 
                connectionId: this.connectionId, 
                providerConfigKey,
                entityType 
            });

            const response = await this.nango.triggerAction(
                providerConfigKey,
                this.connectionId,
                'fetch-entity',
                { entityType }
            );

            logger.info('Entity fetched successfully');
            return response;
        } catch (error: any) {
            logger.error('Error fetching entity', { error });
            throw new Error(`Error fetching entity: ${error.message}`);
        }
    }

    public async createEntity(
        providerConfigKey: string,
        entityType: string,
        fields: Record<string, any>
    ): Promise<any> {
        try {
            logger.info('Creating entity', { 
                connectionId: this.connectionId, 
                providerConfigKey,
                entityType 
            });

            const response = await this.nango.triggerAction(
                providerConfigKey,
                this.connectionId,
                'create-entity',
                {
                    entityType,
                    fields
                }
            );

            logger.info('Entity created successfully');
            return response;
        } catch (error: any) {
            logger.error('Error creating entity', { error });
            throw new Error(`Error creating entity: ${error.message}`);
        }
    }

    public async updateEntity(
        providerConfigKey: string,
        entityType: string,
        identifier: string,
        fields: Record<string, any>
    ): Promise<any> {
        try {
            logger.info('Updating entity', { 
                connectionId: this.connectionId, 
                providerConfigKey,
                entityType,
                identifier 
            });

            const response = await this.nango.triggerAction(
                providerConfigKey,
                this.connectionId,
                'update-entity',
                {
                    entityType,
                    identifier,
                    fields
                }
            );

            logger.info('Entity updated successfully');
            return response;
        } catch (error: any) {
            logger.error('Error updating entity', { error });
            throw new Error(`Error updating entity: ${error.message}`);
        }
    }

    public async getConnectionDetails(): Promise<any> {
        try {
            logger.info('Fetching connection details', { 
                connectionId: this.connectionId 
            });

            const response = await this.nango.getConnection(
                'google-mail', // providerConfigKey
                this.connectionId
            );

            logger.info('Connection details fetched successfully');
            return response;
        } catch (error: any) {
            logger.error('Error fetching connection details', { error });
            throw new Error(`Error fetching connection details: ${error.message}`);
        }
    }
}