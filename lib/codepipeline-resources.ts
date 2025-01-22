import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";

import { VMImportBucket } from "./vm-import-bucket";
/**
 * Select options for the {@link PipelineResourcesStack}.
 */
export interface PipelineResourcesProps extends cdk.StackProps {
  /** The resource prefix*/
  readonly resource_prefix: string;
  /** The ecr repository name - if not provided then the name will be '{prefix}-{account}-{region}-repo'*/
  readonly ecrRepositoryName?: string;
  /** The artifact bucket name - if not provided then the name will be '{prefix}-{account}-{region}-artifact'*/
  readonly artifactBucketName?: string;
  /** The source bucket name - if not provided then the name will be '{prefix}-{account}-{region}-source'*/
  readonly sourceBucketName?: string;
  /** The source bucket name - if not provided then the name will be '{prefix}-{account}-{region}-output'*/
  readonly outputBucketName?: string;
  /** The source bucket name - if not provided then the name will be '{prefix}-{account}-{region}-output-vm-import'*/
  readonly outputVMImportBucketName?: string;
  /** Access logging bucket name - if not provided then the name will be '{prefix}-{account}-{region}-logs'*/
  readonly accessLoggingBucketName?: string;
}

/**
 * Input (Source) data for our {@link PipelineResourcesStack}.
 */
export class PipelineResourcesStack extends cdk.Stack {
  /** The VPC for the pipeline to reside in. */
  public readonly vpc: ec2.IVpc;
  /** The respository to put the build host container in. */
  public readonly ecrRepository: ecr.IRepository;
  /** The source bucket*/
  public readonly sourceBucket: s3.IBucket;
  /** the artifact bucket*/
  public readonly artifactBucket: s3.Bucket;
  /** The access logging bucket to use*/
  public readonly accessLoggingBucket?: s3.Bucket;
  /** The output bucket*/
  public readonly outputBucket: s3.Bucket;
  /** The output vm import bucket*/
  public readonly outputVMImportBucket: VMImportBucket;
  /** The encryption key use across*/
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props: PipelineResourcesProps) {
    super(scope, id, props);

    const ecrRepositoryName = props.ecrRepositoryName
      ? props.ecrRepositoryName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-repo`.toLowerCase();
    const artifactBucketName = props.artifactBucketName
      ? props.artifactBucketName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-artifact`.toLowerCase();
    const sourceBucketName = props.sourceBucketName
      ? props.sourceBucketName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-source`.toLowerCase();
    const outputBucketName = props.outputBucketName
      ? props.outputBucketName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-output`.toLowerCase();
    const outputVMImportBucketName = props.outputVMImportBucketName
      ? props.outputVMImportBucketName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-output-vm`.toLowerCase();
    const accessLoggingBucketName = props.sourceBucketName
      ? props.sourceBucketName
      : `${props.resource_prefix}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-access-logs`.toLowerCase();

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
    this.accessLoggingBucket = new s3.Bucket(this, "PipelineResourcesAccessLoggingBucket", {
      bucketName: accessLoggingBucketName,
      versioned: true,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryptionKey: this.encryptionKey,
    });

    this.sourceBucket = new s3.Bucket(this, "PipelineResourcesSourceBucket", {
      bucketName: sourceBucketName,
      versioned: true,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryptionKey: this.encryptionKey,
      serverAccessLogsBucket: this.accessLoggingBucket,
      serverAccessLogsPrefix: "source-bucket",
    });

    this.artifactBucket = new s3.Bucket(this, "PipelineResourcesArtifactBucket", {
      bucketName: artifactBucketName,
      versioned: true,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryptionKey: this.encryptionKey,
      serverAccessLogsBucket: this.accessLoggingBucket,
      serverAccessLogsPrefix: "artifact-bucket",
    });

    this.outputBucket = new s3.Bucket(this, "PipelineResourcesOutputBucket", {
      bucketName: outputBucketName,
      versioned: true,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryptionKey: this.encryptionKey,
      serverAccessLogsBucket: this.accessLoggingBucket,
      serverAccessLogsPrefix: "output-bucket",
    });

    this.outputVMImportBucket = new VMImportBucket(this, "PipelineResourcesOutputVMImportBucket", {
      bucketName: outputVMImportBucketName,
      versioned: true,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryptionKey: this.encryptionKey,
      serverAccessLogsBucket: this.accessLoggingBucket,
      serverAccessLogsPrefix: "output-vm-import-bucket",
    });

    new cdk.CfnOutput(this, "OutputPipelineResourcesAccessLoggingBucket", {
      exportName: "accessLoggingBucket",
      value: this.accessLoggingBucket.bucketName,
      description: "The access logging bucket.",
    });

    new cdk.CfnOutput(this, "OutputPipelineResourcesSourceBucket", {
      exportName: "sourceBucket",
      value: this.sourceBucket.bucketName,
      description: "The source bucket.",
    });

    new cdk.CfnOutput(this, "OutputPipelineResourcesArtifactBucket", {
      exportName: "artifactBucket",
      value: this.artifactBucket.bucketName,
      description: "The artifact bucket.",
    });

    new cdk.CfnOutput(this, "OutputPipelineResourcesOutputBucket", {
      exportName: "outputBucket",
      value: this.outputBucket.bucketName,
      description: "The output bucket.",
    });

    new cdk.CfnOutput(this, "OutputPipelineResourcesOutputVMImportBuckett", {
      exportName: "outputVMImportBucket",
      value: this.outputVMImportBucket.bucketName,
      description: "The output VM import bucket.",
    });
  }
}
