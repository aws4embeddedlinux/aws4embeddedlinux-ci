import { beforeEach, describe, expect, test } from '@jest/globals';
import { Match, Template } from 'aws-cdk-lib/assertions';

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as kms from 'aws-cdk-lib/aws-kms';
import {
  EmbeddedLinuxCodePipelineBaseImageProps,
  EmbeddedLinuxCodePipelineBaseImageStack
} from "../lib";
import { DEFAULT_ENV, normalizedTemplateFromStack } from "./util";

describe('EmbeddedLinuxCodePipelineBaseImageStack', () => {
  const resource_prefix = "test";

  let app: cdk.App;
  let stack: EmbeddedLinuxCodePipelineBaseImageStack;
  let props: EmbeddedLinuxCodePipelineBaseImageProps;
  let template: Template;
  let common: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();

    common = new cdk.Stack(app, `${resource_prefix}-common`, {
      env: DEFAULT_ENV
    });

    // Create required resources for testing
    const sourceBucket = new s3.Bucket(common, `${resource_prefix}-src`);
    const artifactBucket = new s3.Bucket(common, `${resource_prefix}-art`);
    const ecrRepo = new ecr.Repository(common, `${resource_prefix}-ecr`);
    const encryptionKey = new kms.Key(common, `${resource_prefix}-key`);

    // Create the pipeline stack & props
    props = {
      env: DEFAULT_ENV,
      pipelineSourceBucket: sourceBucket,
      pipelineArtifactBucket: artifactBucket,
      ecrRepository: ecrRepo,
      encryptionKey: encryptionKey,
    };
    stack = new EmbeddedLinuxCodePipelineBaseImageStack(app, `${resource_prefix}-stack`, props);

    // Create template from stack
    template = Template.fromStack(stack);
  });

  test('Pipeline is created with correct stages', () => {
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Name: 'Source',
          Actions: [
            {
              Name: 'Source',
              ActionTypeId: {
                Category: 'Source',
                Owner: 'AWS',
                Provider: 'S3',
                Version: '1'
              }
            }
          ]
        },
        {
          Name: 'Build',
          Actions: [
            {
              Name: 'Build',
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
                Provider: 'CodeBuild',
                Version: '1'
              }
            }
          ]
        }
      ]
    });
  });

  test('CodeBuild project is created with correct configuration', () => {
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: {
        ComputeType: 'BUILD_GENERAL1_MEDIUM',
        Image: 'aws/codebuild/standard:7.0',
        PrivilegedMode: true,
        Type: 'LINUX_CONTAINER'
      }
    });
  });

  test('EventBridge rule is created for weekly pipeline execution', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 6 ? * Monday *)',
      State: 'ENABLED',
      Targets: [
        {
          Arn: {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition'
                },
                `:codepipeline:${props.env?.region}:${props.env?.account}:`,
                {
                  'Ref': Match.stringLikeRegexp("CodePipelineBuildBaseImageCodePipeline*")
                }
              ]
            ]
          }
        }
      ]
    });
  });

  test('CloudWatch log group is created with correct retention', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 365
    });
  });

  test('Required outputs are created', () => {
    template.hasOutput('ECRRepositoryName', {});
    template.hasOutput('ECRBaseImageTag', {});
    template.hasOutput('ECRBaseImageCheckCommand', {});
    template.hasOutput('SourceURI', {});
  });

  test('IAM role for bucket deployment has correct permissions', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com'
            }
          }
        ]
      }
    });
  });

  test("Snapshot", () => {
    /* We must change some randomly generated file names used in the S3 asset construct. */
    const templateWithConstKeys = normalizedTemplateFromStack(stack);
    expect(templateWithConstKeys).toMatchSnapshot();
  });
});
