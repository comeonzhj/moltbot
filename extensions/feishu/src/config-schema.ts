import {
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
  requireOpenAllowFrom,
} from "clawdbot/plugin-sdk";
import { z } from "zod";

const allowFromEntry = z.union([z.string(), z.number()]);

const FeishuAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    configWrites: z.boolean().optional(),
    markdown: MarkdownConfigSchema,
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    appIdFile: z.string().optional(),
    appSecretFile: z.string().optional(),
    encryptKey: z.string().optional(),
    verificationToken: z.string().optional(),
    webhookUrl: z.string().optional(),
    webhookSecret: z.string().optional(),
    webhookPath: z.string().optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: z.array(allowFromEntry).optional(),
    groupAllowFrom: z.array(allowFromEntry).optional(),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    textChunkLimit: z.number().int().positive().optional(),
    mediaMaxMb: z.number().optional(),
    proxy: z.string().optional(),
  })
  .strict();

const FeishuAccountSchema = FeishuAccountSchemaBase.superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.feishu.dmPolicy="open" requires channels.feishu.allowFrom to include "*"',
  });
});

export const FeishuConfigSchema = FeishuAccountSchemaBase.extend({
  accounts: z.record(z.string(), FeishuAccountSchema.optional()).optional(),
  defaultAccount: z.string().optional(),
}).superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.feishu.dmPolicy="open" requires channels.feishu.allowFrom to include "*"',
  });
});

export type FeishuConfig = z.infer<typeof FeishuConfigSchema>;
export type FeishuAccountConfig = z.infer<typeof FeishuAccountSchema>;
