import * as cdk from 'aws-cdk-lib';
import { BuildImageDataStack } from '../lib/build-image-data';

import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { App, Aspects, Stack } from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';

describe('BuildImageDataStack cdk-nag AwsSolutions Pack', () => {
  let stack: Stack;
  let app: App;

  beforeAll(() => {
    // GIVEN
    app = new App();
    const props = {
      bucketName: 'test-bucket',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      env: { account: '111111111111', region: 'eu-central-1' },
    };
    stack = new BuildImageDataStack(app, 'MyTestStack', props);

    NagSuppressions.addStackSuppressions(stack, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'TODO: Re-evaluate managed policies per resources.',
      },
    ]);

    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      '/MyTestStack/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/Resource',
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'This Lambda function is 3rd Party (from CDK libs)',
        },
      ]
    );

    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      'MyTestStack/BuildImageBucketRole/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Because these are the default permissions assigned to a CDK default created role.',
        },
      ]
    );

    // WHEN
    Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));
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
