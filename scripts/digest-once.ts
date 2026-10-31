import { getDatabase } from "../src/db";
import { planOneDigest, dispatchDigest } from "../src/jobs/digests";
const db = await getDatabase();
try {
  console.log({
    planned: await planOneDigest(db.sql),
    dispatched: await dispatchDigest(db.sql),
    deliveryMode: "local_sink",
  });
} finally {
  await db.close();
}
