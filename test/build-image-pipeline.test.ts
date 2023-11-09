import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {
  BuildImagePipelineStack,
  ImageKind,
} from '../lib/build-image-pipeline';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Bucket } from 'aws-cdk-lib/aws-s3';

describe('Build Image Pipeline', () => {
  const env = { account: '111111111111', region: 'eu-central-1' };

  test('Build Image Pipeline Instantiates', () => {
    const app = new cdk.App();
    const repoStack = new cdk.Stack(app, 'RepoStack', { env });
    const repository = new Repository(repoStack, 'Repository', {});
    const dataBucket = new Bucket(repoStack, 'Bucket', {});

    const props = {
      env,
      imageKind: ImageKind.Ubuntu22_04,
      repository,
      dataBucket,
    };

    const stack = new BuildImagePipelineStack(repoStack, 'MyTestStack', props);
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.resourceCountIs('AWS::Logs::LogGroup', 1);
    template.allResourcesProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 3653,
    });
    template.allResourcesProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
    });
  });

  test('Snapshot', () => {
    const app = new cdk.App();
    const repoStack = new cdk.Stack(app, 'RepoStack', { env });
    const repository = new Repository(repoStack, 'Repository', {});
    const dataBucket = new Bucket(repoStack, 'Bucket', {});

    const props = {
      env,
      imageKind: ImageKind.Ubuntu22_04,
      repository,
      dataBucket,
    };

    const stack = new BuildImagePipelineStack(repoStack, 'MyTestStack', props);
    const template = Template.fromStack(stack);
    expect(template).toMatchSnapshot();
  });
});
