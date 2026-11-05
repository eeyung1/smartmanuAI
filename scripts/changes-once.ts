import { runLocalNotificationJob } from "./lib/local-notification-job";
import { detectMaterialChangeAlerts } from "../src/jobs/material-changes";
await runLocalNotificationJob(detectMaterialChangeAlerts);
