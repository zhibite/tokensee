import { decodeFunctionData, type Abi } from 'viem';
import { createRequire } from 'module';
import type { SupportedChain } from '../../types/chain.types.js';

const require = createRequire(import.meta.url);

export type AbiResolution = {
  method: 'known_abi' | 'four_byte';
  functionName: string;
  args: Record<string, unknown>;
} | null;

interface AbiEntry {
  abi: Abi;
  protocolId: string;
}

export class AbiRegistry {
  // address (lowercase) → ABI entry
  private addressMap = new Map<string, AbiEntry>();
  // protocolId → ABI (for shared protocol ABIs)
  private protocolMap = new Map<string, Abi>();

  constructor() {
    this.loadBuiltinAbis();
  }

  private loadBuiltinAbis() {
    const uniV3Abi = require('./abis/uniswap-v3-router.json') as Abi;
    const uniV2Abi = require('./abis/uniswap-v2-router.json') as Abi;

    this.protocolMap.set('uniswap-v3', uniV3Abi);
    this.protocolMap.set('uniswap-v2', uniV2Abi);
    this.protocolMap.set('pancakeswap-v2', uniV2Abi); // PancakeSwap V2 uses same ABI as Uniswap V2
  }

  registerAddress(address: string, protocolId: string) {
    const abi = this.protocolMap.get(protocolId);
    if (!abi) throw new Error(`No ABI registered for protocol: ${protocolId}`);
    this.addressMap.set(address.toLowerCase(), { abi, protocolId });
  }

  decodeWithKnownAbi(
    contractAddress: string,
    calldata: string,
    _chain: SupportedChain
  ): AbiResolution {
    const entry = this.addressMap.get(contractAddress.toLowerCase());
    if (!entry) return null;

    try {
      const decoded = decodeFunctionData({ abi: entry.abi, data: calldata as `0x${string}` });
      return {
        method: 'known_abi',
        functionName: decoded.functionName,
        args: this.argsToRecord(decoded.args),
      };
    } catch {
      return null;
    }
  }

  decodeWithMinimalAbi(textSignature: string, calldata: string): AbiResolution {
    const parsed = this.parseTextSignature(textSignature);
    if (!parsed) return null;

    try {
      const minimalAbi: Abi = [
        {
          type: 'function',
          name: parsed.name,
          inputs: parsed.inputs,
          outputs: [],
          stateMutability: 'nonpayable',
        } as Abi[number],
      ];
      const decoded = decodeFunctionData({ abi: minimalAbi, data: calldata as `0x${string}` });
      return {
        method: 'four_byte',
        functionName: decoded.functionName,
        args: this.argsToRecord(decoded.args),
      };
    } catch {
      return null;
    }
  }

  private parseTextSignature(
    sig: string
  ): { name: string; inputs: Array<{ name: string; type: string }> } | null {
    // e.g. "transfer(address,uint256)"
    const match = sig.match(/^(\w+)\((.*)?\)$/);
    if (!match) return null;
    const name = match[1];
    const paramStr = match[2]?.trim() ?? '';
    if (!paramStr) return { name, inputs: [] };

    const inputs = paramStr.split(',').map((type, i) => ({
      name: `arg${i}`,
      type: type.trim(),
    }));
    return { name, inputs };
  }

  private argsToRecord(args: readonly unknown[] | undefined): Record<string, unknown> {
    if (!args) return {};
    return Object.fromEntries(args.map((v, i) => [i.toString(), v]));
  }

  getProtocolIdForAddress(address: string): string | null {
    return this.addressMap.get(address.toLowerCase())?.protocolId ?? null;
  }
}

export const abiRegistry = new AbiRegistry();
