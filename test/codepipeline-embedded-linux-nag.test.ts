import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";

import { Annotations, Match } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { EmbeddedLinuxCodePipelineStack } from "../lib/codepipeline-embedded-linux";
import { ProjectKind } from "../lib";
import { DEFAULT_ENV } from "./util";
import { VMImportBucket } from "../lib/vm-import-bucket";

function addNagSuppressions(stack: cdk.Stack) {
  NagSuppressions.addStackSuppressions(stack, [
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
    stack,
    `/${stack.stackName}/EmbeddedLinuxCodePipelineBucketDeploymentRole/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "/aws/lambda/EmbeddedLinuxCodePipeline-CustomCDKBucketDeployment* is needed here.",
      },
    ],
  );
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
    `/${stack.stackName}/EmbeddedLinuxCodePipelineProject/PolicyDocument/Resource`,
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
    `/${stack.stackName}/EmbeddedLinuxCodePipelineProject/Role/DefaultPolicy/Resource`,
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
    `/${stack.stackName}/EmbeddedLinuxCodePipelineBucketDeploymentRole/DefaultPolicy/Resource`,
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
    `/${stack.stackName}/EmbeddedLinuxCodePipeline/Role/DefaultPolicy/Resource`,
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
    `/${stack.stackName}/EmbeddedLinuxCodePipeline/Artifact/Artifact/CodePipelineActionRole/DefaultPolicy/Resource`,
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
    `/${stack.stackName}/EmbeddedLinuxCodePipeline/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource`,
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
    `/${stack.stackName}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource`,
    [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "This is a default CDK created policy, with default policy permissions.",
      },
    ],
  );
  NagSuppressions.addResourceSuppressionsByPath(
    stack,
    `/${stack.stackName}/EmbeddedLinuxCodePipelineOSImageCheckOnStart/Resource`,
    [
      {
        id: "AwsSolutions-L1",
        reason: "There is no latest PYTHON version to set.",
      },
    ],
  );
}

describe("EmbeddedLinuxCodePipelineStack cdk-nag AwsSolutions Pack", () => {
  const app: cdk.App = new cdk.App();
  let stack: cdk.Stack;

  beforeAll(() => {
    // GIVEN
    const baseStack = new cdk.Stack(app, "BaseStack", { env: DEFAULT_ENV });

    // GIVEN
    const encryptionKey = new kms.Key(baseStack, "EncryptionKey", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enableKeyRotation: true,
    });
    const sourceBucket = new s3.Bucket(baseStack, "SourceBucket", {
      versioned: true,
    });
    const artifactBucket = new s3.Bucket(baseStack, "ArtifactBucket", {});
    // const outputBucket = new s3.Bucket(baseStack, 'OutputtBucket', {});
    const outputBucketVMImportBucket = new VMImportBucket(
      baseStack,
      "OutputtBucketVMImportBucket",
      {
        encryptionKey: encryptionKey,
      },
    );
    const ecrRepository = new ecr.Repository(baseStack, "EcrRepository", {});
    const vpc = new ec2.Vpc(baseStack, "Vpc", {});

    stack = new EmbeddedLinuxCodePipelineStack(app, "MyTestStack", {
      env: DEFAULT_ENV,
      sourceBucket: sourceBucket,
      ecrRepository: ecrRepository,
      ecrRepositoryImageTag: "ubuntu_22_04",
      artifactBucket: artifactBucket,
      outputBucket: outputBucketVMImportBucket,
      projectKind: ProjectKind.PokyAmi,
      vpc: vpc,
      artifactOutputObjectKey: `${ProjectKind.PokyAmi}`,
      encryptionKey: encryptionKey,
    });

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
