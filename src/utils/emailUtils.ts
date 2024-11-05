import { Groq } from 'groq-sdk';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'EmailUtils' },
    transports: [
        new winston.transports.Console(),
    ],
});



export interface EmailData {
    sender: string;
    recipients: string;
    date: string;
    subject: string;
    body: string;
}

export function cleanAndFormatEmails(emails: EmailData[]): string[] {
    logger.info(`Formatting ${emails.length} emails`);
    
    return emails.map(email => {
        const cleaned = cleanEmailContent(email);
        return formatEmailString(cleaned);
    });
}

function cleanEmailContent(email: EmailData): EmailData {
    return {
        ...email,
        subject: cleanText(email.subject, 100),
        body: cleanText(email.body, 300, true)
    };
}

function cleanText(text: string, maxLength: number, isBody: boolean = false): string {
    // Remove URLs
    text = text.replace(/https?:\/\/\S+/g, '')
               .replace(/\(https?:\/\/\S+\)/g, '');

    // Remove email footers and boilerplate
    if (isBody) {
        text = text.replace(/Unsubscribe[\s\S]*$/i, '')
                   .replace(/Manage preferences[\s\S]*$/i, '')
                   .replace(/This email was sent by[\s\S]*$/i, '');
    }

    // Remove special characters except basic punctuation
    text = text.replace(/[^\w\s.,!?;:@-]/g, '');

    // Remove extra whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Truncate if necessary
    if (text.length > maxLength) {
        text = text.slice(0, maxLength - 3) + '...';
    }

    return text;
}

function formatEmailString(email: EmailData): string {
    return `
From: ${email.sender}
To: ${email.recipients}
Date: ${email.date}
Subject: ${email.subject}

${email.body}

-------------------------------------------`.trim();
}


export const generateEmailContent = async (groqClient: Groq, args: Record<string, any>): Promise<any> => {
    try {
        const prompt = `
Generate an email with the following details:
- To: ${args.to}
- Subject: ${args.subject}
- Purpose: ${args.user_query}

Please provide the email body in a professional tone.
        `;

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: 'You are an AI assistant tasked with generating email content.' },
            { role: 'user', content: prompt },
        ];

        const response = await groqClient.chat.completions.create({
            model: 'llama-3.1-70b-versatile',
            messages: messages,
            max_tokens: 1000,
            temperature: 0.7,
        });

        const generatedBody = response.choices[0]?.message?.content?.trim() ?? '';

        return {
            subject: args.subject,
            body: generatedBody,
        };
    } catch (error: any) {
        logger.error(`Error in generateEmailContent: ${error.message}`);
        throw new Error(`Error in generateEmailContent: ${error.message}`);
    }
};