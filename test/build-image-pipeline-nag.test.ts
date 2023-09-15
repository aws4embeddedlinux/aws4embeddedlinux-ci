import * as cdk from 'aws-cdk-lib';
import {
  BuildImagePipelineStack,
  ImageKind,
} from '../lib/build-image-pipeline';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Bucket } from 'aws-cdk-lib/aws-s3';

import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { App, Aspects, Stack } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

describe('BuildImagePipelineStack cdk-nag AwsSolutions Pack', () => {
  let stack: Stack;
  let app: App;

  beforeAll(() => {
    // GIVEN
    const env = { account: '111111111111', region: 'eu-central-1' };
    app = new cdk.App();
    const repoStack = new cdk.Stack(app, 'RepoStack', { env });
    const repository = new Repository(repoStack, 'Repository', {});
    const dataBucket = new Bucket(repoStack, 'Bucket', {});

    const props = {
      env,
      imageKind: ImageKind.Ubuntu22_04,
      repository,
      dataBucket,
    };

    stack = new BuildImagePipelineStack(repoStack, 'MyTestStack', props);
    // WHEN
    Aspects.of(stack).add(new AwsSolutionsChecks());
  });

  // THEN
  test('No unsuppressed Warnings', () => {
    const warnings = Annotations.fromStack(stack).findWarning(
      '*',
      Match.stringLikeRegexp('AwsSolutions-.*')
    );
    expect(warnings).toHaveLength(0);
  });

  test('No unsuppressed Errors', () => {
    const errors = Annotations.fromStack(stack).findError(
      '*',
      Match.stringLikeRegexp('AwsSolutions-.*')
    );

    expect(errors).toHaveLength(0);
  });
});
