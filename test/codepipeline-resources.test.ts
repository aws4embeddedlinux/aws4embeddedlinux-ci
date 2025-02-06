import * as cdk from "aws-cdk-lib";
import * as assertions from "aws-cdk-lib/assertions";
import { PipelineResourcesProps, PipelineResourcesStack } from "../lib";
import { DEFAULT_ENV, normalizedTemplateFromStack } from "./util";

// TODO
// - add test with PipelineResourcesProps values for various buckets
// - add test for other outouts

describe("PipelineResourcesStack", () => {
  let stack: cdk.Stack, app: cdk.App, template: assertions.Template;
  const props: PipelineResourcesProps = {
    resource_prefix: "test",
    env: DEFAULT_ENV,
  };
  beforeAll(() => {
    // GIVEN
    app = new cdk.App();
    stack = new PipelineResourcesStack(app, "MyTestStack", props);
    template = assertions.Template.fromStack(stack);
  });

  const bucketSuffixes = [
    `artifact`,
    `source`,
    `output`,
    `logs`,
  ];
  it.each(bucketSuffixes)(`Has S3 Bucket`, (bucketSuffix) => {
    const bucketName =
      `${props.resource_prefix}-${props.env?.account}-${props.env?.region}-${bucketSuffix}`.toLowerCase();
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: bucketName,
    });
  });

  test("Has Versionned S3 Bucket - Source", () => {
    expect(
      Object.keys(template.findResources("AWS::S3::Bucket")).find((key) =>
        key.match(/^PipelineResourcesSourceBucket[A-F0-9]{8}$/),
      ),
    ).toBeDefined();
    expect(
      Object.entries(template.findResources("AWS::S3::Bucket")).filter(
        ([key, value]) =>
          key.match(/^PipelineResourcesSourceBucket[A-F0-9]{8}$/) &&
          value.Properties.VersioningConfiguration.Status == "Enabled",
      ),
    ).toHaveLength(1);
  });

  test("Logs Have Retention Period", () => {
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
