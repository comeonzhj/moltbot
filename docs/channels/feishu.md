---
summary: "Feishu (Lark) bot support status, capabilities, and configuration"
read_when:
  - Working on Feishu features or webhooks
---

# Feishu (Lark)


Status: production-ready for bot DMs + groups via Feishu Open Platform.

## Quick setup (beginner)

1. Create a Feishu app at [Feishu Open Platform](https://open.feishu.cn/app) and copy the App ID and App Secret.
2. Enable the "Robot" capability in the app settings.
3. Set the credentials:
   - Env: `FEISHU_APP_ID=...` and `FEISHU_APP_SECRET=...`
   - Or config: `channels.feishu.appId: "..."` and `channels.feishu.appSecret: "..."`.
   - If both are set, config takes precedence (env fallback is default-account only).
4. Start the gateway.
5. DM access is pairing by default; approve the pairing code on first contact.

Minimal config:
```json5
{
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_xxxxxxxxxxxxxxxx",
      appSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      dmPolicy: "pairing"
    }
  }
}
```

## What it is

- A Feishu Open Platform channel owned by the Gateway.
- Deterministic routing: replies go back to Feishu; the model never chooses channels.
- DMs share the agent's main session; groups stay isolated (`agent:<agentId>:feishu:group:<chatId>`).

## Setup (fast path)

### 1) Create a Feishu app

1. Go to [Feishu Open Platform](https://open.feishu.cn/app).
2. Click "Create App" → "Custom App".
3. Fill in the app name and description.
4. In the app dashboard, find the "Credentials & Basic Info" section to get your App ID and App Secret.

### 2) Enable Bot capability

1. In your app dashboard, go to "Robot" → "Enable Robot".
2. Configure the robot name and description.
3. Save the settings.

### 3) Configure the credentials (env or config)

Example:

```json5
{
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_xxxxxxxxxxxxxxxx",
      appSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      dmPolicy: "pairing",
      groups: { "*": { requireMention: true } }
    }
  }
}
```

Env option: `FEISHU_APP_ID=...` and `FEISHU_APP_SECRET=...` (works for the default account).
If both env and config are set, config takes precedence.

Multi-account support: use `channels.feishu.accounts` with per-account credentials and optional `name`. See [`gateway/configuration`](/gateway/configuration#telegramaccounts--discordaccounts--slackaccounts--signalaccounts--imessageaccounts) for the shared pattern.

4) Start the gateway. Feishu starts when credentials are resolved (config first, env fallback).
5) DM access defaults to pairing. Approve the code when the bot is first contacted.
6) For groups: add the bot to a group, then set `channels.feishu.groups` to control mention gating + allowlists.

## Permissions (Feishu side)

Your Feishu app needs the following permissions:

- `im:chat:readonly` - Read chat information
- `im:message:send` - Send messages
- `im:message.group_msg` - Receive group messages (if using groups)

To add permissions:
1. Go to your app dashboard → "Permission & Scopes".
2. Search for and add the required permissions.
3. Publish the app version to apply changes.

## How it works (behavior)

- Inbound messages are normalized into the shared channel envelope with reply context.
- Group replies require a mention by default (native @mention or `agents.list[].groupChat.mentionPatterns` / `messages.groupChat.mentionPatterns`).
- Multi-agent override: set per-agent patterns on `agents.list[].groupChat.mentionPatterns`.
- Replies always route back to the same Feishu chat.
- Feishu sends events via webhook; configure your webhook URL in the Feishu app settings.

## Webhook setup

Feishu uses webhooks to deliver events to your gateway.

1. In your Feishu app dashboard, go to "Event Subscriptions" → "Add Subscription".
2. Set the request URL to your gateway's public URL + webhook path (default: `/feishu-webhook/default`).
3. Configure the verification token if needed.
4. Subscribe to these events:
   - `im.message.receive_v1` - Receive messages

Config example:
```json5
{
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_xxxxxxxxxxxxxxxx",
      appSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      webhookUrl: "https://your-gateway.example.com",
      webhookPath: "/feishu-webhook/default"
    }
  }
}
```

## Access control (DMs + groups)

### DM access

- Default: `channels.feishu.dmPolicy = "pairing"`. Unknown senders receive a pairing code; messages are ignored until approved (codes expire after 1 hour).
- Approve via:
  - `moltbot pairing list feishu`
  - `moltbot pairing approve feishu <CODE>`
- Pairing is the default token exchange used for Feishu DMs. Details: [Pairing](/start/pairing)
- `channels.feishu.allowFrom` accepts Open IDs (recommended, starts with `ou_`) or email addresses.

#### Finding your Feishu user ID

1. Start the gateway and DM your bot.
2. Run `moltbot logs --follow` and look for `from.id` (the Open ID starts with `ou_`).

### Group access

Two independent controls:

**1. Which groups are allowed** (group allowlist via `channels.feishu.groups`):
- No `groups` config = all groups allowed
- With `groups` config = only listed groups or `"*"` are allowed
- Example: `"groups": { "oc_xxxxxxxxxxxxxxxx": {}, "*": {} }` allows all groups

**2. Which senders are allowed** (sender filtering via `channels.feishu.groupPolicy`):
- `"open"` = all senders in allowed groups can message
- `"allowlist"` = only senders in `channels.feishu.groupAllowFrom` can message
- `"disabled"` = no group messages accepted at all
Default is `groupPolicy: "allowlist"` (blocked unless you add `groupAllowFrom`).

Most users want: `groupPolicy: "allowlist"` + `groupAllowFrom` + specific groups listed in `channels.feishu.groups`

## Config writes

By default, Feishu is allowed to write config updates triggered by channel events or `/config set|unset`.

Disable with:
```json5
{
  channels: { feishu: { configWrites: false } }
}
```

## Group activation modes

By default, the bot only responds to mentions in groups (`@botname` or patterns in `agents.list[].groupChat.mentionPatterns`). To change this behavior:

### Via config (recommended)

```json5
{
  channels: {
    feishu: {
      groups: {
        "oc_xxxxxxxxxxxxxxxx": { requireMention: false }  // always respond in this group
      }
    }
  }
}
```

**Important:** Setting `channels.feishu.groups` creates an **allowlist** - only listed groups (or `"*"`) will be accepted.

To allow all groups with always-respond:
```json5
{
  channels: {
    feishu: {
      groups: {
        "*": { requireMention: false }  // all groups, always respond
      }
    }
  }
}
```

To keep mention-only for all groups (default behavior):
```json5
{
  channels: {
    feishu: {
      groups: {
        "*": { requireMention: true }  // or omit groups entirely
      }
    }
  }
}
```

### Via command (session-level)

Send in the group:
- `/activation always` - respond to all messages
- `/activation mention` - require mentions (default)

**Note:** Commands update session state only. For persistent behavior across restarts, use config.

### Getting the group chat ID

1. Add the bot to a group.
2. Send a message in the group.
3. Use `moltbot logs --follow` to read the `chat.id` (starts with `oc_`).

## Retry policy

Outbound Feishu API calls retry on transient network/429 errors with exponential backoff and jitter. Configure via `channels.feishu.retry`. See [Retry policy](/concepts/retry).

## Agent tool (messages)

- Tool: `feishu` with `sendMessage` action (`to`, `content`).
- Tool gating: `channels.feishu.actions.sendMessage` (default: enabled).

## Delivery targets (CLI/cron)

- Use an Open ID (`ou_xxxxxxxxxxxxxxxx`) or Chat ID (`oc_xxxxxxxxxxxxxxxx`) as the target.
- Example: `moltbot message send --channel feishu --target ou_xxxxxxxxxxxxxxxx --message "hi"`.

## Limits

- Outbound text is chunked to `channels.feishu.textChunkLimit` (default 4000).
- Media uploads are capped by `channels.feishu.mediaMaxMb` (default 5).
- Feishu API requests time out after `channels.feishu.timeoutSeconds` (default 30).

## Troubleshooting

**Bot doesn't respond to messages:**
- Check that the app is published in Feishu Open Platform.
- Verify required permissions are granted and published.
- Check webhook URL is correct and accessible from the internet.
- `moltbot channels status --probe` can check if credentials are valid.

**Webhook verification fails:**
- Ensure your gateway is publicly accessible.
- Check that the webhook path matches your configuration.
- Verify the encryption key if configured.

More help: [Channel troubleshooting](/channels/troubleshooting).

## Configuration reference (Feishu)

Full configuration: [Configuration](/gateway/configuration)

Provider options:
- `channels.feishu.enabled`: enable/disable channel startup.
- `channels.feishu.appId`: Feishu app ID (cli_xxx).
- `channels.feishu.appSecret`: Feishu app secret.
- `channels.feishu.appIdFile`: read app ID from file path.
- `channels.feishu.appSecretFile`: read app secret from file path.
- `channels.feishu.dmPolicy`: `pairing | allowlist | open | disabled` (default: pairing).
- `channels.feishu.allowFrom`: DM allowlist (Open IDs or emails).
- `channels.feishu.groupPolicy`: `open | allowlist | disabled` (default: allowlist).
- `channels.feishu.groupAllowFrom`: group sender allowlist (Open IDs).
- `channels.feishu.groups`: per-group defaults + allowlist (use `"*"` for global defaults).
  - `channels.feishu.groups.<id>.requireMention`: mention gating default.
  - `channels.feishu.groups.<id>.skills`: skill filter (omit = all skills, empty = none).
  - `channels.feishu.groups.<id>.allowFrom`: per-group sender allowlist override.
  - `channels.feishu.groups.<id>.systemPrompt`: extra system prompt for the group.
  - `channels.feishu.groups.<id>.enabled`: disable the group when `false`.
- `channels.feishu.textChunkLimit`: outbound chunk size (chars).
- `channels.feishu.mediaMaxMb`: inbound/outbound media cap (MB).
- `channels.feishu.retry`: retry policy for outbound Feishu API calls (attempts, minDelayMs, maxDelayMs, jitter).
- `channels.feishu.proxy`: proxy URL for Feishu API calls.
- `channels.feishu.webhookUrl`: public webhook URL.
- `channels.feishu.webhookSecret`: webhook verification secret.
- `channels.feishu.webhookPath`: local webhook path (default `/feishu-webhook/<accountId>`).
- `channels.feishu.encryptKey`: encryption key for webhook payloads.
- `channels.feishu.verificationToken`: verification token for webhooks.
- `channels.feishu.actions.sendMessage`: gate Feishu tool message sends.

Related global options:
- `agents.list[].groupChat.mentionPatterns` (mention gating patterns).
- `commands.native` (defaults to `"auto"`), `commands.text`, `commands.useAccessGroups`.
- `messages.responsePrefix`, `messages.ackReaction`, `messages.ackReactionScope`, `messages.removeAckAfterReply`.
