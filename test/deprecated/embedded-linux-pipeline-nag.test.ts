import { EmbeddedLinuxPipelineStack } from "../../lib/deprecated/embedded-linux-pipeline";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { Vpc } from "aws-cdk-lib/aws-ec2";

import { Annotations, Match } from "aws-cdk-lib/assertions";
import { App, Aspects, Stack } from "aws-cdk-lib";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { ProjectKind } from "../../lib";

describe("Pipeline cdk-nag AwsSolutions Pack", () => {
  let stack: Stack;
  let app: App;
  let vpc: Vpc;
  let imageRepo: Repository;
  let newStack: Stack;
  beforeAll(() => {
    // GIVEN
    app = new App();
    const env = { account: "12341234", region: "eu-central-1" };
    newStack = new Stack(app, "RepoStack", { env });
    imageRepo = new Repository(newStack, "Repository", {});
    vpc = new Vpc(newStack, "Bucket", {});

    stack = new EmbeddedLinuxPipelineStack(app, "MyTestStack", {
      env,
      imageRepo,
      vpc,
      projectKind: ProjectKind.PokyAmi,
    });

    NagSuppressions.addStackSuppressions(stack, [
      {
        id: "CdkNagValidationFailure",
        reason: "Multiple Validation Failures.",
      },
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
      "/MyTestStack/VMImportRole/Resource",
      [
        {
          id: "AwsSolutions-IAM5",
          reason: "Read permissions needed on bucket.",
          appliesTo: [
            {
              regex: "/Resource::<PipelineOutput78594CB5.Arn>/\\*$/g",
            },
            {
              regex: "/Resource::arn:aws:ec2:eu-central-1::snapshot/\\*$/g",
            },
            {
              regex: "/Resource::\\*$/g",
            },
          ],
        },
      ],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      "/MyTestStack/EmbeddedLinuxBuildProject/Role/DefaultPolicy/Resource",
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "This is a default CDK created role, with default policy permissions.",
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      "/MyTestStack/EmbeddedLinuxBuildProject/PolicyDocument/Resource",
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
      "/MyTestStack/EmbeddedLinuxPipeline/Role/DefaultPolicy/Resource",
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
      "/MyTestStack/EmbeddedLinuxPipeline/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource",
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
      "/MyTestStack/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource",
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
      "/MyTestStack/EmbeddedLinuxPipeline/Artifact/Artifact/CodePipelineActionRole/DefaultPolicy/Resource",
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
      "/MyTestStack/OSImageCheckOnStart/Resource",
      [
        {
          id: "AwsSolutions-L1",
          reason: "There is no latest PYTHON version to set.",
        },
      ],
    );
    // WHEN
    Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));
  });

  // THEN
  test("No unsuppressed Warnings", () => {
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );

    expect(warnings).toHaveLength(0);
  });

  test("No unsuppressed Errors", () => {
    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );

    expect(errors).toHaveLength(0);
  });
});
