import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "clawdbot/plugin-sdk";
import type { MoltbotConfig } from "clawdbot/plugin-sdk";
import { readFileSync } from "node:fs";

import type { FeishuConfig } from "./config-schema.js";
import type { ResolvedFeishuAccount } from "./types.js";

const ENV_FEISHU_APP_ID = process.env.FEISHU_APP_ID?.trim() ?? "";
const ENV_FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET?.trim() ?? "";

function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return "";
  }
}

export function listFeishuAccountIds(cfg: MoltbotConfig): string[] {
  const feishu = cfg.channels?.feishu as FeishuConfig | undefined;
  const accountIds: string[] = [];

  // Check for default/top-level account
  const hasDefaultAccount =
    feishu?.appId ||
    feishu?.appIdFile ||
    (feishu?.accounts && Object.keys(feishu.accounts).length === 0);

  if (hasDefaultAccount || ENV_FEISHU_APP_ID) {
    accountIds.push(DEFAULT_ACCOUNT_ID);
  }

  // Add named accounts
  if (feishu?.accounts) {
    for (const accountId of Object.keys(feishu.accounts)) {
      if (!accountIds.includes(accountId)) {
        accountIds.push(accountId);
      }
    }
  }

  return accountIds.sort();
}

export function resolveDefaultFeishuAccountId(cfg: MoltbotConfig): string {
  const ids = listFeishuAccountIds(cfg);
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveFeishuAccount({
  cfg,
  accountId,
}: {
  cfg: MoltbotConfig;
  accountId?: string | null;
}): ResolvedFeishuAccount {
  const feishu = cfg.channels?.feishu as FeishuConfig | undefined;
  const resolvedAccountId = accountId?.trim() || DEFAULT_ACCOUNT_ID;

  // Get account-specific config or default
  const accountConfig =
    resolvedAccountId !== DEFAULT_ACCOUNT_ID
      ? feishu?.accounts?.[resolvedAccountId]
      : undefined;

  const baseConfig = {
    ...(feishu ?? {}),
    ...(accountConfig ?? {}),
  } as FeishuConfig;

  // Resolve credentials with priority: direct > file > env
  let appId = "";
  let appSecret = "";
  let tokenSource: ResolvedFeishuAccount["tokenSource"] = "none";

  if (baseConfig.appId) {
    appId = baseConfig.appId;
    tokenSource = "config";
  } else if (baseConfig.appIdFile) {
    appId = readFileOrEmpty(baseConfig.appIdFile);
    if (appId) tokenSource = "file";
  } else if (ENV_FEISHU_APP_ID && resolvedAccountId === DEFAULT_ACCOUNT_ID) {
    appId = ENV_FEISHU_APP_ID;
    tokenSource = "env";
  }

  if (baseConfig.appSecret) {
    appSecret = baseConfig.appSecret;
  } else if (baseConfig.appSecretFile) {
    appSecret = readFileOrEmpty(baseConfig.appSecretFile);
  } else if (ENV_FEISHU_APP_SECRET && resolvedAccountId === DEFAULT_ACCOUNT_ID) {
    appSecret = ENV_FEISHU_APP_SECRET;
  }

  return {
    accountId: resolvedAccountId,
    name: baseConfig.name,
    enabled: baseConfig.enabled,
    appId,
    appSecret,
    config: {
      dmPolicy: baseConfig.dmPolicy,
      allowFrom: baseConfig.allowFrom,
      groupPolicy: baseConfig.groupPolicy,
      groupAllowFrom: baseConfig.groupAllowFrom,
      textChunkLimit: baseConfig.textChunkLimit,
      mediaMaxMb: baseConfig.mediaMaxMb,
      proxy: baseConfig.proxy,
      webhookUrl: baseConfig.webhookUrl,
      webhookSecret: baseConfig.webhookSecret,
      webhookPath: baseConfig.webhookPath,
      encryptKey: baseConfig.encryptKey,
      verificationToken: baseConfig.verificationToken,
      markdown: baseConfig.markdown,
    },
    tokenSource,
  };
}

export { normalizeAccountId };
