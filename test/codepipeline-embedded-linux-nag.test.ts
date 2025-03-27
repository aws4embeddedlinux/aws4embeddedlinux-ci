import { describe, expect, test, beforeAll } from "@jest/globals";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { Annotations, Match } from "aws-cdk-lib/assertions";

import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";
import {
  ProjectType,
  EmbeddedLinuxCodePipelineStack,
  EmbeddedLinuxCodePipelineProps,
} from "../lib";
import { DEFAULT_ENV } from "./util";

const base_path = `EmbeddedLinuxCodePipeline`;

function addNagSuppressions(
  _stack: EmbeddedLinuxCodePipelineStack,
  _props: EmbeddedLinuxCodePipelineProps,
) {
  NagSuppressions.addStackSuppressions(_stack, [
    { id: "CdkNagValidationFailure", reason: "Multiple Validation Failures." },
    {
      id: "AwsSolutions-CB3",
      reason: "CodeBuild Privilege mode is required for this pipeline.",
    },
    {
      id: "AwsSolutions-IAM4",
      reason: "TODO: Re-evaluate managed policies per resources.",
    },
  ]);
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}BucketDeploymentRole/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "/aws/lambda/${base_path}-CustomCDKBucketDeployment* is needed here.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/Resource`,
    [
      {
        id: "AwsSolutions-L1",
        reason: "This Lambda function is 3rd Party (from CDK libs)",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}Project/PolicyDocument/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}Project/Role/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}BucketDeploymentRole/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}/Role/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}/Build/Build/CodePipelineActionRole/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}/Output/Output/CodePipelineActionRole/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "This is a default CDK created policy, with default policy permissions.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}OSImageCheckOnStart/Resource`,
    [
      {
        id: "AwsSolutions-L1",
        reason: "There is no latest PYTHON version to set.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}VMImportRole/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason: "Wildcard permissions needed on snapshots, bucket content.",
        appliesTo: [
          {
            regex: `/Resource::arn:aws:ec2:${DEFAULT_ENV.region}::snapshot/\\*$/g`,
          },
          {
            regex: `/Resource::<${_props.pipelineOutputBucket.node.id.replace(/-/g, "")}A5072518.Arn>/\\*$/g`,
          },
          {
            regex: `/Resource::${_stack.stackName}:ExportsOutputFnGetAtt${_props.pipelineOutputBucket.node.id.replace(/-/g, "").toLowerCase()}A5072518ArnD3542377/\\*$/g`,
          },
          {
            regex: `/Resource::test-common:ExportsOutputFnGetAtttestoutA5072518ArnD3542377/\\*$/g`,
          },
          {
            regex: `/Resource::\\*$/g`,
          },
        ],
      },
    ],
  );
}

describe("EmbeddedLinuxCodePipelineStack cdk-nag AwsSolutions Pack", () => {
  const resource_prefix = "test";

  let app: cdk.App;
  let stack: EmbeddedLinuxCodePipelineStack;
  let props: EmbeddedLinuxCodePipelineProps;
  let common: cdk.Stack;

  beforeAll(() => {
    // GIVEN
    app = new cdk.App();

    common = new cdk.Stack(app, `${resource_prefix}-common`, {
      env: DEFAULT_ENV,
    });

    // GIVEN

    // Create required resources for testing
    const pipelineSourceBucket = new s3.Bucket(
      common,
      `${resource_prefix}-src`,
      { versioned: true },
    );
    const pipelineArtifactBucket = new s3.Bucket(
      common,
      `${resource_prefix}-art`,
      {},
    );
    const pipelineOutputBucket = new s3.Bucket(
      common,
      `${resource_prefix}-out`,
      {},
    );
    const ecrRepository = new ecr.Repository(common, `${resource_prefix}-ecr`);
    const encryptionKey = new kms.Key(common, `${resource_prefix}-key`);
    const vpc = new ec2.Vpc(common, `${resource_prefix}-vpc`, {
      maxAzs: 2,
    });

    props = {
      env: DEFAULT_ENV,
      pipelineSourceBucket: pipelineSourceBucket,
      pipelineArtifactBucket: pipelineArtifactBucket,
      pipelineOutputBucket: pipelineOutputBucket,
      ecrRepository: ecrRepository,
      ecrRepositoryImageTag: "ubuntu_22_04",
      projectType: ProjectType.PokyAmi,
      vpc: vpc,
      pipelineArtifactPrefix: `${ProjectType.PokyAmi}`,
      encryptionKey: encryptionKey,
    };
    stack = new EmbeddedLinuxCodePipelineStack(
      app,
      `${resource_prefix}-stack`,
      props,
    );

    addNagSuppressions(stack, props);

    // WHEN
    cdk.Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));
  });

  // THEN
  test("No unsuppressed Warnings", () => {
    const results = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    for (const result of results) {
      console.log(JSON.stringify(result, null, 4));
    }
    expect(results).toHaveLength(0);
  });
  test("No unsuppressed Errors", () => {
    const results = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    for (const result of results) {
      console.log(JSON.stringify(result, null, 4));
    }
    expect(results).toHaveLength(0);
  });
});
