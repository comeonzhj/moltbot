import { createFeishuApiClient } from "./api.js";

export interface ProbeResult {
  ok: boolean;
  bot?: {
    name: string;
    id: string;
    status: string;
  };
  error?: string;
}

export async function probeFeishu(
  appId: string,
  appSecret: string,
  timeoutMs: number = 5000,
  fetcher?: typeof fetch,
): Promise<ProbeResult> {
  if (!appId || !appSecret) {
    return { ok: false, error: "App ID or App Secret not configured" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const api = createFeishuApiClient(
      appId,
      appSecret,
      fetcher ??
        ((url, init) =>
          fetch(url, {
            ...init,
            signal: controller.signal,
          })),
    );

    const result = await api.getBotInfo();
    clearTimeout(timeoutId);

    if (result.code !== 0) {
      return {
        ok: false,
        error: `Feishu API error: ${result.msg} (code: ${result.code})`,
      };
    }

    if (!result.bot) {
      return {
        ok: false,
        error: "No bot info in response",
      };
    }

    return {
      ok: true,
      bot: {
        name: result.bot.app_name,
        id: result.bot.open_id,
        status: result.bot.activate_status === 1 ? "active" : "inactive",
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Probe timed out" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
