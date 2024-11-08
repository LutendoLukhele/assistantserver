// @generated by protobuf-ts 2.9.4
// @generated from protobuf file "assistant.proto" (package "assistant", syntax proto3)
// tslint:disable
import type { RpcTransport } from "@protobuf-ts/runtime-rpc";
import type { ServiceInfo } from "@protobuf-ts/runtime-rpc";
import { AssistantService } from "./assistant";
import type { HistoryResponse } from "./assistant";
import type { HistoryRequest } from "./assistant";
import type { MessageResponse } from "./assistant";
import type { MessageRequest } from "./assistant";
import type { UnaryCall } from "@protobuf-ts/runtime-rpc";
import { stackIntercept } from "@protobuf-ts/runtime-rpc";
import type { ServerMessage } from "./assistant";
import type { ClientMessage } from "./assistant";
import type { DuplexStreamingCall } from "@protobuf-ts/runtime-rpc";
import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
/**
 * Main Assistant Service definition
 *
 * @generated from protobuf service assistant.AssistantService
 */
export interface IAssistantServiceClient {
    /**
     * Stream for real-time message exchange
     *
     * @generated from protobuf rpc: StreamConversation(stream assistant.ClientMessage) returns (stream assistant.ServerMessage);
     */
    streamConversation(options?: RpcOptions): DuplexStreamingCall<ClientMessage, ServerMessage>;
    /**
     * Single message exchange
     *
     * @generated from protobuf rpc: SendMessage(assistant.MessageRequest) returns (assistant.MessageResponse);
     */
    sendMessage(input: MessageRequest, options?: RpcOptions): UnaryCall<MessageRequest, MessageResponse>;
    /**
     * Get conversation history
     *
     * @generated from protobuf rpc: GetConversationHistory(assistant.HistoryRequest) returns (assistant.HistoryResponse);
     */
    getConversationHistory(input: HistoryRequest, options?: RpcOptions): UnaryCall<HistoryRequest, HistoryResponse>;
}
/**
 * Main Assistant Service definition
 *
 * @generated from protobuf service assistant.AssistantService
 */
export class AssistantServiceClient implements IAssistantServiceClient, ServiceInfo {
    typeName = AssistantService.typeName;
    methods = AssistantService.methods;
    options = AssistantService.options;
    constructor(private readonly _transport: RpcTransport) {
    }
    /**
     * Stream for real-time message exchange
     *
     * @generated from protobuf rpc: StreamConversation(stream assistant.ClientMessage) returns (stream assistant.ServerMessage);
     */
    streamConversation(options?: RpcOptions): DuplexStreamingCall<ClientMessage, ServerMessage> {
        const method = this.methods[0], opt = this._transport.mergeOptions(options);
        return stackIntercept<ClientMessage, ServerMessage>("duplex", this._transport, method, opt);
    }
    /**
     * Single message exchange
     *
     * @generated from protobuf rpc: SendMessage(assistant.MessageRequest) returns (assistant.MessageResponse);
     */
    sendMessage(input: MessageRequest, options?: RpcOptions): UnaryCall<MessageRequest, MessageResponse> {
        const method = this.methods[1], opt = this._transport.mergeOptions(options);
        return stackIntercept<MessageRequest, MessageResponse>("unary", this._transport, method, opt, input);
    }
    /**
     * Get conversation history
     *
     * @generated from protobuf rpc: GetConversationHistory(assistant.HistoryRequest) returns (assistant.HistoryResponse);
     */
    getConversationHistory(input: HistoryRequest, options?: RpcOptions): UnaryCall<HistoryRequest, HistoryResponse> {
        const method = this.methods[2], opt = this._transport.mergeOptions(options);
        return stackIntercept<HistoryRequest, HistoryResponse>("unary", this._transport, method, opt, input);
    }
}
