import type {
  FeishuBotInfoResponse,
  FeishuSendMessageResponse,
  FeishuTokenResponse,
} from "./types.js";

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

export interface FeishuApiClient {
  getTenantAccessToken(): Promise<string>;
  sendMessage(
    receiveId: string,
    content: string,
    receiveIdType?: "open_id" | "user_id" | "union_id" | "chat_id",
    msgType?: string,
  ): Promise<FeishuSendMessageResponse>;
  replyMessage(
    messageId: string,
    content: string,
    msgType?: string,
  ): Promise<FeishuSendMessageResponse>;
  getBotInfo(): Promise<FeishuBotInfoResponse>;
}

export function createFeishuApiClient(
  appId: string,
  appSecret: string,
  fetcher: typeof fetch = fetch,
): FeishuApiClient {
  let cachedToken: string | null = null;
  let tokenExpiry: number = 0;

  async function getTenantAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5 min buffer)
    if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
      return cachedToken;
    }

    const response = await fetcher(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get tenant access token: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as FeishuTokenResponse;

    if (data.code !== 0) {
      throw new Error(`Feishu auth error: ${data.msg} (code: ${data.code})`);
    }

    if (!data.tenant_access_token) {
      throw new Error("No tenant access token in response");
    }

    cachedToken = data.tenant_access_token;
    // Default expiry is 2 hours, use 1.5 hours for safety
    tokenExpiry = Date.now() + (data.expire ?? 7200) * 1000;

    return cachedToken;
  }

  async function sendMessage(
    receiveId: string,
    content: string,
    receiveIdType: "open_id" | "user_id" | "union_id" | "chat_id" = "open_id",
    msgType: string = "text",
  ): Promise<FeishuSendMessageResponse> {
    const token = await getTenantAccessToken();

    const response = await fetcher(
      `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=${receiveIdType}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: receiveId,
          msg_type: msgType,
          content: content,
        }),
      },
    );

    return (await response.json()) as FeishuSendMessageResponse;
  }

  async function replyMessage(
    messageId: string,
    content: string,
    msgType: string = "text",
  ): Promise<FeishuSendMessageResponse> {
    const token = await getTenantAccessToken();

    const response = await fetcher(
      `${FEISHU_API_BASE}/im/v1/messages/${messageId}/reply`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: content,
          msg_type: msgType,
        }),
      },
    );

    return (await response.json()) as FeishuSendMessageResponse;
  }

  async function getBotInfo(): Promise<FeishuBotInfoResponse> {
    const token = await getTenantAccessToken();

    const response = await fetcher(`${FEISHU_API_BASE}/bot/v3/bot_info`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return (await response.json()) as FeishuBotInfoResponse;
  }

  return {
    getTenantAccessToken,
    sendMessage,
    replyMessage,
    getBotInfo,
  };
}
