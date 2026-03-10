import type { SupportedChain } from '../../types/chain.types.js';
import type { IProtocolHandler } from '../../types/protocol.types.js';
import { KNOWN_ADDRESSES } from './known-addresses.js';
import { abiRegistry } from '../abi/AbiRegistry.js';
import { UniswapV3Handler } from './handlers/UniswapV3Handler.js';
import { UniswapV2Handler } from './handlers/UniswapV2Handler.js';
import { UniversalRouterHandler } from './handlers/UniversalRouterHandler.js';
import { GenericTransferHandler } from './handlers/GenericTransferHandler.js';
import { AaveV3Handler } from './handlers/AaveV3Handler.js';
import { CurveHandler } from './handlers/CurveHandler.js';
import { CompoundV3Handler } from './handlers/CompoundV3Handler.js';
import { GmxHandler } from './handlers/GmxHandler.js';
import { PendleHandler } from './handlers/PendleHandler.js';
import { EigenLayerHandler } from './handlers/EigenLayerHandler.js';

export class ProtocolRegistry {
  private handlers = new Map<string, IProtocolHandler>();

  constructor() {
    this.registerHandlers();
    this.registerAddresses();
  }

  private registerHandlers() {
    const handlers: IProtocolHandler[] = [
      new UniswapV3Handler(),
      new UniswapV2Handler(),
      new UniversalRouterHandler(),
      new AaveV3Handler(),
      new CurveHandler(),
      new CompoundV3Handler(),
      new GmxHandler(),
      new PendleHandler(),
      new EigenLayerHandler(),
      new GenericTransferHandler(), // fallback — must be last
    ];
    for (const handler of handlers) {
      this.handlers.set(handler.protocolId, handler);
    }
  }

  private registerAddresses() {
    for (const [chain, addrMap] of Object.entries(KNOWN_ADDRESSES)) {
      for (const [address, protocolId] of Object.entries(addrMap)) {
        try {
          abiRegistry.registerAddress(address, protocolId);
        } catch {
          // Protocol ABI not registered — skip silently (e.g. aave-v3 not bundled yet)
        }
        void chain; // used implicitly via KNOWN_ADDRESSES structure
      }
    }
  }

  getProtocolId(address: string, _chain: SupportedChain): string | null {
    const chain = _chain;
    const addrMap = KNOWN_ADDRESSES[chain];
    return addrMap[address.toLowerCase()] ?? null;
  }

  getHandler(protocolId: string): IProtocolHandler | null {
    return this.handlers.get(protocolId) ?? null;
  }

  getFallbackHandler(): IProtocolHandler {
    return this.handlers.get('generic-transfer')!;
  }
}

export const protocolRegistry = new ProtocolRegistry();
