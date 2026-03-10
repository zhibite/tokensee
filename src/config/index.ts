import { z } from 'zod';
import { config } from 'dotenv';

config(); // load .env

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // RPC Providers
  ALCHEMY_API_KEY: z.string().min(1),
  QUICKNODE_ETH_URL: z.string().url().optional(),
  QUICKNODE_BSC_URL: z.string().url().optional(),
  ALCHEMY_ARBITRUM_URL: z.string().url().optional(),
  ALCHEMY_POLYGON_URL: z.string().url().optional(),
  ALCHEMY_BASE_URL: z.string().url().optional(),
  ALCHEMY_OPTIMISM_URL: z.string().url().optional(),
  ALCHEMY_AVALANCHE_URL: z.string().url().optional(),

  // External APIs
  COINGECKO_API_KEY: z.string().optional(),
  BSCSCAN_API_KEY: z.string().optional(),

  // Auth
  API_KEY_SALT: z.string().min(16),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
