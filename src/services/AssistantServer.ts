import {
  ServerUnaryCall,
  sendUnaryData,
  ServerDuplexStream,
  status
} from '@grpc/grpc-js';

// Import from the correct location (adjust path as needed)
import {
  ClientMessage,
  ServerMessage,
  MessageRequest,
  MessageResponse,
  HistoryRequest,
  HistoryResponse,
  MessageType,
  MessageStatus,
} from '../generated/assistant';

import * as path from 'path';
import { GroqService } from './GroqService';
import { ToolConfigManager } from './ToolConfigManager';

interface HistoryContent {
  content: string;
  timestamp: number;
}

export class AssistantServer {
  private groqService: GroqService;

  constructor() {
      const configPath = path.resolve(__dirname, '../config/toolConfig.json');
      const configManager = new ToolConfigManager(configPath);
      const apiKey = process.env.GROQ_API_KEY || '';
      this.groqService = new GroqService(apiKey, configManager);
  }

  /**
   * Handles bidirectional streaming for conversations.
   */
  async streamConversation(
      call: ServerDuplexStream<ClientMessage, ServerMessage>
  ): Promise<void> {
      console.log('streamConversation invoked.');

      call.on('data', async (clientMessage: ClientMessage) => {
          console.log('Received ClientMessage:', clientMessage);

          try {
              const responseContent = await this.groqService.sendMessage(
                  clientMessage.content,
                  clientMessage.sessionId,
                  clientMessage.connectionId,
                  clientMessage.provider
              );

              const serverMessage: ServerMessage = {
                  messageId: `resp-${clientMessage.messageId}`,
                  content: responseContent,
                  type: MessageType.MESSAGE_TYPE_ASSISTANT,
                  toolCalls: [],
                  sessionId: clientMessage.sessionId,
                  timestamp: BigInt(Date.now()),
                  status: MessageStatus.MESSAGE_STATUS_COMPLETE,
              };

              call.write(serverMessage);
              console.log('Sent ServerMessage:', serverMessage);
          } catch (error) {
              console.error('Error processing message:', error);

              const errorMessage: ServerMessage = {
                  messageId: `error-${clientMessage.messageId}`,
                  content: `Error processing message: ${error}`,
                  type: MessageType.MESSAGE_TYPE_SYSTEM,
                  toolCalls: [],
                  sessionId: clientMessage.sessionId,
                  timestamp: BigInt(Date.now()),
                  status: MessageStatus.MESSAGE_STATUS_ERROR,
              };

              call.write(errorMessage);
              call.end();
          }
      });

      call.on('end', () => {
          console.log('streamConversation ended.');
          call.end();
      });

      call.on('error', (error) => {
          console.error('streamConversation error:', error);
      });
  }

  /**
   * Handles SendMessage unary RPC.
   */
  async sendMessage(
      call: ServerUnaryCall<MessageRequest, MessageResponse>,
      callback: sendUnaryData<MessageResponse>
  ): Promise<void> {
      const request = call.request;
      console.log('SendMessage request:', request);

      try {
          const responseContent = await this.groqService.sendMessage(
              request.content,
              request.sessionId,
              request.connectionId,
              request.provider
          );

          const response: MessageResponse = {
              messageId: `msg-${Date.now()}`,
              content: responseContent,
              toolCalls: [],
              status: MessageStatus.MESSAGE_STATUS_COMPLETE
          };

          callback(null, response);
          console.log('SendMessage response:', response);
      } catch (error) {
          console.error('sendMessage error:', error);

          callback({
              code: status.INTERNAL,
              message: 'Internal server error',
              name: 'Internal Error',
          }, null);
      }
  }

  /**
   * Handles GetConversationHistory unary RPC.
   */
  async getConversationHistory(
      call: ServerUnaryCall<HistoryRequest, HistoryResponse>,
      callback: sendUnaryData<HistoryResponse>
  ): Promise<void> {
      const request = call.request;
      console.log('GetConversationHistory request:', request);

      try {
          // Assuming getConversationHistory is the correct method name in GroqService
          const historyContents: HistoryContent[] = await this.groqService.getConversationHistory(request.sessionId);

          const historyMessages: ServerMessage[] = historyContents.map((content: HistoryContent, index: number) => ({
              messageId: `hist-${index}`,
              content: content.content,
              type: MessageType.MESSAGE_TYPE_ASSISTANT,
              toolCalls: [],
              sessionId: request.sessionId,
              timestamp: BigInt(content.timestamp),
              status: MessageStatus.MESSAGE_STATUS_COMPLETE,
          }));

          const response: HistoryResponse = {
              messages: historyMessages,
              hasMore: false
          };

          callback(null, response);
          console.log('GetConversationHistory response:', response);
      } catch (error) {
          console.error('getConversationHistory error:', error);

          callback({
              code: status.INTERNAL,
              message: 'Internal server error',
              name: 'Internal Error',
          }, null);
      }
  }
}