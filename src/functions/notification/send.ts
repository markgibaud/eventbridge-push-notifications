import { EventBridgeEvent } from "aws-lambda";
import { NotificationReminder } from "../notificationReminder/create";
import * as admin from "firebase-admin";

export const handler = async (
  event: EventBridgeEvent<"ReminderNotification", NotificationReminder>
) => {
  if (!admin.apps.length) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS =
      "./firebaseapp-config-XXXXXXX.json";
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }

  const result = await admin
    .messaging()
    .sendToDevice(event.detail.device_token, {
      notification: {
        title: `Court Reminder`,
        body: event.detail.message,
        sound: "default",
      },
    });

  console.log("result", JSON.stringify(result));
};
