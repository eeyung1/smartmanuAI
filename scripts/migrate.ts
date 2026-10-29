import { getDatabase } from "../src/db";
const db = await getDatabase();
console.log(`Local ${db.kind} migrations applied.`);
await db.close();
