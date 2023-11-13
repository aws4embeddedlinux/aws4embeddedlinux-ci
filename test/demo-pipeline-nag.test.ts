import { DemoPipelineStack } from '../lib/demo-pipeline';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Vpc } from 'aws-cdk-lib/aws-ec2';

import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { App, Aspects, Stack } from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { ProjectKind } from '../lib';

describe('Demo pipeline cdk-nag AwsSolutions Pack', () => {
  let stack: Stack;
  let app: App;
  let vpc: Vpc;
  let imageRepo: Repository;
  let newStack: Stack;
  beforeAll(() => {
    // GIVEN
    app = new App();
    const env = { account: '12341234', region: 'eu-central-1' };
    newStack = new Stack(app, 'RepoStack', { env });
    imageRepo = new Repository(newStack, 'Repository', {});
    vpc = new Vpc(newStack, 'Bucket', {});

    stack = new DemoPipelineStack(app, 'MyTestStack', {
      env,
      imageRepo,
      vpc,
      projectKind: ProjectKind.PokyAmi,
    });

    NagSuppressions.addStackSuppressions(stack, [
      {
        id: 'CdkNagValidationFailure',
        reason: 'Multiple Validation Failures.',
      },
      {
        id: 'AwsSolutions-CB3',
        reason: 'TODO: Verify CodeBuild Privilege mode is required here.',
      },

      {
        id: 'AwsSolutions-IAM4',
        reason: 'TODO: Re-evaluate managed policies per resources.',
      },
    ]);

    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      '/MyTestStack/VMImportRole/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Read permissions needed on bucket.',
          appliesTo: [
            {
              regex: '/Resource::<DemoArtifactB63FBDE0.Arn>/\\*$/g',
            },
            {
              regex: '/Resource::arn:aws:ec2:eu-central-1::snapshot/\\*$/g',
            },
            {
              regex: '/Resource::\\*$/g',
            },
          ],
        },
      ]
    );

    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      '/MyTestStack/DemoBuildProject/Role/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'This is a default CDK created role, with default policy permissions.',
        },
      ]
    );
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      '/MyTestStack/DemoBuildProject/PolicyDocument/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'This is a default CDK created policy, with default policy permissions.',
        },
      ]
    );
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      '/MyTestStack/DemoPipeline/Role/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'This is a default CDK created policy, with default policy permissions.',
        },
      ]
    );
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      '/MyTestStack/DemoPipeline/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'This is a default CDK created policy, with default policy permissions.',
        },
      ]
    );

    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      '/MyTestStack/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'This is a default CDK created policy, with default policy permissions.',
        },
      ]
    );
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      '/MyTestStack/DemoPipeline/Artifact/Demo-Artifact/CodePipelineActionRole/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'This is a default CDK created policy, with default policy permissions.',
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
