import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Code, Repository } from 'aws-cdk-lib/aws-codecommit';

import * as path from 'path';

/**
 * The kind of project built.
 */
export enum ProjectKind {
  /** Build core-image-minimal from poky. */
  Poky = 'poky',
  /** Build the Qemu meta-aws Demonstration Distribution. */
  MetaAwsDemo = 'meta-aws-demo',
  /** Build an EC2 AMI */
  PokyAmi = 'poky-ami',
  /** Build an kas based image */
  Kas = 'kas',
}

export interface SourceRepoProps extends cdk.StackProps {
  /** The name of the CodeCommit Repository created. */
  readonly repoName: string;
  /** The type of project to seed this repository with. */
  readonly kind: ProjectKind;
}

/**
 * The repository for the Source Stage of the pipeline.
 */
export class SourceRepo extends Construct {
  /** The CodeCommit Repo itself. */
  readonly repo: Repository;

  constructor(scope: Construct, id: string, props: SourceRepoProps) {
    super(scope, id);

    this.repo = new Repository(this, 'SourceRepository', {
      repositoryName: props.repoName,
      code: Code.fromDirectory(
        path.join(__dirname, '..', '..', 'source-repo', props.kind),
        'main'
      ),
    });
  }
}
