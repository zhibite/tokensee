import { z } from 'zod';
import { config } from 'dotenv';

config(); // load .env

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),
  FRONTEND_URL: z.string().url().optional(),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // RPC Providers
  ALCHEMY_API_KEY: z.string().min(1),
  QUICKNODE_ETH_URL: z.string().url().optional().or(z.literal('')),
  QUICKNODE_BSC_URL: z.string().url().optional().or(z.literal('')),
  ALCHEMY_ARBITRUM_URL: z.string().url().optional().or(z.literal('')),
  ALCHEMY_POLYGON_URL: z.string().url().optional().or(z.literal('')),
  ALCHEMY_BASE_URL: z.string().url().optional().or(z.literal('')),
  ALCHEMY_OPTIMISM_URL: z.string().url().optional().or(z.literal('')),
  ALCHEMY_AVALANCHE_URL: z.string().url().optional().or(z.literal('')),

  // External APIs
  COINGECKO_API_KEY: z.string().optional(),
  BSCSCAN_API_KEY: z.string().optional(),
  ETHERSCAN_API_KEY: z.string().optional(),   // used by EnrichmentService

  // Auth
  API_KEY_SALT: z.string().min(16),

  // Webhooks
  ALLOW_PRIVATE_WEBHOOK_URLS: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
