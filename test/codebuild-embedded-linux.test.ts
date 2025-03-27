import { beforeEach, describe, expect, test } from "@jest/globals";
import { Match, Template } from "aws-cdk-lib/assertions";

import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";
import * as iam from "aws-cdk-lib/aws-iam";
import {
  EmbeddedLinuxCodeBuildProjectStack,
  EmbeddedLinuxCodeBuildProjectProps,
} from "../lib";
import { DEFAULT_ENV, normalizedTemplateFromStack } from "./util";

describe("EmbeddedLinuxCodeBuildProjectStack", () => {
  const resource_prefix = "test";

  let app: cdk.App;
  let stack: EmbeddedLinuxCodeBuildProjectStack;
  let props: EmbeddedLinuxCodeBuildProjectProps;
  let template: Template;
  let common: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();

    common = new cdk.Stack(app, `${resource_prefix}-common`, {
      env: DEFAULT_ENV,
    });

    // Create required props
    const vpc = new ec2.Vpc(common, `${resource_prefix}-vpc`, {
      maxAzs: 2,
    });
    const ecrRepository = new ecr.Repository(common, `${resource_prefix}-ecr`);
    const encryptionKey = new kms.Key(common, `${resource_prefix}-key`);

    // Create the pipeline stack & props
    props = {
      env: DEFAULT_ENV,
      ecrRepository: ecrRepository,
      ecrRepositoryImageTag: "latest",
      vpc: vpc,
      encryptionKey: encryptionKey,
    };

    stack = new EmbeddedLinuxCodeBuildProjectStack(
      app,
      `${resource_prefix}-stack`,
      props,
    );

    template = Template.fromStack(stack);
  });

  test("Creates EFS filesystem with security group", () => {
    template.hasResourceProperties("AWS::EFS::FileSystem", {
      FileSystemTags: [
        {
          Key: "Name",
          Value: `${stack.stackName}/EmbeddedLinuxCodeBuildProjectFilesystem`,
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

  test("creates CodeBuild project", () => {
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
                          `${common.stackName}:ExportsOutputFnGetAtt${props.ecrRepository.node.id.replace(/-/g, "")}`,
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
                          `${common.stackName}:ExportsOutputFnGetAtt${props.ecrRepository.node.id.replace(/-/g, "")}`,
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
                  `${common.stackName}:ExportsOutputRef${props.ecrRepository.node.id.replace(/-/g, "")}`,
                ),
              },
              ":latest",
            ],
          ],
        },
        PrivilegedMode: true,
        Type: "LINUX_CONTAINER",
      },
      TimeoutInMinutes: 240,
    });
  });

  test("creates Lambda function for pipeline check", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.handler",
      Runtime: "python3.10",
    });
  });

  test("creates EventBridge rule", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: {
        "detail-type": ["CodePipeline Pipeline Execution State Change"],
        source: ["aws.codepipeline"],
        detail: {
          state: ["STARTED"],
          "execution-trigger": {
            "trigger-type": ["CreatePipeline"],
          },
        },
      },
    });
  });

  test("adds required policies to CodeBuild role", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              "ec2:DescribeSecurityGroups",
              "codestar-connections:GetConnection",
              "codestar-connections:GetConnectionToken",
              "codeconnections:GetConnectionToken",
              "codeconnections:GetConnection",
              "codeconnections:ListConnection",
              "codeconnections:UseConnection",
              "codebuild:ListConnectedOAuthAccounts",
              "codebuild:ListRepositories",
              "codebuild:PersistOAuthToken",
              "codebuild:ImportSourceCredentials",
            ],
            Effect: "Allow",
            Resource: "*",
          }),
        ]),
      },
    });
  });

  test("creates CloudWatch log group", () => {
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 365,
    });
  });

  test("Snapshot", () => {
    /* We must change some randomly generated file names used in the S3 asset construct. */
    const templateWithConstKeys = normalizedTemplateFromStack(stack);
    expect(templateWithConstKeys).toMatchSnapshot();
  });
});

describe("EmbeddedLinuxCodeBuildProjectStack Custom", () => {
  const resource_prefix = "test";

  let app: cdk.App;
  let stack: EmbeddedLinuxCodeBuildProjectStack;
  let props: EmbeddedLinuxCodeBuildProjectProps;
  let template: Template;
  let common: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();

    common = new cdk.Stack(app, `${resource_prefix}-common`, {
      env: DEFAULT_ENV,
    });

    // Create required props
    const vpc = new ec2.Vpc(common, `${resource_prefix}-vpc`, {
      maxAzs: 2,
    });
    const ecrRepository = new ecr.Repository(common, `${resource_prefix}-ecr`);
    const encryptionKey = new kms.Key(common, `${resource_prefix}-key`);
    const customPolicy = new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: ["*"],
    });

    // Create the pipeline stack & props
    props = {
      env: DEFAULT_ENV,
      ecrRepository: ecrRepository,
      ecrRepositoryImageTag: "latest",
      vpc: vpc,
      encryptionKey: encryptionKey,
      buildPolicyAdditions: [customPolicy],
    };

    stack = new EmbeddedLinuxCodeBuildProjectStack(
      app,
      `${resource_prefix}-stack`,
      props,
    );

    template = Template.fromStack(stack);
  });

  test("Creates EFS filesystem with security group", () => {
    template.hasResourceProperties("AWS::EFS::FileSystem", {
      FileSystemTags: [
        {
          Key: "Name",
          Value: `${stack.stackName}/EmbeddedLinuxCodeBuildProjectFilesystem`,
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

  test("creates CodeBuild project", () => {
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
                          `${common.stackName}:ExportsOutputFnGetAtt${props.ecrRepository.node.id.replace(/-/g, "")}`,
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
                          `${common.stackName}:ExportsOutputFnGetAtt${props.ecrRepository.node.id.replace(/-/g, "")}`,
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
                  `${common.stackName}:ExportsOutputRef${props.ecrRepository.node.id.replace(/-/g, "")}`,
                ),
              },
              ":latest",
            ],
          ],
        },
        PrivilegedMode: true,
        Type: "LINUX_CONTAINER",
      },
      TimeoutInMinutes: 240,
    });
  });

  test("creates Lambda function for pipeline check", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.handler",
      Runtime: "python3.10",
    });
  });

  test("creates EventBridge rule", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: {
        "detail-type": ["CodePipeline Pipeline Execution State Change"],
        source: ["aws.codepipeline"],
        detail: {
          state: ["STARTED"],
          "execution-trigger": {
            "trigger-type": ["CreatePipeline"],
          },
        },
      },
    });
  });

  test("adds required policies to CodeBuild role", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              "ec2:DescribeSecurityGroups",
              "codestar-connections:GetConnection",
              "codestar-connections:GetConnectionToken",
              "codeconnections:GetConnectionToken",
              "codeconnections:GetConnection",
              "codeconnections:ListConnection",
              "codeconnections:UseConnection",
              "codebuild:ListConnectedOAuthAccounts",
              "codebuild:ListRepositories",
              "codebuild:PersistOAuthToken",
              "codebuild:ImportSourceCredentials",
            ],
            Effect: "Allow",
            Resource: "*",
          }),
        ]),
      },
    });
  });

  test("creates CloudWatch log group", () => {
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 365,
    });
  });

  test("adds custom policy statements when provided", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyName: Match.stringLikeRegexp(
        `EmbeddedLinuxCodeBuildProjectRoleDefaultPolicy*`,
      ),
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "s3:GetObject",
            Effect: "Allow",
            Resource: "*",
          }),
        ]),
      },
    });
  });

  test("Snapshot", () => {
    /* We must change some randomly generated file names used in the S3 asset construct. */
    const templateWithConstKeys = normalizedTemplateFromStack(stack);
    expect(templateWithConstKeys).toMatchSnapshot();
  });
});
