import { localConfig } from "../../src/config";
import { getDatabase, type SQL } from "../../src/db";

export async function runLocalNotificationJob(
  job: (sql: SQL) => Promise<unknown>,
) {
  if (localConfig().mode !== "local")
    throw new Error(
      "Notification job commands require local mode; hosted scheduling is disabled.",
    );
  const db = await getDatabase();
  try {
    console.log(
      JSON.stringify({
        result: await job(db.sql),
        deliveryMode: "local_sink",
        externalDelivery: false,
      }),
    );
  } finally {
    await db.close();
  }
}
