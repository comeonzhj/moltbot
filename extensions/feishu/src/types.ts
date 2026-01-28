import type { FeishuAccountConfig } from "./config-schema.js";

export interface FeishuUser {
  user_id: string;
  open_id: string;
  union_id?: string;
  name?: string;
  avatar?: string;
}

export interface FeishuGroup {
  chat_id: string;
  name?: string;
  avatar?: string;
  description?: string;
}

export interface FeishuMessage {
  message_id: string;
  chat_id: string;
  sender: {
    sender_id: {
      open_id: string;
      user_id?: string;
      union_id?: string;
    };
    sender_type: string;
    tenant_key?: string;
  };
  create_time: string;
  update_time?: string;
  chat_type: "p2p" | "group";
  message_type: string;
  content: string;
  mentions?: Array<{
    key: string;
    id: {
      open_id: string;
      user_id?: string;
    };
    name: string;
    tenant_key?: string;
  }>;
  parent_id?: string;
  root_id?: string;
}

export interface FeishuEvent {
  schema: "2.0";
  header: {
    event_id: string;
    token: string;
    create_time: string;
    event_type: string;
    tenant_key: string;
    app_id: string;
  };
  event?: {
    sender?: FeishuMessage["sender"];
    message?: FeishuMessage;
    [key: string]: unknown;
  };
  challenge?: string;
}

export interface FeishuTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

export interface FeishuSendMessageResponse {
  code: number;
  msg: string;
  data?: {
    message_id: string;
  };
}

export interface FeishuBotInfoResponse {
  code: number;
  msg: string;
  bot?: {
    activate_status: number;
    app_name: string;
    avatar_url: string;
    ip_white_list: string[];
    open_id: string;
  };
}

export interface ResolvedFeishuAccount {
  accountId: string;
  name: string | undefined;
  enabled: boolean | undefined;
  appId: string;
  appSecret: string;
  config: FeishuAccountConfig & {
    allowFrom?: Array<string | number>;
    groupAllowFrom?: Array<string | number>;
    groups?: Record<string, { requireMention?: boolean; allowFrom?: Array<string | number> }>;
  };
  tokenSource: "config" | "env" | "file" | "none";
}

export interface FeishuSendOptions {
  accountId?: string;
  messageType?: string;
  chatId?: string;
  parentId?: string;
  rootId?: string;
}
