import { z } from "zod";

export const HealthLiveResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
  uptime: z.number().nonnegative(),
  service: z.string(),
  version: z.string(),
});

export type HealthLiveResponse = z.infer<typeof HealthLiveResponseSchema>;

export const HealthReadyResponseSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  timestamp: z.string().datetime(),
  service: z.string(),
  version: z.string(),
  database: z.object({
    configured: z.boolean(),
    connected: z.boolean(),
    latencyMs: z.number().optional(),
  }),
});

export type HealthReadyResponse = z.infer<typeof HealthReadyResponseSchema>;
