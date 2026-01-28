import type { MoltbotConfig } from "clawdbot/plugin-sdk";

import { resolveFeishuAccount } from "./accounts.js";
import { getFeishuRuntime } from "./runtime.js";
import type { FeishuEvent, FeishuMessage } from "./types.js";

export interface MonitorContext {
  token: string;
  accountId: string;
  config: MoltbotConfig;
  runtime: Record<string, unknown>;
  abortSignal?: AbortSignal;
  useWebhook: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookPath?: string;
  statusSink?: (patch: Record<string, unknown>) => void;
}

export interface MonitorResult {
  stop: () => void;
}

// Webhook event handler
export function handleFeishuWebhook(
  event: FeishuEvent,
  account: ReturnType<typeof resolveFeishuAccount>,
  config: MoltbotConfig,
): { challenge?: string; handled: boolean } {
  // Handle URL verification challenge
  if (event.challenge) {
    return { challenge: event.challenge, handled: true };
  }

  // Handle message events
  if (event.header?.event_type === "im.message.receive_v1" && event.event?.message) {
    const message = event.event.message as FeishuMessage;

    // Normalize and deliver the message
    void deliverInboundMessage(message, account, config);
    return { handled: true };
  }

  return { handled: false };
}

async function deliverInboundMessage(
  message: FeishuMessage,
  account: ReturnType<typeof resolveFeishuAccount>,
  config: MoltbotConfig,
): Promise<void> {
  const runtime = getFeishuRuntime();

  // Parse message content
  let content: Record<string, unknown> = {};
  try {
    content = JSON.parse(message.content) as Record<string, unknown>;
  } catch {
    // If not JSON, treat as plain text
    content = { text: message.content };
  }

  const text = (content.text as string) || "";

  // Determine sender info
  const senderId = message.sender?.sender_id?.open_id || "";
  const senderType = message.sender?.sender_type || "";

  // Skip messages from the bot itself
  if (senderType === "app") {
    return;
  }

  // Build normalized envelope for the gateway
  const envelope = {
    Body: text,
    From: senderId,
    To: message.chat_id,
    Channel: "feishu",
    ChannelSid: `feishu:${account.accountId}`,
    MessageSid: message.message_id,
    ChatType: message.chat_type === "p2p" ? "direct" : "group",
    // Include parent_id for threading if present
    ...(message.parent_id ? { ParentSid: message.parent_id } : {}),
    // Include mention info
    ...(message.mentions?.length
      ? {
          Mentions: message.mentions.map((m) => ({
            id: m.id.open_id,
            name: m.name,
          })),
        }
      : {}),
  };

  // Deliver to the gateway's inbound handler
  try {
    await runtime.channel.deliverInbound(envelope);
  } catch (err) {
    runtime.logging.error?.(`Failed to deliver Feishu message: ${String(err)}`);
  }
}

// Polling monitor (not typically used for Feishu, but kept for compatibility)
export async function monitorFeishuProvider(ctx: MonitorContext): Promise<MonitorResult> {
  const { accountId, config, statusSink } = ctx;
  const account = resolveFeishuAccount({ cfg: config, accountId });

  // Update status to running
  statusSink?.({
    accountId,
    running: true,
    lastStartAt: new Date().toISOString(),
  });

  // Feishu primarily uses webhooks, so this is a minimal polling implementation
  // that just keeps the account status updated

  const interval = setInterval(() => {
    // Keep-alive check could go here
    statusSink?.({
      accountId,
      lastEventAt: new Date().toISOString(),
    });
  }, 60000); // Every minute

  return {
    stop: () => {
      clearInterval(interval);
      statusSink?.({
        accountId,
        running: false,
        lastStopAt: new Date().toISOString(),
      });
    },
  };
}

// Webhook path generator
export function getFeishuWebhookPath(accountId: string, customPath?: string): string {
  if (customPath) return customPath;
  return `/feishu-webhook/${accountId}`;
}
