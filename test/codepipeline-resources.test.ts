import { beforeEach, describe, expect, it, test } from '@jest/globals';
import { Match, Template } from 'aws-cdk-lib/assertions';

import * as cdk from "aws-cdk-lib";
import {
  PipelineResourcesProps,
  PipelineResourcesStack
} from "../lib";
import { DEFAULT_ENV, normalizedTemplateFromStack } from "./util";

const resource_prefix = "test";
Object.prototype.toString = function () {
  return JSON.stringify(this);
};

describe("PipelineResourcesStack", () => {
  const resource_prefix = "test";

  let app: cdk.App;
  let stack: PipelineResourcesStack;
  let props: PipelineResourcesProps;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();

    props = {
      resource_prefix: resource_prefix,
      env: DEFAULT_ENV,
    };

    stack = new PipelineResourcesStack(app, `${resource_prefix}-stack`, props);
    template = Template.fromStack(stack);
  });

  test("creates VPC with correct CIDR", () => {
    template.hasResourceProperties("AWS::EC2::VPC", {
      CidrBlock: "10.0.0.0/16",
    });
  });

  test("creates ECR repository", () => {
    template.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: `${resource_prefix}-${DEFAULT_ENV.account}-${DEFAULT_ENV.region}-repo`
    });
  });

  test("creates KMS key with rotation enabled", () => {
    template.hasResourceProperties("AWS::KMS::Key", {
      EnableKeyRotation: true,
    });
  });

  const bucketSuffixes = [`artifact`, `source`, `output`, `logs`];
  it.each(bucketSuffixes)(`Has S3 Bucket with versioning enabled`, (bucketSuffix) => {
    const bucketName = `${resource_prefix}-${DEFAULT_ENV.account}-${DEFAULT_ENV.region}-${bucketSuffix}`;
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: bucketName,
      VersioningConfiguration: {
        Status: "Enabled",
      },
    });
  });

  test("creates VPC flow logs", () => {
    template.hasResourceProperties("AWS::EC2::FlowLog", {
      ResourceType: "VPC",
      TrafficType: "ALL",
    });

    template.hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 365,
    });
  });

  test("creates buckets and ECR repo with custom names when provided", () => {
    const customName: string = `${resource_prefix}-${DEFAULT_ENV.account}-${DEFAULT_ENV.region}-custom-xxxxxxxxxxxxxx`;
    const appWithCustomNames = new cdk.App();
    const stackWithCustomNames = new PipelineResourcesStack(
      appWithCustomNames,
      `${resource_prefix}-stack-custom`,
      {
        resource_prefix: resource_prefix,
        ecrRepositoryName: customName,
        pipelineArtifactBucketName: customName,
        pipelineSourceBucketName: customName,
        pipelineOutputBucketName: customName,
        loggingBucketName: customName,
      }
    );
    const templateWithCustomNames = Template.fromStack(stackWithCustomNames);

    templateWithCustomNames.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: customName,
    });

    templateWithCustomNames.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: customName,
    });

    templateWithCustomNames.resourceCountIs("AWS::S3::Bucket", 4);
  });

  test("Logs Have Minimum Retention Period", () => {
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    template.allResourcesProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 365,
    });
  });

  test("creates required outputs", () => {
    template.hasOutput("LoggingBucket", {});
    template.hasOutput("SourceBucket", {});
    template.hasOutput("ArtifactBucket", {});
    template.hasOutput("OutputBucket", {});
  });

  test("enforces SSL on all buckets", () => {
    const buckets = template.findResources("AWS::S3::Bucket");
    template.resourceCountIs("AWS::S3::BucketPolicy", Object.keys(buckets).length);

    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([Match.objectLike(
          {
            Action: "s3:*",
            Condition: {
              Bool: {
                "aws:SecureTransport": "false",
              },
            },
            Effect: "Deny",
            Principal: {
              AWS: "*",
            },
          },
        )])
      },
    });
  });

  test("Snapshot", () => {
    /* We must change some randomly generated file names used in the S3 asset construct. */
    const templateWithConstKeys = normalizedTemplateFromStack(stack);
    expect(templateWithConstKeys).toMatchSnapshot();
  });
});
