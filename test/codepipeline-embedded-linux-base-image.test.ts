import * as cdk from "aws-cdk-lib";
import * as assertions from "aws-cdk-lib/assertions";
import { PipelineResourcesProps, PipelineResourcesStack } from "../lib";
import {
  EmbeddedLinuxCodePipelineBaseImageProps,
  EmbeddedLinuxCodePipelineBaseImageStack,
} from "../lib";
import { DEFAULT_ENV, normalizedTemplateFromStack } from "./util";

// TODO
// - add test with PipelineResourcesProps values for various buckets
// - add test for other outouts

describe("EmbeddedLinuxCodePipelineBaseImageStack", () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: assertions.Template;
  let pipelineResourcesStack: PipelineResourcesStack;

  const pipelineResourcesProps: PipelineResourcesProps = {
    resource_prefix: "test",
    env: DEFAULT_ENV,
  };

  beforeAll(() => {
    // GIVEN
    app = new cdk.App();
    pipelineResourcesStack = new PipelineResourcesStack(
      app,
      "MyResourceStack",
      pipelineResourcesProps,
    );

    const embeddedLinuxCodePipelineBaseImageProps: EmbeddedLinuxCodePipelineBaseImageProps =
      {
        env: DEFAULT_ENV,
        sourceBucket: pipelineResourcesStack.sourceBucket,
        ecrRepository: pipelineResourcesStack.ecrRepository,
        artifactBucket: pipelineResourcesStack.artifactBucket,
        encryptionKey: pipelineResourcesStack.encryptionKey,
      };
    stack = new EmbeddedLinuxCodePipelineBaseImageStack(
      app,
      "MyTestStack",
      embeddedLinuxCodePipelineBaseImageProps,
    );
    template = assertions.Template.fromStack(stack);
  });

  test("Has Resources", () => {
    template.resourceCountIs("AWS::CodePipeline::Pipeline", 1);
    template.resourceCountIs("AWS::CodeBuild::Project", 1);
    template.resourceCountIs("AWS::Events::Rule", 2); // one for the S3 trigger and one for the weekly refresh
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
