import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DemoPipelineStack } from '../lib/demo-pipeline';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { ProjectKind } from '../lib';
import { normalizedTemplateFromStack } from './util';

describe('Demo Pipeline', () => {
  const env = { account: '12341234', region: 'eu-central-1' };

  test('Logs Have Retention', () => {
    const app = new cdk.App();
    const newStack = new cdk.Stack(app, 'RepoStack', { env });
    const imageRepo = new Repository(newStack, 'Repository', {});
    const vpc = new Vpc(newStack, 'Bucket', {});

    const stack = new DemoPipelineStack(app, 'MyTestStack', {
      env,
      imageRepo,
      vpc,
    });
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::Logs::LogGroup', 1);
    template.allResourcesProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 3653,
    });
  });

  test('S3 Bucket Has Versioning Enabled', () => {
    const app = new cdk.App();
    const newStack = new cdk.Stack(app, 'RepoStack', { env });
    const imageRepo = new Repository(newStack, 'Repository', {});
    const vpc = new Vpc(newStack, 'Bucket', {});

    const stack = new DemoPipelineStack(app, 'MyTestStack', {
      env,
      imageRepo,
      vpc,
    });
    const template = Template.fromStack(stack);
    template.allResourcesProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
    });
  });

  test('Snapshot Poky Pipeline', () => {
    const app = new cdk.App();
    const newStack = new cdk.Stack(app, 'RepoStack', { env });
    const imageRepo = new Repository(newStack, 'Repository', {});
    const vpc = new Vpc(newStack, 'Bucket', {});

    const stack = new DemoPipelineStack(app, 'MyTestStack', {
      env,
      imageRepo,
      vpc,
    });
    const template = Template.fromStack(stack);
    expect(template).toMatchSnapshot();
  });

  test('Snapshot Poky AMI Pipeline', () => {
    const app = new cdk.App();
    const newStack = new cdk.Stack(app, 'RepoStack', { env });
    const imageRepo = new Repository(newStack, 'Repository', {});
    const vpc = new Vpc(newStack, 'Bucket', {});

    const stack = new DemoPipelineStack(app, 'MyTestStack', {
      env,
      imageRepo,
      vpc,
      projectKind: ProjectKind.PokyAmi,
    });
    const template = normalizedTemplateFromStack(stack);
    expect(template).toMatchSnapshot();
  });

  test('Poky AMI Pipeline - check role name trim', () => {
    const app = new cdk.App();
    const newStack = new cdk.Stack(app, 'RepoStack', { env });
    const imageRepo = new Repository(newStack, 'Repository', {});
    const vpc = new Vpc(newStack, 'Bucket', {});

    const stack = new DemoPipelineStack(
      app,
      'PokyAmiPipeline2ExportsOutputFnGetAttPipelineVpc0543904ACidrBlock70DEC992',
      {
        env,
        imageRepo,
        vpc,
        projectKind: ProjectKind.PokyAmi,
      }
    );
    const template = normalizedTemplateFromStack(stack);
    expect(template).toMatchSnapshot();
  });
});
