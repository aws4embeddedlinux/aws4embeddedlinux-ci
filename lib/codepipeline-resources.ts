import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";

/**
 * Select options for the {@link PipelineResourcesStack}.
 */
export interface PipelineResourcesProps extends cdk.StackProps {
  /** The resource prefix*/
  readonly resource_prefix: string;
  /** The ecr repository name - if not provided then the name will be '{prefix}-{account}-{region}-repo'*/
  readonly ecrRepositoryName?: string;
  /** The artifact bucket name - if not provided then the name will be '{prefix}-{account}-{region}-artifact'*/
  readonly pipelineArtifactBucketName?: string;
  /** The source bucket name - if not provided then the name will be '{prefix}-{account}-{region}-source'*/
  readonly pipelineSourceBucketName?: string;
  /** The output bucket name - if not provided then the name will be '{prefix}-{account}-{region}-output'*/
  readonly pipelineOutputBucketName?: string;
  /** Cloudwatch logging bucket name - if not provided then the name will be '{prefix}-{account}-{region}-logs'*/
  readonly loggingBucketName?: string;
}

/**
 * Input (Source) data for our {@link PipelineResourcesStack}.
 */
export class PipelineResourcesStack extends cdk.Stack {
  /** The VPC for the pipeline to reside in. */
  public readonly vpc: ec2.IVpc;
  /** The respository to put the build host container in. */
  public readonly ecrRepository: ecr.IRepository;
  /** The artifact bucket*/
  readonly pipelineArtifactBucket: s3.Bucket;
  /** The source bucket*/
  readonly pipelineSourceBucket: s3.Bucket;
  /** The output bucket*/
  readonly pipelineOutputBucket: s3.Bucket;
  /** The Cloudwatch logging bucket*/
  public readonly accessLoggingBucket?: s3.Bucket;
  /** The encryption key use across*/
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props: PipelineResourcesProps) {
    super(scope, id, props);

    const ecrRepositoryName = props.ecrRepositoryName
      ? props.ecrRepositoryName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-repo`.toLowerCase();
    const pipelineArtifactBucketName = props.pipelineArtifactBucketName
      ? props.pipelineArtifactBucketName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-artifact`.toLowerCase();
    const pipelineSourceBucketName = props.pipelineSourceBucketName
      ? props.pipelineSourceBucketName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-source`.toLowerCase();
    const pipelineOutputBucketName = props.pipelineOutputBucketName
      ? props.pipelineOutputBucketName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-output`.toLowerCase();
    const loggingBucketName = props.loggingBucketName
      ? props.loggingBucketName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-logs`.toLowerCase();

    // We will create a VPC with 3 Private and Public subnets for AWS
    // Resources that have network interfaces (e.g. Connecting and EFS
    // Filesystem to a CodeBuild Project).
    this.vpc = new ec2.Vpc(this, "PipelineResourcesVpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
    });

    new ec2.FlowLog(this, "PipelineResourcesVPCFlowLogs", {
      resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(
        new logs.LogGroup(this, "PipelineResourcesVPCFlowLogGroup", {
          logGroupName: `${id}-PipelineResourcesVPCFlowLogGroup`,
          retention: logs.RetentionDays.ONE_YEAR,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      ),
    });

    this.ecrRepository = new ecr.Repository(
      this,
      "PipelineResourcesECRRepository",
      {
        repositoryName: ecrRepositoryName,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: true,
      },
    );

    this.encryptionKey = new kms.Key(this, "PipelineResourcesArtifactKey", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enableKeyRotation: true,
    });

    // Create a bucket, then allow a deployment Lambda to upload to it.
    this.accessLoggingBucket = new s3.Bucket(
      this,
      "PipelineResourcesLoggingBucket",
      {
        bucketName: loggingBucketName,
        versioned: true,
        enforceSSL: true,
        autoDeleteObjects: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        encryptionKey: this.encryptionKey,
      },
    );

    this.pipelineSourceBucket = new s3.Bucket(
      this,
      "PipelineResourcesSourceBucket",
      {
        bucketName: pipelineSourceBucketName,
        versioned: true,
        enforceSSL: true,
        autoDeleteObjects: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        encryptionKey: this.encryptionKey,
        serverAccessLogsBucket: this.accessLoggingBucket,
        serverAccessLogsPrefix: "source-bucket",
      },
    );

    this.pipelineArtifactBucket = new s3.Bucket(
      this,
      "PipelineResourcesArtifactBucket",
      {
        bucketName: pipelineArtifactBucketName,
        versioned: true,
        enforceSSL: true,
        autoDeleteObjects: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        encryptionKey: this.encryptionKey,
        serverAccessLogsBucket: this.accessLoggingBucket,
        serverAccessLogsPrefix: "artifact-bucket",
      },
    );

    this.pipelineOutputBucket = new s3.Bucket(
      this,
      "PipelineResourcesOutputBucket",
      {
        bucketName: pipelineOutputBucketName,
        versioned: true,
        enforceSSL: true,
        autoDeleteObjects: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        encryptionKey: this.encryptionKey,
        serverAccessLogsBucket: this.accessLoggingBucket,
        serverAccessLogsPrefix: "output-bucket",
      },
    );

    new cdk.CfnOutput(this, "LoggingBucket", {
      value: this.accessLoggingBucket.bucketName,
      description: "The access logging bucket.",
    });

    new cdk.CfnOutput(this, "SourceBucket", {
      value: this.pipelineSourceBucket.bucketName,
      description: "The source bucket.",
    });

    new cdk.CfnOutput(this, "ArtifactBucket", {
      value: this.pipelineArtifactBucket.bucketName,
      description: "The artifact bucket.",
    });

    new cdk.CfnOutput(this, "OutputBucket", {
      value: this.pipelineOutputBucket.bucketName,
      description: "The output bucket.",
    });
  }
}
