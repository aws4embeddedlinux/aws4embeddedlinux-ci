import * as cdk from "aws-cdk-lib";

import { Annotations, Match } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { DEFAULT_ENV } from "./util";
import { PipelineResourcesStack } from "../lib";

function addNagSuppressions(stack: cdk.Stack) {
  // NagSuppressions.addResourceSuppressionsByPath(
  //   stack,
  //   `/${stack.stackName}/VMImportRole/Resource`,
  //   [
  //     {
  //       id: "AwsSolutions-IAM5",
  //       reason: "Read permissions needed on bucket.",
  //       appliesTo: [
  //         {
  //           regex:
  //             "/Resource::<PipelineResourcesOutputVMImportBucket410130C7.Arn>/\\*$/g",
  //         }
  //       ],
  //     },
  //   ],
  // );
  // NagSuppressions.addResourceSuppressionsByPath(
  //   stack,
  //   `/${stack.stackName}/EmbeddedLinuxCodePipelineVMImportRole/Resource`,
  //   [
  //     {
  //       id: "AwsSolutions-IAM5",
  //       reason: "Wildcard permissions needed on snapshot.",
  //       appliesTo: [
  //         {
  //           regex: `/Resource::arn:aws:ec2:${DEFAULT_ENV.region}::snapshot/\\*$/g`,
  //         }
  //       ],
  //     },
  //   ],
  // );
}

describe("PipelineResourcesStack cdk-nag AwsSolutions Pack", () => {
  const app: cdk.App = new cdk.App();
  let stack: cdk.Stack;

  beforeAll(() => {
    // GIVEN
    const props = {
      env: DEFAULT_ENV,
      resource_prefix: `${DEFAULT_ENV.account}-${DEFAULT_ENV.region}`,
    };

    stack = new PipelineResourcesStack(app, "MyTestStack", props);

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
