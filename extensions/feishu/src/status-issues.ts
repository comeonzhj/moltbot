import type { ChannelStatusIssue } from "clawdbot/plugin-sdk";

import type { ResolvedFeishuAccount } from "./types.js";

export function collectFeishuStatusIssues({
  account,
}: {
  account: ResolvedFeishuAccount;
}): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];

  if (!account.appId?.trim()) {
    issues.push({
      level: "error",
      message: "Feishu app ID not configured",
    });
  }

  if (!account.appSecret?.trim()) {
    issues.push({
      level: "error",
      message: "Feishu app secret not configured",
    });
  }

  return issues;
}
