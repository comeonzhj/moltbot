import type { MoltbotConfig } from "clawdbot/plugin-sdk";

import { resolveFeishuAccount } from "./accounts.js";
import { createFeishuApiClient } from "./api.js";
import { getFeishuRuntime } from "./runtime.js";
import type { FeishuSendOptions } from "./types.js";

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendMessageFeishu(
  to: string,
  text: string,
  options: FeishuSendOptions & { cfg?: MoltbotConfig } = {},
): Promise<SendResult> {
  const { accountId, messageType = "text", cfg: providedCfg } = options;

  // Get config from runtime if not provided
  let cfg = providedCfg;
  if (!cfg) {
    const configPath = getFeishuRuntime().config.getConfigPath();
    cfg = await getFeishuRuntime().config.readConfigFile(configPath);
  }

  const account = resolveFeishuAccount({ cfg, accountId });

  if (!account.appId || !account.appSecret) {
    return {
      ok: false,
      error: "Feishu app ID or app secret not configured",
    };
  }

  // Determine if 'to' is a user or chat
  const isChatId = /^oc_/.test(to);
  const receiveIdType = isChatId ? "chat_id" : "open_id";

  // Build content based on message type
  let content: string;
  if (messageType === "text") {
    content = JSON.stringify({ text });
  } else if (messageType === "post") {
    // Rich text format
    content = JSON.stringify({
      content: [[{ tag: "text", text }]],
    });
  } else {
    content = text;
  }

  try {
    const api = createFeishuApiClient(account.appId, account.appSecret);
    const result = await api.sendMessage(to, content, receiveIdType, messageType);

    if (result.code !== 0) {
      return {
        ok: false,
        error: `Feishu API error: ${result.msg} (code: ${result.code})`,
      };
    }

    return {
      ok: true,
      messageId: result.data?.message_id,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function replyMessageFeishu(
  messageId: string,
  text: string,
  options: FeishuSendOptions & { cfg?: MoltbotConfig } = {},
): Promise<SendResult> {
  const { accountId, messageType = "text", cfg: providedCfg } = options;

  let cfg = providedCfg;
  if (!cfg) {
    const configPath = getFeishuRuntime().config.getConfigPath();
    cfg = await getFeishuRuntime().config.readConfigFile(configPath);
  }

  const account = resolveFeishuAccount({ cfg, accountId });

  if (!account.appId || !account.appSecret) {
    return {
      ok: false,
      error: "Feishu app ID or app secret not configured",
    };
  }

  let content: string;
  if (messageType === "text") {
    content = JSON.stringify({ text });
  } else if (messageType === "post") {
    content = JSON.stringify({
      content: [[{ tag: "text", text }]],
    });
  } else {
    content = text;
  }

  try {
    const api = createFeishuApiClient(account.appId, account.appSecret);
    const result = await api.replyMessage(messageId, content, messageType);

    if (result.code !== 0) {
      return {
        ok: false,
        error: `Feishu API error: ${result.msg} (code: ${result.code})`,
      };
    }

    return {
      ok: true,
      messageId: result.data?.message_id,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendMediaFeishu(
  to: string,
  mediaUrl: string,
  text: string,
  options: FeishuSendOptions & { cfg?: MoltbotConfig } = {},
): Promise<SendResult> {
  const { accountId, cfg: providedCfg } = options;

  let cfg = providedCfg;
  if (!cfg) {
    const configPath = getFeishuRuntime().config.getConfigPath();
    cfg = await getFeishuRuntime().config.readConfigFile(configPath);
  }

  const account = resolveFeishuAccount({ cfg, accountId });

  if (!account.appId || !account.appSecret) {
    return {
      ok: false,
      error: "Feishu app ID or app secret not configured",
    };
  }

  // Determine if 'to' is a user or chat
  const isChatId = /^oc_/.test(to);
  const receiveIdType = isChatId ? "chat_id" : "open_id";

  try {
    // Download and upload media to Feishu first (simplified - in production would need proper media upload)
    // For now, send as link in rich text
    const content = JSON.stringify({
      content: [
        [{ tag: "text", text: text || "Shared media:" }],
        [{ tag: "a", text: mediaUrl, href: mediaUrl }],
      ],
    });

    const api = createFeishuApiClient(account.appId, account.appSecret);
    const result = await api.sendMessage(to, content, receiveIdType, "post");

    if (result.code !== 0) {
      return {
        ok: false,
        error: `Feishu API error: ${result.msg} (code: ${result.code})`,
      };
    }

    return {
      ok: true,
      messageId: result.data?.message_id,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
