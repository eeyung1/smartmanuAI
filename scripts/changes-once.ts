import { runLocalNotificationJob } from "./lib/local-notification-job";
import { detectMaterialChangeAlerts } from "../src/jobs/material-changes";
import { dispatchOne } from "../src/jobs/local";
await runLocalNotificationJob(async (sql) => ({
  detection: await detectMaterialChangeAlerts(sql),
  dispatch: await dispatchOne(sql, "material_change"),
}));
