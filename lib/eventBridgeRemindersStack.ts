import * as cdk from "aws-cdk-lib";
import { Duration } from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import { Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import {
  Effect,
  Policy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export class EventBridgeRemindersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Core infra: EventBridgeReminders Rest API
    const eventBridgeRemindersApi = new apigw.RestApi(this, `${id}-gateway`, {
      restApiName: `${id}-gateway`,
      description: "API for creating push notification reminders",
      deployOptions: {
        stageName: "dev",
      },
    });

    // Core infra: Eventbridge event bus
    const eventBus = new cdk.aws_events.EventBus(this, `${id}-event-bus`, {
      eventBusName: `${id}-event-bus`,
    });

    // need to create a service-linked role and policy for scheduler to
    // be able to put events onto our bus
    const schedulerRole = new Role(this, `${id}-scheduler-role`, {
      assumedBy: new ServicePrincipal("scheduler.amazonaws.com"),
    });

    new Policy(this, `${id}-schedule-policy`, {
      policyName: "ScheduleToPutEvents",
      roles: [schedulerRole],
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["events:PutEvents"],
          resources: [eventBus.eventBusArn],
        }),
      ],
    });

    // Create notification reminder lambda
    const createNotificationReminderLambda = new NodejsFunction(
      this,
      "createNotificationReminder",
      {
        runtime: Runtime.NODEJS_16_X,
        functionName: `${id}-create-notification-reminder`,
        entry: "src/functions/notificationReminder/create.ts",
        handler: "handler",
        memorySize: 512,
        timeout: Duration.seconds(3),
        architecture: Architecture.ARM_64,
        environment: {
          SCHEDULE_ROLE_ARN: schedulerRole.roleArn,
          EVENTBUS_ARN: eventBus.eventBusArn,
        },
        initialPolicy: [
          // Give lambda permission to create the group & schedule and pass IAM role to the scheduler
          new PolicyStatement({
            actions: [
              "scheduler:CreateSchedule",
              "scheduler:CreateScheduleGroup",
              "iam:PassRole",
            ],
            resources: ["*"],
          }),
        ],
      }
    );

    const sendNotificationLambda = new NodejsFunction(
      this,
      "sendNotification",
      {
        functionName: `${id}-send-notification`,
        runtime: Runtime.NODEJS_16_X,
        architecture: Architecture.ARM_64,
        handler: "handler",
        entry: "src/functions/notification/send.ts",
        memorySize: 512,
        timeout: Duration.seconds(3),
        bundling: {
          commandHooks: {
            beforeBundling(): string[] {
              return [];
            },
            // This is an easy way to include files in the bundle
            // of your lambda. A more secure method would be to
            // retrieve and cache this file from S3 in the lambda code
            afterBundling(inputDir: string, outputDir: string): string[] {
              return [
                `cp ${inputDir}/src/functions/notification/firebaseapp-config-XXXXXXX.json ${outputDir}`,
              ];
            },
            beforeInstall() {
              return [];
            },
          },
        },
      }
    );

    // Rule to match schedules for users and attach our email customer lambda.
    new Rule(this, "ReminderNotification", {
      description: "Send a push notification reminding user of a booked court",
      eventPattern: {
        source: ["scheduler.notifications"],
        detailType: ["ReminderNotification"],
      },
      eventBus,
    }).addTarget(new LambdaFunction(sendNotificationLambda));

    const notificationReminderRestResource =
      eventBridgeRemindersApi.root.addResource("notification-reminder");
    notificationReminderRestResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(createNotificationReminderLambda)
    );

    // CDK Outputs
    new cdk.CfnOutput(this, "eventBridgeRemindersApiEndpoint", {
      value: eventBridgeRemindersApi.url,
    });

    //newsworthy:
    // TODO api key
    //scheduler only supported in the major regions
  }
}
