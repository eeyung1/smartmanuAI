import { getDatabase } from "../src/db";
import { dispatchOne } from "../src/jobs/local";
const db = await getDatabase();
try {
  console.log(await dispatchOne(db.sql));
} finally {
  await db.close();
}
