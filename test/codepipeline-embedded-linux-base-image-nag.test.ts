import * as cdk from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import {
  EmbeddedLinuxCodePipelineBaseImageProps,
  EmbeddedLinuxCodePipelineBaseImageStack,
} from "../lib/codepipeline-embedded-linux-base-image";
import { DEFAULT_ENV } from "./util";

function addNagSuppressions(stack: cdk.Stack) {
  NagSuppressions.addResourceSuppressionsByPath(
    stack,
    `/${stack.stackName}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/Resource`,
    [
      {
        id: "AwsSolutions-L1",
        reason: "This Lambda function is 3rd Party (from CDK libs)",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    stack,
    `/${stack.stackName}/CodePipelineBuildBaseImageBucketDeploymentRole/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because CodePipelineBuildBaseImageBucketDeploymentRole/Resource is needed here.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    stack,
    `/${stack.stackName}/CodePipelineBuildBaseImageBucketDeploymentRole/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    stack,
    `/${stack.stackName}/CodePipelineBuildBaseImageProject/Role/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    stack,
    `/${stack.stackName}/CodePipelineBuildBaseImageCodePipeline/Role/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    stack,
    `/${stack.stackName}/CodePipelineBuildBaseImageCodePipeline/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Because these are the default permissions assigned to a CDK default created role.",
      },
    ],
  );
}

describe("EmbeddedLinuxCodePipelineBaseImageStack cdk-nag AwsSolutions Pack", () => {
  const app: cdk.App = new cdk.App();
  let stack: cdk.Stack;

  beforeAll(() => {
    // GIVEN
    const baseStack = new cdk.Stack(app, "BaseStack", { env: DEFAULT_ENV });

    const encryptionKey = new kms.Key(baseStack, "EncryptionKey", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enableKeyRotation: true,
    });
    const pipelineSourceBucket = new s3.Bucket(
      baseStack,
      "PipelineSourceBucket",
      {
        versioned: true,
      },
    );
    const pipelineArtifactBucket = new s3.Bucket(
      baseStack,
      "PipelineArtifactBucket",
      {},
    );
    const ecrRepository = new ecr.Repository(baseStack, "EcrRepository", {});

    const props: EmbeddedLinuxCodePipelineBaseImageProps = {
      env: DEFAULT_ENV,
      pipelineSourceBucket: pipelineSourceBucket,
      pipelineArtifactBucket: pipelineArtifactBucket,
      ecrRepository: ecrRepository,
      encryptionKey: encryptionKey,
    };

    stack = new EmbeddedLinuxCodePipelineBaseImageStack(
      app,
      "MyTestStack",
      props,
    );

    addNagSuppressions(stack);

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
