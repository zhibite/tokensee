import 'dotenv/config';
import { db, closePool } from '../src/services/db/Database.js';

const r1 = await db.query('SELECT COUNT(*) cnt FROM entities');
console.log('TOTAL:', r1.rows[0].cnt);

const r2 = await db.query('SELECT source, COUNT(*) AS n FROM entities GROUP BY source ORDER BY COUNT(*) DESC');
console.log('\n── by source ──────────────────────────');
for (const row of r2.rows) console.log(' ', (row.source as string).padEnd(24), row.n);

const r3 = await db.query('SELECT entity_type, COUNT(*) AS n FROM entities GROUP BY entity_type ORDER BY COUNT(*) DESC');
console.log('\n── by type ────────────────────────────');
for (const row of r3.rows) console.log(' ', (row.entity_type as string).padEnd(14), row.n);

await closePool();
