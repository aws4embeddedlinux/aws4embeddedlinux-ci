import * as path from "path";
import * as fs from "fs";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as events from "aws-cdk-lib/aws-events";
import * as events_target from "aws-cdk-lib/aws-events-targets";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as efs from "aws-cdk-lib/aws-efs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as kms from "aws-cdk-lib/aws-kms";
import { ProjectType } from ".";

/**
 * Properties to allow customizing the build.
 */
export interface EmbeddedLinuxCodePipelineProps extends cdk.StackProps {
  /** The pipeline source bucket */
  readonly pipelineSourceBucket: s3.IBucket;
  /** The pipeline source prefix */
  pipelineSourcePrefix?: string;
  /** The pipeline artifact bucket to use */
  readonly pipelineArtifactBucket: s3.Bucket;
  /** The pipeline artifact bucket prefix to use */
  pipelineArtifactPrefix?: string;
  /** The pipeline output bucket to use */
  readonly pipelineOutputBucket: s3.Bucket;
  /** The pipeline output bucket prefix to use */
  pipelineOutputPrefix?: string;
  /** ECR Repository where the Build Host Image resides. */
  readonly ecrRepository: ecr.IRepository;
  /** Tag for the Build Host Image */
  readonly ecrRepositoryImageTag: string;
  /** The type of project being built.  */
  readonly projectType: ProjectType;
  /** VPC where the networking setup resides. */
  readonly vpc: ec2.IVpc;
  /** Additional policy statements to add to the build project. */
  readonly buildPolicyAdditions?: iam.PolicyStatement[];
  /** Additional build environment variables to the build project. */
  readonly environmentVariables?: {
    [key: string]: codebuild.BuildEnvironmentVariable;
  };
  /** The encryption key use across*/
  readonly encryptionKey: kms.Key;
  /** Custom asset to be provided when using ProjectType.Custom  */
  readonly sourceCustomPath?: string;
}

/**
 * The stack for creating a build pipeline.
 *
 * See {@link EmbeddedLinuxCodePipelineProps} for configration options.
 */
export class EmbeddedLinuxCodePipelineStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: EmbeddedLinuxCodePipelineProps,
  ) {
    super(scope, id, props);

    if (!props.pipelineSourcePrefix) {
      props.pipelineSourcePrefix = `${props.projectType}`;
    }
    if (!props.pipelineArtifactPrefix) {
      props.pipelineArtifactPrefix = `${props.projectType}`;
    }
    if (!props.pipelineOutputPrefix) {
      props.pipelineOutputPrefix = `${props.projectType}`;
    }

    /** Set up networking access and EFS FileSystems. */
    const projectSg = new ec2.SecurityGroup(
      this,
      "EmbeddedLinuxCodePipelineBuildProjectSecurityGroup",
      {
        vpc: props.vpc,
        description: "Security Group to allow attaching EFS",
      },
    );
    projectSg.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(2049),
      "NFS Mount Port",
    );
    const efsFileSystem: efs.FileSystem = new efs.FileSystem(
      this,
      `EmbeddedLinuxCodePipelineFileSystem`,
      {
        vpc: props.vpc,
        allowAnonymousAccess: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
    );
    efsFileSystem.connections.allowFrom(projectSg, ec2.Port.tcp(2049));

    // create the policy & role for the source bucket deployment
    const pipelineSourceBucketDeploymentPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ],
          resources: [
            `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/lambda/EmbeddedLinuxCodePipelineBaseImage-CustomCDKBucketDeployment*`,
          ],
        }),
      ],
    });
    const pipelineSourceBucketDeploymentRole = new iam.Role(
      this,
      "EmbeddedLinuxCodePipelineBucketDeploymentRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        inlinePolicies: { pipelineSourceBucketDeploymentPolicy },
      },
    );

    // archive and upload the source-repo folder into CDK owned bucket
    let sourcePath = path.join(
      __dirname,
      "..",
      "source-repo",
      props.projectType,
    );
    if (props.projectType == ProjectType.Custom) {
      if (!props.sourceCustomPath) {
        throw new Error(
          `sourceCustomPath must be provided when using ProjectType.Custom`,
        );
      }
      if (!fs.existsSync(`${props.sourceCustomPath}/build.buildspec.yml`)) {
        throw new Error(
          `sourceCustomPath must be provide a valid path to a build.buildspec.yml file (sourceCustomPath = ${props.sourceCustomPath})`,
        );
      }

      sourcePath = props.sourceCustomPath;
    }
    const sourceRepoAsset: Asset = new Asset(
      this,
      "EmbeddedLinuxCodePipelineBucketDeploymentAsset",
      { path: sourcePath },
    );

    // deploy the sourceRepo to the bucket
    const bucketDeployment = new BucketDeployment(
      this,
      "EmbeddedLinuxCodePipelineBucketDeployment",
      {
        sources: [
          Source.bucket(sourceRepoAsset.bucket, sourceRepoAsset.s3ObjectKey),
        ],
        destinationBucket: props.pipelineSourceBucket,
        role: pipelineSourceBucketDeploymentRole,
        extract: false,
        destinationKeyPrefix: props.pipelineSourcePrefix,
      },
    );

    /** Create our CodeCodePipeline Actions. */
    const sourceActionOutputArtifact = new codepipeline.Artifact("Source");
    const sourceAction = new codepipeline_actions.S3SourceAction({
      actionName: "Source",
      trigger: codepipeline_actions.S3Trigger.EVENTS,
      output: sourceActionOutputArtifact,
      bucket: props.pipelineSourceBucket,
      bucketKey: `${props.pipelineSourcePrefix}/${sourceRepoAsset.s3ObjectKey}`,
    });

    // adding the proper roles and policies in case the pipeline will export the image as an AMI
    const vmImportRole = this.createVMImportRole(id, props);

    /** Create our CodeCodePipeline Project. */
    const project = new codebuild.PipelineProject(
      this,
      "EmbeddedLinuxCodePipelineProject",
      {
        projectName: `${id}`,
        buildSpec: codebuild.BuildSpec.fromSourceFilename(
          "build.buildspec.yml",
        ),
        environment: {
          computeType: codebuild.ComputeType.X_LARGE,
          buildImage: codebuild.LinuxBuildImage.fromEcrRepository(
            props.ecrRepository,
            props.ecrRepositoryImageTag,
          ),
          privileged: true,
          environmentVariables: {
            ...props.environmentVariables,
            AWS_ACCOUNT_ID: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: cdk.Stack.of(this).account,
            },
            AWS_DEFAULT_REGION: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: cdk.Stack.of(this).region,
            },
            PIPELINE_PROJECT_NAME: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: id,
            },
            PIPELINE_OUTPUT_BUCKET: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: props.pipelineOutputBucket.bucketName,
            },
            PIPELINE_OUTPUT_BUCKET_PREFIX: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: props.pipelineOutputPrefix,
            },
            VM_IMPORT_ROLE: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: vmImportRole.roleName,
            },
          },
        },
        timeout: cdk.Duration.hours(4),
        vpc: props.vpc,
        securityGroups: [projectSg],
        fileSystemLocations: [
          codebuild.FileSystemLocation.efs({
            identifier: "nfs",
            location: `${efsFileSystem.fileSystemId}.efs.${efsFileSystem.env.region}.amazonaws.com:/`,
            mountPoint: "/nfs",
          }),
        ],
        logging: {
          cloudWatch: {
            logGroup: new logs.LogGroup(
              this,
              "EmbeddedLinuxCodePipelineProjectLogs",
              {
                logGroupName: `${id}-EmbeddedLinuxCodePipelineProjectLogs`,
                retention: logs.RetentionDays.ONE_YEAR,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
              },
            ),
          },
        },
        encryptionKey: props.encryptionKey,
      },
    );
    project.node.addDependency(bucketDeployment);

    if (props.buildPolicyAdditions) {
      props.buildPolicyAdditions.map((p) => project.addToRolePolicy(p));
    }

    // adding the proper roles and policies in case the pipeline will export the image as an AMI
    props.pipelineOutputBucket.grantReadWrite(project);
    this.addAMIExportPolicy(project, props);

    const buildActionOutputArtifact = new codepipeline.Artifact();
    const buildAction = new codepipeline_actions.CodeBuildAction({
      input: sourceActionOutputArtifact,
      actionName: "Build",
      outputs: [buildActionOutputArtifact],
      project,
    });

    const outputAction: codepipeline_actions.S3DeployAction =
      new codepipeline_actions.S3DeployAction({
        actionName: "Output",
        input: buildActionOutputArtifact,
        bucket: props.pipelineOutputBucket,
        objectKey: `${props.pipelineOutputPrefix}`,
      });

    /** Here we create the logic to check for presence of ECR image on the CodeCodePipeline automatic triggering upon resource creation,
     * and stop the execution if the image does not exist.  */
    const fnOnCodePipelineCreate = new lambda.Function(
      this,
      "EmbeddedLinuxCodePipelineOSImageCheckOnStart",
      {
        runtime: lambda.Runtime.PYTHON_3_10,
        handler: "index.handler",
        code: lambda.Code.fromInline(`
    import boto3
    import json

    ecr_client = boto3.client('ecr')
    codepipeline_client = boto3.client('codepipeline')

    def handler(event, context):
      print("Received event: " + json.dumps(event, indent=2))
      response = ecr_client.describe_images(repositoryName='${props.ecrRepository.repositoryName}', filter={'tagStatus': 'TAGGED'})
      for i in response['imageDetails']:
        if '${props.ecrRepositoryImageTag}' in i['ecrRepositoryImageTags']:
          break
      else:
        print('OS image not found. Stopping execution.')
        response = codepipeline_client.stop_pipeline_execution(
        pipelineName=event['detail']['pipeline'],
        pipelineExecutionId=event['detail']['execution-id'],
        abandon=True,
        reason='OS image not found in ECR repository. Stopping pipeline until image is present.')
        `),
        logRetention: logs.RetentionDays.ONE_YEAR,
      },
    );

    const pipelineCreateRule = new events.Rule(
      this,
      "EmbeddedLinuxCodePipelineOnCodePipelineStartRule",
      {
        eventPattern: {
          detailType: ["CodeCodePipeline CodePipeline Execution State Change"],
          source: ["aws.codepipeline"],
          detail: {
            state: ["STARTED"],
            "execution-trigger": {
              "trigger-type": ["CreateCodePipeline"],
            },
          },
        },
      },
    );
    pipelineCreateRule.addTarget(
      new targets.LambdaFunction(fnOnCodePipelineCreate),
    );

    /** Now create the actual CodePipeline */
    const pipeline = new codepipeline.Pipeline(
      this,
      "EmbeddedLinuxCodePipeline",
      {
        pipelineName: `${id}`,
        artifactBucket: props.pipelineArtifactBucket,
        restartExecutionOnUpdate: true,
        pipelineType: codepipeline.PipelineType.V1,
        stages: [
          {
            stageName: "Source",
            actions: [sourceAction],
          },
          {
            stageName: "Build",
            actions: [buildAction],
          },
          {
            stageName: "Output",
            actions: [outputAction],
          },
        ],
      },
    );
    pipeline.node.addDependency(project);

    const stopCodePipelinePolicy = new iam.PolicyStatement({
      actions: ["codepipeline:StopCodePipelineExecution"],
      resources: [pipeline.pipelineArn],
    });

    const ecrPolicy = new iam.PolicyStatement({
      actions: ["ecr:DescribeImages"],
      resources: [props.ecrRepository.repositoryArn],
    });
    fnOnCodePipelineCreate.role?.attachInlinePolicy(
      new iam.Policy(this, "EmbeddedLinuxCodePipelineCheckOSAndStop", {
        statements: [stopCodePipelinePolicy, ecrPolicy],
      }),
    );

    // Run this pipeline weekly to update the image OS regularly.
    const pipelineTarget = new events_target.CodePipeline(pipeline);
    new events.Rule(this, "EmbeddedLinuxCodePipelineWeeklyRefreshSchedule", {
      schedule: events.Schedule.cron({
        weekDay: "Tuesday",
        minute: "0",
        hour: "6",
      }),
      targets: [pipelineTarget],
    });

    // Add stack output for the source-repo bucket uri for this pipeline
    new cdk.CfnOutput(this, "SourceURI", {
      value: `s3://${props.pipelineSourceBucket.bucketName}/${props.pipelineSourcePrefix}/${sourceRepoAsset.s3ObjectKey}`,
      description: "The source bucket uri for this pipeline.",
    });

    new cdk.CfnOutput(this, "OutputURI", {
      value: `s3://${props.pipelineOutputBucket.bucketName}/${props.pipelineOutputPrefix}`,
      description: "The output bucket of this pipeline.",
    });

    new cdk.CfnOutput(this, "ArtifactURI", {
      value: `s3://${props.pipelineArtifactBucket.bucketName}/${props.pipelineArtifactPrefix}/${sourceRepoAsset.s3ObjectKey}`,
      description: "The artifact bucket of this pipeline.",
    });
  }

  private createVMImportRole(
    id: string,
    props: EmbeddedLinuxCodePipelineProps,
  ) {
    // Adapted from meta-aws-ewaol and
    // https://docs.aws.amazon.com/vm-import/latest/userguide/required-permissions.html
    const vmImportPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ["s3:GetBucketLocation", "s3:GetObject", "s3:ListBucket"],
          resources: [
            props.pipelineOutputBucket.bucketArn,
            `${props.pipelineOutputBucket.bucketArn}/*`,
          ],
        }),
        new iam.PolicyStatement({
          actions: ["ec2:CreateTags", "ec2:DescribeTags"],
          resources: ["*"],
          conditions: {
            StringEquals: {
              "ec2:ResourceTag/CreatedBy": [id],
            },
          },
        }),
        new iam.PolicyStatement({
          actions: ["ec2:CopySnapshot"],
          resources: [`arn:aws:ec2:${cdk.Stack.of(this).region}::snapshot/*`],
        }),
        new iam.PolicyStatement({
          actions: ["ec2:DescribeSnapshots"],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: [
            "kms:CreateGrant",
            "kms:Decrypt",
            "kms:DescribeKey",
            "kms:GenerateDataKeyWithoutPlaintext",
          ],
          resources: [props.encryptionKey.keyArn],
        }),
      ],
    });

    const vmImportRole = new iam.Role(
      this,
      "EmbeddedLinuxCodePipelineVMImportRole",
      {
        roleName: `${id}-vm-mport`,
        assumedBy: new iam.ServicePrincipal("vmie.amazonaws.com"),
        externalIds: ["vmimport"],
        inlinePolicies: { vmImportPolicy },
      },
    );
    return vmImportRole;
  }

  private addAMIExportPolicy(
    project: codebuild.PipelineProject,
    props: EmbeddedLinuxCodePipelineProps,
  ) {
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:CreateImage",
          "ec2:CreateTags",
          "ec2:DescribeImages",
          "ec2:DescribeSnapshots",
          "ec2:DescribeImportSnapshotTasks",
          "ec2:DescribeTags",
          "ec2:CancelImportTask",
        ],
        resources: ["*"],
      }),
    );
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ec2:ImportSnapshot"],
        resources: [
          `arn:aws:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:import-snapshot-task/*`,
          `arn:aws:ec2:${cdk.Stack.of(this).region}::snapshot/*`,
        ],
      }),
    );
    //Permissions for BackUp to S3
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObject",
          "s3:PutObjectTagging",
          "s3:AbortMultipartUpload",
        ],
        resources: [
          `${props.pipelineOutputBucket.bucketArn}`,
          `${props.pipelineOutputBucket.bucketArn}/*`,
        ],
      }),
    );
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:RegisterImage",
          "ec2:DeregisterImage",
          "ec2:CreateStoreImageTask",
        ],
        resources: [
          `arn:aws:ec2:${cdk.Stack.of(this).region}::image/*`,
          `arn:aws:ec2:${cdk.Stack.of(this).region}::snapshot/snap-*`,
        ],
      }),
    );
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ebs:CompleteSnapshot",
          "ebs:GetSnapshotBlock",
          "ebs:ListChangedBlocks",
          "ebs:ListSnapshotBlocks",
          "ebs:PutSnapshotBlock",
        ],
        resources: [`arn:aws:ec2:${cdk.Stack.of(this).region}::snapshot/*`],
      }),
    );
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:DescribeStoreImageTasks",
          "ec2:GetEbsEncryptionByDefault",
        ],
        resources: ["*"],
      }),
    );
  }
}
