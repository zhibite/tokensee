import axios from 'axios';
import { query } from '../../services/db/Database.js';

interface FourByteEntry {
  id: number;
  text_signature: string;
}

interface FourByteResponse {
  results: FourByteEntry[];
}

export class FourByteResolver {
  private readonly baseUrl = 'https://www.4byte.directory/api/v1/signatures/';

  async resolve(selector: string): Promise<string | null> {
    // Check DB cache first
    const cached = await this.getFromDb(selector);
    if (cached) return cached;

    // Query 4byte.directory
    try {
      const response = await axios.get<FourByteResponse>(this.baseUrl, {
        params: { hex_signature: selector },
        timeout: 5000,
      });

      const results = response.data.results;
      if (!results || results.length === 0) return null;

      // Take lowest id (most established signature)
      const best = results.sort((a, b) => a.id - b.id)[0];
      const sig = best.text_signature;

      // Cache in DB
      await this.saveToDb(selector, sig);
      return sig;
    } catch (err) {
      console.warn(`4byte.directory lookup failed for ${selector}:`, err);
      return null;
    }
  }

  private async getFromDb(selector: string): Promise<string | null> {
    try {
      const result = await query<{ text_signature: string }>(
        'SELECT text_signature FROM abi_selector_cache WHERE selector = $1',
        [selector]
      );
      return result.rows[0]?.text_signature ?? null;
    } catch {
      return null; // DB might not be available in dev without migrations
    }
  }

  private async saveToDb(selector: string, textSignature: string): Promise<void> {
    try {
      await query(
        `INSERT INTO abi_selector_cache (selector, text_signature)
         VALUES ($1, $2)
         ON CONFLICT (selector) DO NOTHING`,
        [selector, textSignature]
      );
    } catch {
      // Non-critical — cache miss is acceptable
    }
  }
}

export const fourByteResolver = new FourByteResolver();
