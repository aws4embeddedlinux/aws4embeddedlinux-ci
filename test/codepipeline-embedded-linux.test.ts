import * as cdk from "aws-cdk-lib";
import * as assertions from "aws-cdk-lib/assertions";
import {
  PipelineResourcesProps,
  PipelineResourcesStack,
  ProjectKind,
} from "../lib";
import {
  EmbeddedLinuxCodePipelineBaseImageProps,
  EmbeddedLinuxCodePipelineBaseImageStack,
} from "../lib";
import {
  EmbeddedLinuxCodePipelineProps,
  EmbeddedLinuxCodePipelineStack,
} from "../lib";
import { DEFAULT_ENV, normalizedTemplateFromStack } from "./util";

// TODO
// - add test with PipelineResourcesProps values for various buckets
// - add test for other outouts

describe("EmbeddedLinuxCodePipelineStack", () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: assertions.Template;
  let pipelineResourcesStack: PipelineResourcesStack;
  let embeddedLinuxCodePipelineBaseImageStack: EmbeddedLinuxCodePipelineBaseImageStack;

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
    embeddedLinuxCodePipelineBaseImageStack =
      new EmbeddedLinuxCodePipelineBaseImageStack(
        app,
        "MyBaseImageStack",
        embeddedLinuxCodePipelineBaseImageProps,
      );

    const embeddedLinuxCodePipelineProps: EmbeddedLinuxCodePipelineProps = {
      env: DEFAULT_ENV,
      ecrRepository: embeddedLinuxCodePipelineBaseImageStack.ecrRepository,
      ecrRepositoryImageTag:
        embeddedLinuxCodePipelineBaseImageStack.ecrRepositoryImageTag,
      sourceBucket: pipelineResourcesStack.sourceBucket,
      artifactBucket: pipelineResourcesStack.artifactBucket,
      outputBucket: pipelineResourcesStack.outputBucket,
      projectKind: ProjectKind.Poky,
      vpc: pipelineResourcesStack.vpc,
      artifactOutputObjectKey: "pipeline-poky",
      encryptionKey: pipelineResourcesStack.encryptionKey,
    };

    stack = new EmbeddedLinuxCodePipelineStack(
      app,
      "MyTestStack",
      embeddedLinuxCodePipelineProps,
    );
    template = assertions.Template.fromStack(stack);
  });

  test("Has Resources", () => {
    template.resourceCountIs("AWS::CodePipeline::Pipeline", 1);
    template.resourceCountIs("AWS::CodeBuild::Project", 1);
    // AWS::Events::Rule:
    //  - the S3 trigger
    //  - the CodePipeline Execution State Change
    //  - the weekly refresh
    template.resourceCountIs("AWS::Events::Rule", 3);
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
