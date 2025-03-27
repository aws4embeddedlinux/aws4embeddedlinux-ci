import * as path from "path";

import { beforeEach, describe, expect, test } from "@jest/globals";
import { Match, Template } from "aws-cdk-lib/assertions";

import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";
import {
  EmbeddedLinuxCodePipelineProps,
  EmbeddedLinuxCodePipelineStack,
  ProjectType,
} from "../lib";
import { DEFAULT_ENV, normalizedTemplateFromStack } from "./util";

describe("EmbeddedLinuxCodePipelineStack", () => {
  const resource_prefix = "test";

  let app: cdk.App;
  let stack: EmbeddedLinuxCodePipelineStack;
  let props: EmbeddedLinuxCodePipelineProps;
  let template: Template;
  let common: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();

    common = new cdk.Stack(app, `${resource_prefix}-common`, {
      env: DEFAULT_ENV,
    });

    // Create required resources for testing
    const vpc = new ec2.Vpc(common, `${resource_prefix}-vpc`, {
      maxAzs: 2,
    });
    const sourceBucket = new s3.Bucket(common, `${resource_prefix}-src`);
    const artifactBucket = new s3.Bucket(common, `${resource_prefix}-art`);
    const outputBucket = new s3.Bucket(common, `${resource_prefix}-out`);
    const ecrRepository = new ecr.Repository(common, `${resource_prefix}-ecr`);
    const encryptionKey = new kms.Key(common, `${resource_prefix}-key`);

    // Create the pipeline stack & props
    props = {
      env: DEFAULT_ENV,
      pipelineSourceBucket: sourceBucket,
      pipelineArtifactBucket: artifactBucket,
      pipelineOutputBucket: outputBucket,
      ecrRepository: ecrRepository,
      ecrRepositoryImageTag: "latest",
      projectType: ProjectType.Custom,
      vpc: vpc,
      encryptionKey: encryptionKey,
      sourceCustomPath: path.join(__dirname, "buildspec"),
    };
    stack = new EmbeddedLinuxCodePipelineStack(
      app,
      `${resource_prefix}-stack`,
      props,
    );

    // Create template from stack
    template = Template.fromStack(stack);
  });

  test("Has Correct Resources Count", () => {
    template.resourceCountIs("AWS::CodePipeline::Pipeline", 1);
    template.resourceCountIs("AWS::CodeBuild::Project", 1);
    // AWS::Events::Rule:
    //  - the S3 trigger
    //  - the CodePipeline Execution State Change
    //  - the weekly refresh
    template.resourceCountIs("AWS::Events::Rule", 3);
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
  });

  test("Creates CodePipeline with correct stages", () => {
    template.hasResourceProperties("AWS::CodePipeline::Pipeline", {
      Stages: [
        {
          Name: "Source",
          Actions: [
            {
              Name: "Source",
              ActionTypeId: {
                Category: "Source",
                Owner: "AWS",
                Provider: "S3",
                Version: "1",
              },
            },
          ],
        },
        {
          Name: "Build",
          Actions: [
            {
              Name: "Build",
              ActionTypeId: {
                Category: "Build",
                Owner: "AWS",
                Provider: "CodeBuild",
                Version: "1",
              },
            },
          ],
        },
        {
          Name: "Output",
          Actions: [
            {
              Name: "Output",
              ActionTypeId: {
                Category: "Deploy",
                Owner: "AWS",
                Provider: "S3",
                Version: "1",
              },
            },
          ],
        },
      ],
    });
  });

  test("Creates CodeBuild project with correct configuration", () => {
    template.hasResourceProperties("AWS::CodeBuild::Project", {
      Environment: {
        ComputeType: "BUILD_GENERAL1_XLARGE",
        Image: {
          "Fn::Join": [
            "",
            [
              {
                "Fn::Select": [
                  4,
                  {
                    "Fn::Split": [
                      ":",
                      {
                        "Fn::ImportValue": Match.stringLikeRegexp(
                          `${common.stackName}:ExportsOutputFnGetAtt${props.ecrRepository.node.id.replace(/-/g, "")}*`,
                        ),
                      },
                    ],
                  },
                ],
              },
              ".dkr.ecr.",
              {
                "Fn::Select": [
                  3,
                  {
                    "Fn::Split": [
                      ":",
                      {
                        "Fn::ImportValue": Match.stringLikeRegexp(
                          `${common.stackName}:ExportsOutputFnGetAtt${props.ecrRepository.node.id.replace(/-/g, "")}*`,
                        ),
                      },
                    ],
                  },
                ],
              },
              ".",
              {
                Ref: "AWS::URLSuffix",
              },
              "/",
              {
                "Fn::ImportValue": Match.stringLikeRegexp(
                  `${common.stackName}:ExportsOutputRef${props.ecrRepository.node.id.replace(/-/g, "")}*`,
                ),
              },
              ":latest",
            ],
          ],
        },
        PrivilegedMode: true,
        Type: "LINUX_CONTAINER",
      },
    });
  });

  test("Creates EventBridge rule for weekly pipeline execution", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      ScheduleExpression: "cron(0 6 ? * Tuesday *)",
      State: "ENABLED",
      Targets: [
        {
          Arn: {
            "Fn::Join": [
              "",
              [
                "arn:",
                {
                  Ref: "AWS::Partition",
                },
                `:codepipeline:${props.env?.region}:${props.env?.account}:`,
                {
                  Ref: Match.stringLikeRegexp("EmbeddedLinuxCodePipeline*"),
                },
              ],
            ],
          },
          Id: "Target0",
          RoleArn: {
            "Fn::GetAtt": [
              Match.stringLikeRegexp("EmbeddedLinuxCodePipelineEventsRole*"),
              "Arn",
            ],
          },
        },
      ],
    });
  });

  test("Creates EFS filesystem with security group", () => {
    template.hasResourceProperties("AWS::EFS::FileSystem", {
      FileSystemTags: [
        {
          Key: "Name",
          Value: `${stack.stackName}/EmbeddedLinuxCodePipelineFileSystem`,
        },
      ],
      Encrypted: true,
    });

    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      SecurityGroupIngress: Match.arrayWith([
        Match.objectLike({
          CidrIp: {
            "Fn::ImportValue": Match.stringLikeRegexp(
              `${common.stackName}:ExportsOutputFnGetAtt${props.vpc.node.id.replace(/-/g, "")}*`,
            ),
          },
          FromPort: 2049,
          IpProtocol: "tcp",
          ToPort: 2049,
        }),
      ]),
    });
  });

  test("Creates required IAM roles and policies", () => {
    // Test VM import role
    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: `${stack.stackName}-vm-mport`,
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "vmie.amazonaws.com",
            },
          },
        ],
      },
    });

    // Test CodeBuild service role policies
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              "ec2:CreateImage",
              "ec2:CreateTags",
              "ec2:DescribeImages",
              "ec2:DescribeSnapshots",
              "ec2:DescribeImportSnapshotTasks",
              "ec2:DescribeTags",
              "ec2:CancelImportTask",
            ],
            Effect: "Allow",
            Resource: "*",
          }),
        ]),
      },
    });
  });

  test("Logs Have Minimum Retention Period", () => {
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    template.allResourcesProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 365,
    });
  });

  test("Snapshot", () => {
    /* We must change some randomly generated file names used in the S3 asset construct. */
    const templateWithConstKeys = normalizedTemplateFromStack(stack);
    expect(templateWithConstKeys).toMatchSnapshot();
  });
});
