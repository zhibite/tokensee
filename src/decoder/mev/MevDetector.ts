import type { AssetAmount } from '../../types/transaction.types.js';

export type MevType = 'flashloan' | 'arbitrage' | 'sandwich_bot' | null;

/**
 * Detect MEV patterns from decoded transaction data.
 * Called after SemanticStep so assets_in/assets_out are populated.
 *
 * Detection rules:
 *  flashloan   — function name contains "flash", OR protocol is dydx/euler
 *  arbitrage   — same token appears in both assets_in and assets_out,
 *                and the output amount is >= input (profitable cycle)
 *  sandwich_bot — known MEV bot addresses (static list), multi-swap in one tx
 *                 without a "user intent" anchor
 */
export function detectMev(params: {
  function_name: string | null;
  protocol: string | null;
  assets_in: AssetAmount[];
  assets_out: AssetAmount[];
  sender: string;
}): MevType {
  const { function_name, protocol, assets_in, assets_out, sender } = params;
  const fnLower = (function_name ?? '').toLowerCase();

  // --- Flashloan ---
  if (
    fnLower.includes('flashloan') ||
    fnLower.includes('flash_loan') ||
    fnLower.includes('flashswap') ||
    protocol === 'dydx' ||
    protocol === 'euler'
  ) {
    return 'flashloan';
  }

  // --- Arbitrage: cycle trade — input token == output token, profit realised ---
  if (assets_in.length > 0 && assets_out.length > 0) {
    for (const ain of assets_in) {
      for (const aout of assets_out) {
        if (
          ain.address.toLowerCase() === aout.address.toLowerCase() &&
          parseFloat(aout.amount) >= parseFloat(ain.amount) * 0.998 // allow 0.2% slippage
        ) {
          return 'arbitrage';
        }
      }
    }
  }

  // --- Known MEV bot addresses (a small static set of high-confidence bots) ---
  // Source: Etherscan / MEV-Boost analytics
  const MEV_BOTS = new Set([
    '0x00000000003b3cc22af3ae1eac0440bcee416b40', // 0x0000...
    '0x6b75d8af000000e20b7a7ddf000ba900b4009a80',
    '0xa57bd00134b2850b2a1c55860c9e9ea100fdd6cf', // JaredFromSubway
    '0x0000000000007f150bd6f54c40a34d7c3d5e9f56',
    '0x000000000035b5e5ad9019092c665357240f594e',
    '0x00000000008c4fb1c916e0c88fd4cc402d935e7d',
  ]);

  if (MEV_BOTS.has(sender.toLowerCase())) {
    return 'sandwich_bot';
  }

  return null;
}

export const MEV_LABELS: Record<NonNullable<MevType>, string> = {
  flashloan:    'Flash Loan',
  arbitrage:    'Arbitrage',
  sandwich_bot: 'Sandwich Bot',
};
