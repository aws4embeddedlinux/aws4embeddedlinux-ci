import { describe, expect, test, beforeAll } from "@jest/globals";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { Annotations, Match } from "aws-cdk-lib/assertions";

import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  EmbeddedLinuxCodeBuildProjectProps,
  EmbeddedLinuxCodeBuildProjectStack,
} from "../lib";
import { DEFAULT_ENV } from "./util";

const base_path = `EmbeddedLinuxCodeBuild`;

function addNagSuppressions(
  _stack: EmbeddedLinuxCodeBuildProjectStack,
  _props: EmbeddedLinuxCodeBuildProjectProps,
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
    `/${_stack.stackName}/${base_path}ProjectSecurityGroup/Resource`,
    [
      {
        id: "AwsSolutions-EC23",
        reason: "CidrBlock parameter referencing an intrinsic function",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    _stack,
    `/${_stack.stackName}/${base_path}Project/Resource`,
    [
      {
        id: "AwsSolutions-CB5",
        reason: "PipelineImage parameter referencing an intrinsic function",
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
    `/${_stack.stackName}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource`,
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
    `/${_stack.stackName}/${base_path}ProjectOSImageCheckOnStart/Resource`,
    [
      {
        id: "AwsSolutions-L1",
        reason: "There is no latest PYTHON version to set.",
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
}

describe("EmbeddedLinuxCodeBuildProjectStack cdk-nag AwsSolutions Pack", () => {
  const resource_prefix = "test";

  let app: cdk.App;
  let stack: EmbeddedLinuxCodeBuildProjectStack;
  let props: EmbeddedLinuxCodeBuildProjectProps;
  let common: cdk.Stack;

  beforeAll(() => {
    // GIVEN
    app = new cdk.App();

    common = new cdk.Stack(app, `${resource_prefix}-common`, {
      env: DEFAULT_ENV,
    });

    // Create required resources for testing
    const vpc = new ec2.Vpc(common, `${resource_prefix}-vpc`, {
      maxAzs: 2,
    });
    const ecrRepository = new ecr.Repository(common, `${resource_prefix}-ecr`);
    const encryptionKey = new kms.Key(common, `${resource_prefix}-key`);

    // Create the pipeline stack & props
    props = {
      env: DEFAULT_ENV,
      ecrRepository: ecrRepository,
      encryptionKey: encryptionKey,
      ecrRepositoryImageTag: "PipelineImage",
      vpc: vpc,
    };

    stack = new EmbeddedLinuxCodeBuildProjectStack(
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
