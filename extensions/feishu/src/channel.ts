import type {
  ChannelPlugin,
  MoltbotConfig,
} from "clawdbot/plugin-sdk";
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
} from "clawdbot/plugin-sdk";

import {
  listFeishuAccountIds,
  resolveDefaultFeishuAccountId,
  resolveFeishuAccount,
} from "./accounts.js";
import { FeishuConfigSchema } from "./config-schema.js";
import { feishuOnboardingAdapter } from "./onboarding.js";
import { probeFeishu } from "./probe.js";
import { getFeishuRuntime } from "./runtime.js";
import { sendMessageFeishu } from "./send.js";
import { collectFeishuStatusIssues } from "./status-issues.js";
import type { ResolvedFeishuAccount } from "./types.js";

const meta = {
  id: "feishu",
  label: "Feishu",
  selectionLabel: "Feishu (Lark)",
  detailLabel: "Feishu Bot",
  docsPath: "/channels/feishu",
  docsLabel: "feishu",
  blurb: "Feishu (Lark) enterprise messaging platform by ByteDance.",
  aliases: ["lark"],
  order: 85,
  quickstartAllowFrom: true,
};

function normalizeFeishuMessagingTarget(raw: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^(feishu|lark):/i, "");
}

function looksLikeFeishuTargetId(raw: string): boolean {
  const trimmed = raw?.trim();
  if (!trimmed) return false;
  // Feishu Open IDs start with ou_
  // Chat IDs start with oc_
  return (
    /^ou_[a-zA-Z0-9]+$/.test(trimmed) ||
    /^oc_[a-zA-Z0-9]+$/.test(trimmed) ||
    /^(feishu|lark):/i.test(trimmed)
  );
}

export const feishuPlugin: ChannelPlugin<ResolvedFeishuAccount> = {
  id: "feishu",
  meta,
  onboarding: feishuOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: true,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  },
  reload: { configPrefixes: ["channels.feishu"] },
  configSchema: buildChannelConfigSchema(FeishuConfigSchema),
  config: {
    listAccountIds: (cfg) => listFeishuAccountIds(cfg as MoltbotConfig),
    resolveAccount: (cfg, accountId) =>
      resolveFeishuAccount({ cfg: cfg as MoltbotConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultFeishuAccountId(cfg as MoltbotConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as MoltbotConfig,
        sectionKey: "feishu",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as MoltbotConfig,
        sectionKey: "feishu",
        accountId,
        clearBaseFields: ["appId", "appSecret", "appIdFile", "appSecretFile", "name"],
      }),
    isConfigured: (account) => Boolean(account.appId?.trim() && account.appSecret?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.appId?.trim() && account.appSecret?.trim()),
      tokenSource: account.tokenSource,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveFeishuAccount({ cfg: cfg as MoltbotConfig, accountId }).config.allowFrom ?? []).map(
        (entry) => String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(feishu|lark):/i, "")),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        (cfg as MoltbotConfig).channels?.feishu?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.feishu.accounts.${resolvedAccountId}.`
        : "channels.feishu.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("feishu"),
        normalizeEntry: (raw) => raw.replace(/^(feishu|lark):/i, ""),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy =
        (cfg as MoltbotConfig).channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        `- Feishu groups: groupPolicy="open" allows any member in groups to trigger. Set channels.feishu.groupPolicy="allowlist" + channels.feishu.groupAllowFrom to restrict senders.`,
      ];
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId, groupId }) => {
      const account = resolveFeishuAccount({ cfg: cfg as MoltbotConfig, accountId });
      const groups = account.config.groups;
      if (!groups) return true; // Default to requiring mention
      const groupConfig = groups[groupId] ?? groups["*"];
      return groupConfig?.requireMention ?? true;
    },
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
  messaging: {
    normalizeTarget: normalizeFeishuMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeFeishuTargetId,
      hint: "<open_id|chat_id>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveFeishuAccount({ cfg: cfg as MoltbotConfig, accountId });
      const q = query?.trim().toLowerCase() || "";
      const peers = Array.from(
        new Set(
          (account.config.allowFrom ?? [])
            .map((entry) => String(entry).trim())
            .filter((entry) => Boolean(entry) && entry !== "*")
            .map((entry) => entry.replace(/^(feishu|lark):/i, "")),
        ),
      )
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "user" as const, id }));
      return peers;
    },
    listGroups: async () => [],
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as MoltbotConfig,
        channelKey: "feishu",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      const typedInput = input as {
        useEnv?: boolean;
        appId?: string;
        appSecret?: string;
        appIdFile?: string;
        appSecretFile?: string;
      };
      if (typedInput.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "FEISHU_APP_ID/FEISHU_APP_SECRET can only be used for the default account.";
      }
      if (
        !typedInput.useEnv &&
        !typedInput.appId &&
        !typedInput.appIdFile
      ) {
        return "Feishu requires appId or --app-id-file (or --use-env).";
      }
      if (
        !typedInput.useEnv &&
        !typedInput.appSecret &&
        !typedInput.appSecretFile
      ) {
        return "Feishu requires appSecret or --app-secret-file (or --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const typedInput = input as {
        name?: string;
        useEnv?: boolean;
        appId?: string;
        appSecret?: string;
        appIdFile?: string;
        appSecretFile?: string;
      };
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg as MoltbotConfig,
        channelKey: "feishu",
        accountId,
        name: typedInput.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "feishu",
            })
          : namedConfig;

      const baseFields = typedInput.useEnv
        ? {}
        : {
            ...(typedInput.appIdFile
              ? { appIdFile: typedInput.appIdFile }
              : typedInput.appId
                ? { appId: typedInput.appId }
                : {}),
            ...(typedInput.appSecretFile
              ? { appSecretFile: typedInput.appSecretFile }
              : typedInput.appSecret
                ? { appSecret: typedInput.appSecret }
                : {}),
          };

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            feishu: {
              ...(next.channels?.feishu ?? {}),
              enabled: true,
              ...baseFields,
            },
          },
        } as MoltbotConfig;
      }

      return {
        ...next,
        channels: {
          ...next.channels,
          feishu: {
            ...(next.channels?.feishu ?? {}),
            enabled: true,
            accounts: {
              ...(next.channels?.feishu?.accounts ?? {}),
              [accountId]: {
                ...(next.channels?.feishu?.accounts?.[accountId] ?? {}),
                enabled: true,
                ...baseFields,
              },
            },
          },
        },
      } as MoltbotConfig;
    },
  },
  pairing: {
    idLabel: "feishuUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(feishu|lark):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveFeishuAccount({ cfg: cfg as MoltbotConfig });
      if (!account.appId || !account.appSecret) {
        throw new Error("Feishu app credentials not configured");
      }
      await sendMessageFeishu(id, PAIRING_APPROVED_MESSAGE, {
        accountId: account.accountId,
        cfg: cfg as MoltbotConfig,
      });
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => {
      if (!text) return [];
      if (limit <= 0 || text.length <= limit) return [text];
      const chunks: string[] = [];
      let remaining = text;
      while (remaining.length > limit) {
        const window = remaining.slice(0, limit);
        const lastNewline = window.lastIndexOf("\n");
        const lastSpace = window.lastIndexOf(" ");
        let breakIdx = lastNewline > 0 ? lastNewline : lastSpace;
        if (breakIdx <= 0) breakIdx = limit;
        const rawChunk = remaining.slice(0, breakIdx);
        const chunk = rawChunk.trimEnd();
        if (chunk.length > 0) chunks.push(chunk);
        const brokeOnSeparator = breakIdx < remaining.length && /\s/.test(remaining[breakIdx]);
        const nextStart = Math.min(remaining.length, breakIdx + (brokeOnSeparator ? 1 : 0));
        remaining = remaining.slice(nextStart).trimStart();
      }
      if (remaining.length) chunks.push(remaining);
      return chunks;
    },
    chunkerMode: "text",
    textChunkLimit: 4000, // Feishu allows up to 4096 characters
    sendText: async ({ to, text, accountId, cfg }) => {
      const result = await sendMessageFeishu(to, text, {
        accountId: accountId ?? undefined,
        cfg: cfg as MoltbotConfig,
      });
      return {
        channel: "feishu",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, cfg }) => {
      const runtime = getFeishuRuntime();
      // Send as rich text with link
      const content = text ? `${text}\n${mediaUrl}` : mediaUrl;
      const result = await sendMessageFeishu(to, content, {
        accountId: accountId ?? undefined,
        cfg: cfg as MoltbotConfig,
      });
      return {
        channel: "feishu",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: collectFeishuStatusIssues,
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      mode: snapshot.mode ?? null,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) =>
      probeFeishu(account.appId, account.appSecret, timeoutMs),
    buildAccountSnapshot: ({ account, runtime }) => {
      const configured = Boolean(account.appId?.trim() && account.appSecret?.trim());
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        tokenSource: account.tokenSource,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        mode: account.config.webhookUrl ? "webhook" : "polling",
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        dmPolicy: account.config.dmPolicy ?? "pairing",
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const appId = account.appId.trim();
      const appSecret = account.appSecret.trim();

      let feishuBotLabel = "";
      try {
        const probe = await probeFeishu(appId, appSecret, 2500);
        const name = probe.ok ? probe.bot?.name?.trim() : null;
        if (name) feishuBotLabel = ` (${name})`;
      } catch {
        // ignore probe errors
      }

      ctx.log?.info(`[${account.accountId}] starting Feishu provider${feishuBotLabel}`);

      // Import monitor dynamically to avoid circular deps
      const { monitorFeishuProvider } = await import("./monitor.js");
      return monitorFeishuProvider({
        token: "", // Not used, we use app credentials
        accountId: account.accountId,
        config: ctx.cfg as MoltbotConfig,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        useWebhook: Boolean(account.config.webhookUrl),
        webhookUrl: account.config.webhookUrl,
        webhookSecret: account.config.webhookSecret,
        webhookPath: account.config.webhookPath,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
    },
    logoutAccount: async ({ accountId, cfg }) => {
      const envAppId = process.env.FEISHU_APP_ID?.trim() ?? "";
      const envAppSecret = process.env.FEISHU_APP_SECRET?.trim() ?? "";
      const nextCfg = { ...cfg } as MoltbotConfig;
      const feishuConfig = (cfg.channels?.feishu ?? {}) as Record<string, unknown>;
      const nextFeishu = { ...feishuConfig };
      let cleared = false;
      let changed = false;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        if (
          nextFeishu.appId ||
          nextFeishu.appSecret ||
          nextFeishu.appIdFile ||
          nextFeishu.appSecretFile
        ) {
          delete nextFeishu.appId;
          delete nextFeishu.appSecret;
          delete nextFeishu.appIdFile;
          delete nextFeishu.appSecretFile;
          cleared = true;
          changed = true;
        }
      }

      const accounts = nextFeishu.accounts
        ? { ...(nextFeishu.accounts as Record<string, unknown>) }
        : undefined;
      if (accounts && accountId in accounts) {
        const entry = accounts[accountId];
        if (entry && typeof entry === "object") {
          const nextEntry = { ...entry } as Record<string, unknown>;
          if (
            "appId" in nextEntry ||
            "appSecret" in nextEntry ||
            "appIdFile" in nextEntry ||
            "appSecretFile" in nextEntry
          ) {
            cleared = true;
            delete nextEntry.appId;
            delete nextEntry.appSecret;
            delete nextEntry.appIdFile;
            delete nextEntry.appSecretFile;
            changed = true;
          }
          if (Object.keys(nextEntry).length === 0) {
            delete accounts[accountId];
            changed = true;
          } else {
            accounts[accountId] = nextEntry;
          }
        }
      }

      if (accounts) {
        if (Object.keys(accounts).length === 0) {
          delete nextFeishu.accounts;
          changed = true;
        } else {
          nextFeishu.accounts = accounts;
        }
      }

      if (changed) {
        if (Object.keys(nextFeishu).length > 0) {
          nextCfg.channels = { ...nextCfg.channels, feishu: nextFeishu };
        } else {
          const nextChannels = { ...nextCfg.channels };
          delete (nextChannels as Record<string, unknown>).feishu;
          if (Object.keys(nextChannels).length > 0) {
            nextCfg.channels = nextChannels;
          } else {
            delete nextCfg.channels;
          }
        }
        await getFeishuRuntime().config.writeConfigFile(nextCfg);
      }

      const resolved = resolveFeishuAccount({
        cfg: changed ? nextCfg : cfg,
        accountId,
      });
      const loggedOut = resolved.tokenSource === "none";

      return { cleared, envToken: Boolean(envAppId && envAppSecret), loggedOut };
    },
  },
};
