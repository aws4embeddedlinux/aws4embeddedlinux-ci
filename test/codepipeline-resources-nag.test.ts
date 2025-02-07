import * as cdk from "aws-cdk-lib";

import { Annotations, Match } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { DEFAULT_ENV } from "./util";
import { PipelineResourcesStack } from "../lib";

function addNagSuppressions(stack: cdk.Stack) {
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
