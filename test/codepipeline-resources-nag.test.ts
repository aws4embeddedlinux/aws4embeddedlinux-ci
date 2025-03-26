import { describe, expect, test, beforeAll } from '@jest/globals';
import { AwsSolutionsChecks } from "cdk-nag";
import { Annotations, Match } from "aws-cdk-lib/assertions";

import * as cdk from "aws-cdk-lib";
import {
  PipelineResourcesProps,
  PipelineResourcesStack
} from "../lib";
import { DEFAULT_ENV } from "./util";


describe("PipelineResourcesStack cdk-nag AwsSolutions Pack", () => {
  const resource_prefix = "test";

  let app: cdk.App;
  let stack: PipelineResourcesStack;
  let props: PipelineResourcesProps;

  beforeAll(() => {
    // GIVEN
    app = new cdk.App();

    props = {
      env: DEFAULT_ENV,
      resource_prefix: `${DEFAULT_ENV.account}-${DEFAULT_ENV.region}`,
    };

    stack = new PipelineResourcesStack(app, `${resource_prefix}-stack`, props);

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
