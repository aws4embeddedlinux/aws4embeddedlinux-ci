import { SourceRepo, ProjectKind } from '../lib/constructs/source-repo';

import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { App, Aspects, Stack } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

describe('Demo Source Repository cdk-nag AwsSolutions Pack', () => {
  let stack: Stack;
  let app: App;

  beforeAll(() => {
    // GIVEN
    const props = {
      env: { account: '12341234', region: 'eu-central-1' },
      kind: ProjectKind.Poky,
      repoName: 'charlie',
    };

    app = new App();
    stack = new Stack(app, 'TestStack', props);
    new SourceRepo(stack, 'MyTestStack', props);

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
