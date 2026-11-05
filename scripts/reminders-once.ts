import { runLocalNotificationJob } from "./lib/local-notification-job";
import { dispatchDeadlineReminders } from "../src/jobs/deadline-reminders";
await runLocalNotificationJob(dispatchDeadlineReminders);
