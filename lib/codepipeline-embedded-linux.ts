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
import * as path from "path";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as kms from "aws-cdk-lib/aws-kms";
import { VMImportBucket } from "./vm-import-bucket";
import { ProjectKind } from ".";

/**
 * Properties to allow customizing the build.
 */
export interface EmbeddedLinuxCodePipelineProps extends cdk.StackProps {
  /** The source bucket */
  readonly sourceBucket: s3.IBucket;
  /** ECR Repository where the Build Host Image resides. */
  readonly ecrRepository: ecr.IRepository;
  /** Tag for the Build Host Image */
  readonly ecrRepositoryImageTag: string;
  /** Artifact bucket to use */
  readonly artifactBucket: s3.Bucket;
  /** Output bucket to use */
  readonly outputBucket: s3.Bucket | VMImportBucket;
  /** The type of project being built.  */
  readonly projectKind: ProjectKind;
  /** VPC where the networking setup resides. */
  readonly vpc: ec2.IVpc;
  /** Prefix for S3 object within bucket */
  readonly artifactOutputObjectKey?: string;
  /** Additional policy statements to add to the build project. */
  readonly buildPolicyAdditions?: iam.PolicyStatement[];
  /** The encryption key use across*/
  readonly encryptionKey: kms.Key;
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

    if (props.projectKind && props.projectKind == ProjectKind.PokyAmi) {
      if (!(props.outputBucket instanceof VMImportBucket)) {
        throw "The 'outputBucket' property provided in [EmbeddedLinuxCodePipelineProps] is not of type [VMImportBucket] when using prokect kind [PokyAmi]";
      }
    }

    const sourceBase: string = `${props.projectKind}`;
    const sourceFileName: string = `source-${sourceBase}.zip`;
    const sourceLocalPath: string = `source-zip/${sourceBase}`;
    const sourceDestinationKeyPrefix: string = `source/${sourceBase}`;

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
    const sourceBucketDeploymentPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ],
          resources: [
            `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/lambda/EmbeddedLinuxCodePipeline-CustomCDKBucketDeployment-${props.projectKind}*`,
          ],
        }),
      ],
    });
    const sourceBucketDeploymentRole = new iam.Role(
      this,
      "EmbeddedLinuxCodePipelineBucketDeploymentRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        inlinePolicies: { sourceBucketDeploymentPolicy },
      },
    );

    // deploy the source to the bucket
    const bucketDeployment = new BucketDeployment(
      this,
      "EmbeddedLinuxCodePipelineBucketDeployment",
      {
        // Note: Run `npm run zip-data` before deploying this stack!
        sources: [Source.asset(path.join(__dirname, "..", sourceLocalPath))],
        destinationBucket: props.sourceBucket,
        role: sourceBucketDeploymentRole,
        extract: true,
        destinationKeyPrefix: sourceDestinationKeyPrefix,
      },
    );

    let environmentVariables = {};
    let scriptAsset!: Asset;

    if (props.projectKind && props.projectKind == ProjectKind.PokyAmi) {
      scriptAsset = new Asset(this, "CreateAMIScript", {
        path: path.join(__dirname, "../scripts/create-ec2-ami.sh"),
      });

      environmentVariables = {
        IMPORT_BUCKET: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.outputBucket.bucketName,
        },
        ROLE_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: (props.outputBucket as VMImportBucket).roleName,
        },
        SCRIPT_URL: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: scriptAsset.s3ObjectUrl,
        },
      };
    }

    /** Create our CodeCodePipeline Actions. */
    const sourceOutput = new codepipeline.Artifact("Source");
    const sourceAction = new codepipeline_actions.S3SourceAction({
      actionName: "Source",
      trigger: codepipeline_actions.S3Trigger.EVENTS,
      output: sourceOutput,
      bucket: props.sourceBucket,
      bucketKey: `${sourceDestinationKeyPrefix}/${sourceFileName}`,
    });

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
            ...environmentVariables,
            AWS_ACCOUNT_ID: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: cdk.Stack.of(this).account,
            },
            AWS_DEFAULT_REGION: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: cdk.Stack.of(this).region,
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

    if (props.projectKind && props.projectKind == ProjectKind.PokyAmi) {
      props.outputBucket.grantReadWrite(project);
      project.addToRolePolicy(this.addVMExportPolicy());

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
        this.addAMIS3BackupPolicy(props.outputBucket.bucketArn),
      );
      project.addToRolePolicy(
        this.addAMIEC2EBSBackupPolicy(cdk.Stack.of(this).region),
      );
      project.addToRolePolicy(
        this.addAMIEBSBackupPolicy(cdk.Stack.of(this).region),
      );
      project.addToRolePolicy(this.addAMIBackupPolicy());
      scriptAsset.grantRead(project);
    }

    const buildOutput = new codepipeline.Artifact();
    const buildAction = new codepipeline_actions.CodeBuildAction({
      input: sourceOutput,
      actionName: "Build",
      outputs: [buildOutput],
      project,
    });

    let artifactAction: codepipeline_actions.S3DeployAction;

    if (props.artifactOutputObjectKey) {
      artifactAction = new codepipeline_actions.S3DeployAction({
        actionName: "Artifact",
        input: buildOutput,
        bucket: props.outputBucket,
        objectKey: props.artifactOutputObjectKey,
      });
    } else {
      artifactAction = new codepipeline_actions.S3DeployAction({
        actionName: "Artifact",
        input: buildOutput,
        bucket: props.outputBucket,
      });
    }

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
        artifactBucket: props.artifactBucket,
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
            stageName: "Artifact",
            actions: [artifactAction],
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

    new cdk.CfnOutput(this, "BuildSource", {
      value: `s3://${props.sourceBucket.bucketName}/${sourceDestinationKeyPrefix}/${sourceFileName}`,
      description: "The source bucket key of this pipeline.",
    });

    new cdk.CfnOutput(this, "BuildOutput", {
      value: props.outputBucket.bucketName,
      description: "The output bucket of this pipeline.",
    });
  }

  private addVMExportPolicy(): iam.PolicyStatement {
    return new iam.PolicyStatement({
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
    });
  }

  private addAMIS3BackupPolicy(artifactBucketArn: string): iam.PolicyStatement {
    return new iam.PolicyStatement({
      actions: [
        "s3:GetObject",
        "s3:ListBucket",
        "s3:PutObject",
        "s3:PutObjectTagging",
        "s3:AbortMultipartUpload",
      ],
      resources: [artifactBucketArn, `${artifactBucketArn}/*`],
    });
  }

  private addAMIEBSBackupPolicy(region: string): iam.PolicyStatement {
    return new iam.PolicyStatement({
      actions: [
        "ebs:CompleteSnapshot",
        "ebs:GetSnapshotBlock",
        "ebs:ListChangedBlocks",
        "ebs:ListSnapshotBlocks",
        "ebs:PutSnapshotBlock",
      ],
      resources: [`arn:aws:ec2:${region}::snapshot/*`],
    });
  }

  private addAMIBackupPolicy(): iam.PolicyStatement {
    return new iam.PolicyStatement({
      actions: ["ec2:DescribeStoreImageTasks", "ec2:GetEbsEncryptionByDefault"],
      resources: ["*"],
    });
  }

  private addAMIEC2EBSBackupPolicy(region: string): iam.PolicyStatement {
    return new iam.PolicyStatement({
      actions: [
        "ec2:RegisterImage",
        "ec2:DeregisterImage",
        "ec2:CreateStoreImageTask",
      ],
      resources: [
        `arn:aws:ec2:${region}::image/*`,
        `arn:aws:ec2:${region}::snapshot/snap-*`,
      ],
    });
  }
}
