#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EventBridgeRemindersStack } from "../lib/eventBridgeRemindersStack";

const app = new cdk.App();
new EventBridgeRemindersStack(app, "eb-reminders", {
  env: { account: "YOUR_AWS_ACCOUNT_ID", region: "eu-west-1" },
});
