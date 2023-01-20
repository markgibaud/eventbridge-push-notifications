import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  SchedulerClient,
  CreateScheduleCommand,
  FlexibleTimeWindowMode,
  CreateScheduleGroupCommand,
} from "@aws-sdk/client-scheduler";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { requestSchema } from "./requestSchema";

const schedulerClient = new SchedulerClient({ region: "eu-west-1" });

export type NotificationReminder = z.infer<typeof requestSchema>;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "No body found" }),
    };
  }

  const reminder: NotificationReminder = requestSchema.parse(
    JSON.parse(event.body)
  );

  try {
    // Create the schedule group for now, this would be done in CDK when we can
    await schedulerClient.send(
      new CreateScheduleGroupCommand({
        Name: "NotificationRulesScheduleGroup",
      })
    );
  } catch (error) {}

  try {
    const cmd = new CreateScheduleCommand({
      // A rule can't have the same name as another rule
      // in the same Region and on the same event bus.
      Name: `${uuidv4()}`,
      GroupName: "NotificationRulesScheduleGroup",
      Target: {
        RoleArn: process.env.SCHEDULE_ROLE_ARN,
        Arn: process.env.EVENTBUS_ARN,
        EventBridgeParameters: {
          DetailType: "ReminderNotification",
          Source: "scheduler.notifications", // this can be anything you want
        },
        Input: JSON.stringify({ ...reminder }),
      },
      FlexibleTimeWindow: {
        Mode: FlexibleTimeWindowMode.OFF,
      },
      Description: `Send push notification to ${reminder.device_token} at ${reminder.datetime}`,
      ScheduleExpression: `at(${reminder.datetime})`,
    });
    await schedulerClient.send(cmd);
  } catch (error) {
    console.log("failed", error);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Notification reminder created successfully",
    }),
  };
};
