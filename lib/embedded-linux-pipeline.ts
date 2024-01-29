import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

import {
  BuildEnvironmentVariableType,
  BuildSpec,
  ComputeType,
  FileSystemLocation,
  LinuxBuildImage,
  PipelineProject,
} from 'aws-cdk-lib/aws-codebuild';
import { IRepository } from 'aws-cdk-lib/aws-ecr';

import {
  ISecurityGroup,
  IVpc,
  Peer,
  Port,
  SecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import { SourceRepo, ProjectKind } from './constructs/source-repo';
import { VMImportBucket } from './vm-import-bucket';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';

/**
 * Properties to allow customizing the build.
 */
export interface EmbeddedLinuxPipelineProps extends cdk.StackProps {
  /** ECR Repository where the Build Host Image resides. */
  readonly imageRepo: IRepository;
  /** Tag for the Build Host Image */
  readonly imageTag?: string;
  /** VPC where the networking setup resides. */
  readonly vpc: IVpc;
  /** The type of project being built.  */
  readonly projectKind?: ProjectKind;
  /** A name for the layer-repo that is created. Default is 'layer-repo' */
  readonly layerRepoName?: string;
  /** Additional policy statements to add to the build project. */
  readonly buildPolicyAdditions?: iam.PolicyStatement[];
  /** Access logging bucket to use */
  readonly accessLoggingBucket?: s3.Bucket;
  /** Access logging prefix to use */
  readonly serverAccessLogsPrefix?: string;
  /** Artifact bucket to use */
  readonly artifactBucket?: s3.Bucket;
  /** Output bucket to use */
  readonly outputBucket?: s3.Bucket | VMImportBucket;
  /** Prefix for S3 object within bucket */
  readonly subDirectoryName?: string;
  }

/**
 * The stack for creating a build pipeline.
 *
 * See {@link EmbeddedLinuxPipelineProps} for configration options.
 */
export class EmbeddedLinuxPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EmbeddedLinuxPipelineProps) {
    super(scope, id, props);

    /** Set up networking access and EFS FileSystems. */

    const projectSg = new SecurityGroup(this, 'BuildProjectSecurityGroup', {
      vpc: props.vpc,
      description: 'Security Group to allow attaching EFS',
    });
    projectSg.addIngressRule(
      Peer.ipv4(props.vpc.vpcCidrBlock),
      Port.tcp(2049),
      'NFS Mount Port'
    );

    const sstateFS = this.addFileSystem('SState', props.vpc, projectSg);
    const dlFS = this.addFileSystem('Downloads', props.vpc, projectSg);
    const tmpFS = this.addFileSystem('Temp', props.vpc, projectSg);

    let outputBucket: s3.IBucket | VMImportBucket;
    let environmentVariables = {};
    let scriptAsset!: Asset;
    let accessLoggingBucket: s3.IBucket;

    if (props.accessLoggingBucket){
      accessLoggingBucket = props.accessLoggingBucket;
    } else {
     accessLoggingBucket = new s3.Bucket(this, 'ArtifactAccessLogging', {
        versioned: true,
        enforceSSL: true,
      });
    }

    if (props.projectKind && props.projectKind == ProjectKind.PokyAmi) {
      scriptAsset = new Asset(this, 'CreateAMIScript', {
        path: path.join(__dirname, '../assets/create-ec2-ami.sh'),
      });

      const outputBucketEncryptionKey = new kms.Key(
        this,
        'OutputBucketEncryptionKey',
        {
          removalPolicy: RemovalPolicy.DESTROY,
          enableKeyRotation: true,
        }
      );
      if (props.outputBucket){
        outputBucket = props.outputBucket;
      } else {
        outputBucket = new VMImportBucket(this, 'PipelineOutput', {
          versioned: true,
          enforceSSL: true,
          encryptionKey: outputBucketEncryptionKey,
          encryptionKeyArn: outputBucketEncryptionKey.keyArn,
          serverAccessLogsBucket: accessLoggingBucket,
          serverAccessLogsPrefix: props.serverAccessLogsPrefix,
        });
      }
      environmentVariables = {
        IMPORT_BUCKET: {
          type: BuildEnvironmentVariableType.PLAINTEXT,
          value: outputBucket.bucketName,
        },
        ROLE_NAME: {
          type: BuildEnvironmentVariableType.PLAINTEXT,
          value: (outputBucket as VMImportBucket).roleName,
        },
        SCRIPT_URL: {
          type: BuildEnvironmentVariableType.PLAINTEXT,
          value: scriptAsset.s3ObjectUrl,
        },
      };
    } else {
      if (props.outputBucket){
        outputBucket = props.outputBucket;
      } else {
        outputBucket = new s3.Bucket(this, 'PipelineOutput', {
          versioned: true,
          enforceSSL: true,
          serverAccessLogsBucket: accessLoggingBucket,
        });
      }
    }

    let artifactBucket: s3.IBucket;

    if (props.artifactBucket){
      artifactBucket = props.artifactBucket;
    } else {
      const encryptionKey = new kms.Key(this, 'PipelineArtifactKey', {
       removalPolicy: RemovalPolicy.DESTROY,
       enableKeyRotation: true,
     });
      artifactBucket = new s3.Bucket(this, 'PipelineArtifacts', {
        versioned: true,
        enforceSSL: true,
        serverAccessLogsBucket: accessLoggingBucket,
        encryptionKey,
        encryption: s3.BucketEncryption.KMS,
        blockPublicAccess: new s3.BlockPublicAccess(
          s3.BlockPublicAccess.BLOCK_ALL
        ),
      });
    }

    /** Create our CodePipeline Actions. */
    const sourceRepo = new SourceRepo(this, 'SourceRepo', {
      ...props,
      repoName: props.layerRepoName ?? `layer-repo-${this.stackName}`,
      kind: props.projectKind ?? ProjectKind.Poky,
    });

    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      // trigger: CodeCommitTrigger.NONE,
      output: sourceOutput,
      actionName: 'Source',
      repository: sourceRepo.repo,
      branch: 'main',
      codeBuildCloneOutput: true,
    });

    const project = new PipelineProject(this, 'EmbeddedLinuxBuildProject', {
      buildSpec: BuildSpec.fromSourceFilename('build.buildspec.yml'),
      environment: {
        computeType: ComputeType.X2_LARGE,
        buildImage: LinuxBuildImage.fromEcrRepository(
          props.imageRepo,
          props.imageTag
        ),
        privileged: true,
        environmentVariables,
      },
      timeout: cdk.Duration.hours(4),
      vpc: props.vpc,
      securityGroups: [projectSg],
      fileSystemLocations: [
        FileSystemLocation.efs({
          identifier: 'tmp_dir',
          location: tmpFS,
          mountPoint: '/build-output',
        }),
        FileSystemLocation.efs({
          identifier: 'sstate_cache',
          location: sstateFS,
          mountPoint: '/sstate-cache',
        }),
        FileSystemLocation.efs({
          identifier: 'dl_dir',
          location: dlFS,
          mountPoint: '/downloads',
        }),
      ],
      logging: {
        cloudWatch: {
          logGroup: new LogGroup(this, 'PipelineBuildLogs', {
            retention: RetentionDays.TEN_YEARS,
          }),
        },
      },
    });

    if (props.buildPolicyAdditions) {
      props.buildPolicyAdditions.map(p => project.addToRolePolicy(p))
    }

    if (props.projectKind && props.projectKind == ProjectKind.PokyAmi) {
      outputBucket.grantReadWrite(project);
      project.addToRolePolicy(this.addVMExportPolicy());

      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ec2:ImportSnapshot'],
          resources: [
            `arn:aws:ec2:${this.region}:${this.account}:import-snapshot-task/*`,
            `arn:aws:ec2:${this.region}::snapshot/*`,
          ],
        })
      ),
        //Permissions for BackUp to S3
        project.addToRolePolicy(
          this.addAMIS3BackupPolicy(outputBucket.bucketArn)
        );
      project.addToRolePolicy(this.addAMIEC2EBSBackupPolicy(this.region));
      project.addToRolePolicy(this.addAMIEBSBackupPolicy(this.region));
      project.addToRolePolicy(this.addAMIBackupPolicy());
      scriptAsset.grantRead(project);
    }

    const buildOutput = new codepipeline.Artifact();
    const buildAction = new codepipeline_actions.CodeBuildAction({
      input: sourceOutput,
      actionName: 'Build',
      outputs: [buildOutput],
      project,
    });

    let artifactAction: codepipeline_actions.S3DeployAction;

    if (props.subDirectoryName){
      artifactAction = new codepipeline_actions.S3DeployAction({
        actionName: 'Artifact',
        input: buildOutput,
        bucket: outputBucket,
        objectKey: props.subDirectoryName
      });
    } else {
      artifactAction = new codepipeline_actions.S3DeployAction({
        actionName: 'Artifact',
        input: buildOutput,
        bucket: outputBucket,
      });
    }

    /** Here we create the logic to check for presence of ECR image on the CodePipeline automatic triggering upon resource creation,
     * and stop the execution if the image does not exist.  */
    const fnOnPipelineCreate = new lambda.Function(
      this,
      'OSImageCheckOnStart',
      {
        runtime: lambda.Runtime.PYTHON_3_10,
        handler: 'index.handler',
        code: lambda.Code.fromInline(`
import boto3
import json

ecr_client = boto3.client('ecr')
codepipeline_client = boto3.client('codepipeline')

def handler(event, context):
  print("Received event: " + json.dumps(event, indent=2))
  response = ecr_client.describe_images(repositoryName='${props.imageRepo.repositoryName}', filter={'tagStatus': 'TAGGED'})
  for i in response['imageDetails']:
    if '${props.imageTag}' in i['imageTags']:
      break
  else:
    print('OS image not found. Stopping execution.')
    response = codepipeline_client.stop_pipeline_execution(
    pipelineName=event['detail']['pipeline'],
    pipelineExecutionId=event['detail']['execution-id'],
    abandon=True,
    reason='OS image not found in ECR repository. Stopping pipeline until image is present.')
    `),
        logRetention: RetentionDays.TEN_YEARS,
      }
    );

    const pipelineCreateRule = new events.Rule(this, 'OnPipelineStartRule', {
      eventPattern: {
        detailType: ['CodePipeline Pipeline Execution State Change'],
        source: ['aws.codepipeline'],
        detail: {
          state: ['STARTED'],
          'execution-trigger': {
            'trigger-type': ['CreatePipeline'],
          },
        },
      },
    });
    pipelineCreateRule.addTarget(
      new targets.LambdaFunction(fnOnPipelineCreate)
    );

    /** Now create the actual Pipeline */
    const pipeline = new codepipeline.Pipeline(this, 'EmbeddedLinuxPipeline', {
      artifactBucket,
      restartExecutionOnUpdate: true,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
        {
          stageName: 'Artifact',
          actions: [artifactAction],
        },
      ],
    });

    const stopPipelinePolicy = new iam.PolicyStatement({
      actions: ['codepipeline:StopPipelineExecution'],
      resources: [pipeline.pipelineArn],
    });

    const ecrPolicy = new iam.PolicyStatement({
      actions: ['ecr:DescribeImages'],
      resources: [props.imageRepo.repositoryArn],
    });
    fnOnPipelineCreate.role?.attachInlinePolicy(
      new iam.Policy(this, 'CheckOSAndStop', {
        statements: [stopPipelinePolicy, ecrPolicy],
      })
    );

    new cdk.CfnOutput(this, 'BuildOutput', {
      value: outputBucket.bucketArn,
      description: 'The output bucket of this pipeline.',
    });
  }

  /**
   * Adds an EFS FileSystem to the VPC and SecurityGroup.
   *
   * @param name - A name to differentiate the filesystem.
   * @param vpc - The VPC the Filesystem resides in.
   * @param securityGroup - A SecurityGroup to allow access to the filesystem from.
   * @returns The filesystem location URL.
   *
   */
  private addFileSystem(
    name: string,
    vpc: IVpc,
    securityGroup: ISecurityGroup
  ): string {
    const fs = new efs.FileSystem(this, `EmbeddedLinuxPipeline${name}Filesystem`, {
      vpc,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    fs.connections.allowFrom(securityGroup, Port.tcp(2049));

    const fsId = fs.fileSystemId;
    const region = cdk.Stack.of(this).region;

    return `${fsId}.efs.${region}.amazonaws.com:/`;
  }

  private addVMExportPolicy(): iam.PolicyStatement {
    return new iam.PolicyStatement({
      actions: [
        'ec2:CreateImage',
        'ec2:CreateTags',
        'ec2:DescribeImages',
        'ec2:DescribeSnapshots',
        'ec2:DescribeImportSnapshotTasks',
        'ec2:DescribeTags',
        'ec2:CancelImportTask',
      ],
      resources: ['*'],
    });
  }

  private addAMIS3BackupPolicy(artifactBucketArn: string): iam.PolicyStatement {
    return new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:ListBucket',
        's3:PutObject',
        's3:PutObjectTagging',
        's3:AbortMultipartUpload',
      ],
      resources: [artifactBucketArn, `${artifactBucketArn}/*`],
    });
  }
  private addAMIEBSBackupPolicy(region: string): iam.PolicyStatement {
    return new iam.PolicyStatement({
      actions: [
        'ebs:CompleteSnapshot',
        'ebs:GetSnapshotBlock',
        'ebs:ListChangedBlocks',
        'ebs:ListSnapshotBlocks',
        'ebs:PutSnapshotBlock',
      ],
      resources: [`arn:aws:ec2:${region}::snapshot/*`],
    });
  }

  private addAMIBackupPolicy(): iam.PolicyStatement {
    return new iam.PolicyStatement({
      actions: ['ec2:DescribeStoreImageTasks', 'ec2:GetEbsEncryptionByDefault'],
      resources: ['*'],
    });
  }

  private addAMIEC2EBSBackupPolicy(region: string): iam.PolicyStatement {
    return new iam.PolicyStatement({
      actions: [
        'ec2:RegisterImage',
        'ec2:DeregisterImage',
        'ec2:CreateStoreImageTask',
      ],
      resources: [
        `arn:aws:ec2:${region}::image/*`,
        `arn:aws:ec2:${region}::snapshot/snap-*`,
      ],
    });
  }
}
