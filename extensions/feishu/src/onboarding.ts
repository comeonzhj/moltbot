import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
} from "clawdbot/plugin-sdk";
import type { MoltbotConfig } from "clawdbot/plugin-sdk";

import { resolveFeishuAccount } from "./accounts.js";
import { probeFeishu } from "./probe.js";

export const feishuOnboardingAdapter: ChannelOnboardingAdapter = {
  async getDmPolicyOption(): Promise<ChannelOnboardingDmPolicy> {
    return {
      policy: "pairing",
      allowFrom: [],
      default: "pairing",
      options: [
        { value: "pairing", label: "Pairing (default)" },
        { value: "allowlist", label: "Allowlist only" },
        { value: "open", label: "Open (allow all)" },
      ],
    };
  },

  async validateCredentials(input: {
    appId?: string;
    appSecret?: string;
    appIdFile?: string;
    appSecretFile?: string;
  }): Promise<{ ok: boolean; error?: string; name?: string }> {
    // Check for credentials
    let appId = input.appId?.trim() ?? "";
    let appSecret = input.appSecret?.trim() ?? "";

    // Try reading from files if direct values not provided
    if (!appId && input.appIdFile) {
      try {
        const fs = await import("node:fs");
        appId = fs.readFileSync(input.appIdFile, "utf-8").trim();
      } catch {
        return { ok: false, error: `Cannot read app ID from ${input.appIdFile}` };
      }
    }

    if (!appSecret && input.appSecretFile) {
      try {
        const fs = await import("node:fs");
        appSecret = fs.readFileSync(input.appSecretFile, "utf-8").trim();
      } catch {
        return { ok: false, error: `Cannot read app secret from ${input.appSecretFile}` };
      }
    }

    if (!appId || !appSecret) {
      return { ok: false, error: "App ID and App Secret are required" };
    }

    // Test the credentials with a probe
    const probe = await probeFeishu(appId, appSecret, 10000);

    if (!probe.ok) {
      return { ok: false, error: probe.error || "Failed to validate credentials" };
    }

    return {
      ok: true,
      name: probe.bot?.name || "Feishu Bot",
    };
  },

  async validateAllowFromEntry(entry: string): Promise<{ ok: boolean; error?: string }> {
    // Feishu user IDs are typically alphanumeric strings
    // Open IDs start with "ou_"
    const trimmed = entry.trim();
    if (!trimmed) {
      return { ok: false, error: "Entry cannot be empty" };
    }

    if (trimmed === "*") {
      return { ok: true };
    }

    // Allow Feishu Open IDs (ou_xxx), Union IDs, or User IDs
    if (/^ou_[a-zA-Z0-9]+$/.test(trimmed)) {
      return { ok: true };
    }

    // Allow email format (for finding users by email)
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: true };
    }

    return {
      ok: false,
      error: "Feishu allowlist entries should be Open IDs (ou_xxx) or email addresses",
    };
  },

  async normalizeAllowFromEntry(entry: string): Promise<string> {
    return entry.replace(/^feishu:/i, "").trim();
  },

  async getAllowFromHint(): Promise<string> {
    return "Enter Feishu Open IDs (ou_xxx) or email addresses, separated by commas";
  },

  async formatAllowFromForDisplay(cfg: MoltbotConfig, accountId?: string): Promise<string[]> {
    const account = resolveFeishuAccount({ cfg, accountId });
    const allowFrom = account.config.allowFrom ?? [];
    return allowFrom.map((entry) => String(entry));
  },
};
