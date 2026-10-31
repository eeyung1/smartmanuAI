import { getDatabase } from "../src/db";
import { localConfig } from "../src/config";
import { purgeOneAccount } from "../src/privacy/account";
const db = await getDatabase();
try {
  console.log({ result: await purgeOneAccount(db.sql, localConfig().dataDir) });
} finally {
  await db.close();
}
