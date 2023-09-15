import { BuildImageRepoStack } from '../lib/build-image-repo';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { App, Aspects, Stack } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

describe('Build Image Repository cdk-nag AwsSolutions Pack', () => {
  const props = {
    env: { account: '111111111111', region: 'eu-central-1' },
  };
  let stack: Stack;
  let app: App;

  beforeAll(() => {
    // GIVEN
    app = new App();
    stack = new BuildImageRepoStack(app, 'MyTestStack', props);
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
