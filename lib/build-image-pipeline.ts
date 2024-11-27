import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { IRepository } from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import { CodePipeline } from 'aws-cdk-lib/aws-events-targets';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import { RemovalPolicy } from 'aws-cdk-lib';

/**
 * The type of Image to build on.
 */
export enum ImageKind {
  /** Ubuntu 22.04 (LTS) */
  Ubuntu22_04 = 'ubuntu_22_04',
}

/**
 * Select options for the {@link BuildImagePipelineStack}.
 */
export interface BuildImagePipelineProps extends cdk.StackProps {
  /** The Image type to create. */
  readonly imageKind: ImageKind;
  /** The data bucket from the {@link BuildImageDataStack} */
  readonly dataBucket: s3.IBucket;
  /** The ECR Repository to push to. */
  readonly repository: IRepository;
  /** Access logging bucket to use */
  readonly accessLoggingBucket?: s3.Bucket;
  /** Access logging prefix to use */
  readonly serverAccessLogsPrefix?: string;
  /** Artifact bucket to use */
  readonly artifactBucket?: s3.Bucket;

}

/**
 * The pipeline for building the CodeBuild Image used in other pipelines. This
 * will produce an image for an OS based on verified Yocto hosts.
 *
 * For configuration options see {@link BuildImagePipelineProps}.
 */
export class BuildImagePipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BuildImagePipelineProps) {
    super(scope, id, props);

    // Create a source action.
    const sourceOutput = new codepipeline.Artifact('BuildImageSource');
    const sourceAction = new codepipeline_actions.S3SourceAction({
      actionName: 'Build-Image-Source',
      bucket: props.dataBucket,
      bucketKey: 'data.zip',
      output: sourceOutput,
    });

    // Create a build action.
    const buildImageProject = new codebuild.PipelineProject(
      this,
      'BuildImageProject',
      {
        buildSpec: codebuild.BuildSpec.fromSourceFilename(
          `${props.imageKind}/buildspec.yml`
        ),
        environment: {
          computeType: codebuild.ComputeType.LARGE,
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          privileged: true,
        },
        environmentVariables: {
          ECR_REPOSITORY_URI: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.repository.repositoryUri,
          },
          AWS_ACCOUNT_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: cdk.Stack.of(this).account,
          },
          AWS_DEFAULT_REGION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: cdk.Stack.of(this).region,
          },
          IMAGE_TAG: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.imageKind,
          },
        },
        logging: {
          cloudWatch: {
            logGroup: new LogGroup(this, 'BuildImageBuildLogs', {
              retention: RetentionDays.TEN_YEARS,
            }),
          },
        },
      }
    );
    props.repository.grantPullPush(buildImageProject);

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Build',
      project: buildImageProject,
      input: sourceOutput,
    });

    let accessLoggingBucket: s3.IBucket;

    if (props.accessLoggingBucket){
      accessLoggingBucket = props.accessLoggingBucket;
    } else {
     accessLoggingBucket = new s3.Bucket(this, 'ArtifactAccessLogging', {
        versioned: false,
        enforceSSL: true,
        autoDeleteObjects: true,
        removalPolicy: RemovalPolicy.DESTROY,
      });
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
        versioned: false,
        enforceSSL: true,
        serverAccessLogsBucket: accessLoggingBucket,
        serverAccessLogsPrefix: props.serverAccessLogsPrefix,
        encryptionKey,
        encryption: s3.BucketEncryption.KMS,
        blockPublicAccess: new s3.BlockPublicAccess(
          s3.BlockPublicAccess.BLOCK_ALL
        ),
        autoDeleteObjects: true,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    }

    const pipeline = new codepipeline.Pipeline(this, 'BuildImagePipeline', {
      artifactBucket,
      pipelineName: `${props.imageKind}BuildImagePipeline`,
      pipelineType: codepipeline.PipelineType.V1,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
      ],
      restartExecutionOnUpdate: true,
    });

    // Run this pipeline weekly to update the image OS.
    const pipelineTarget = new CodePipeline(pipeline);
    new events.Rule(this, 'WeeklySchedule', {
      schedule: events.Schedule.cron({
        weekDay: 'Monday',
        minute: '0',
        hour: '6',
      }),
      targets: [pipelineTarget],
    });
  }
}
