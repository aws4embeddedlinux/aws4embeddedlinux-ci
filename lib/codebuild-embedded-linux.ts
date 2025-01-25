import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as efs from "aws-cdk-lib/aws-efs";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as kms from "aws-cdk-lib/aws-kms";

/**
 * Properties to allow customizing the build.
 */
export interface EmbeddedLinuxCodeBuildProjectProps extends cdk.StackProps {
  /** ECR Repository where the Build Host Image resides. */
  readonly ecrRepository: ecr.IRepository;
  /** Tag for the Build Host Image */
  readonly ecrRepositoryImageTag: string;
  /** VPC where the networking setup resides. */
  readonly vpc: ec2.IVpc;
  /** Additional policy statements to add to the build project. */
  readonly buildPolicyAdditions?: iam.PolicyStatement[];
  /** The encryption key use across*/
  readonly encryptionKey: kms.Key;
}

/**
 * The stack for creating a build pipeline.
 *
 * See {@link EmbeddedLinuxCodeBuildProjectProps} for configration options.
 */
export class EmbeddedLinuxCodeBuildProjectStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: EmbeddedLinuxCodeBuildProjectProps,
  ) {
    super(scope, id, props);

    /** Set up networking access and EFS FileSystems. */

    const projectSg = new ec2.SecurityGroup(
      this,
      "EmbeddedLinuxCodeBuildProjectSecurityGroup",
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
      `EmbeddedLinuxCodeBuildProjectFilesystem`,
      {
        vpc: props.vpc,
        allowAnonymousAccess: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
    );
    efsFileSystem.connections.allowFrom(projectSg, ec2.Port.tcp(2049));

    /** Create our CodeBuild Project. */
    const project = new codebuild.Project(
      this,
      "EmbeddedLinuxCodeBuildProject",
      {
        projectName: `${id}`,
        buildSpec: codebuild.BuildSpec.fromObject({
          version: "0.2",
          phases: {
            build: {
              commands: ['echo "DUMMY BUILDSPEC - can not be empty"'],
            },
          },
          artifacts: {
            files: ["**/*"],
            "base-directory": ".",
          },
        }),
        environment: {
          computeType: codebuild.ComputeType.X_LARGE,
          buildImage: codebuild.LinuxBuildImage.fromEcrRepository(
            props.ecrRepository,
            props.ecrRepositoryImageTag,
          ),
          privileged: true,
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
              "EmbeddedLinuxCodeBuildProjectLogs",
              {
                logGroupName: `${id}-EmbeddedLinuxCodeBuildProjectLogs`,
                retention: logs.RetentionDays.ONE_YEAR,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
              },
            ),
          },
        },
        encryptionKey: props.encryptionKey,
      },
    );

    if (props.buildPolicyAdditions) {
      props.buildPolicyAdditions.map((p) => project.addToRolePolicy(p));
    }

    project.addToRolePolicy(this.addProjectPolicies());

    project.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeBuildAdminAccess"),
    );

    /** Here we create the logic to check for presence of ECR image on the CodePipeline automatic triggering upon resource creation,
     * and stop the execution if the image does not exist.  */
    const fnOnPipelineCreate = new lambda.Function(
      this,
      "EmbeddedLinuxCodeBuildProjectOSImageCheckOnStart",
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
    if '${props.ecrRepositoryImageTag}' in i['imageTags']:
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
      "EmbeddedLinuxCodeBuildProjectOnPipelineStartRule",
      {
        eventPattern: {
          detailType: ["CodePipeline Pipeline Execution State Change"],
          source: ["aws.codepipeline"],
          detail: {
            state: ["STARTED"],
            "execution-trigger": {
              "trigger-type": ["CreatePipeline"],
            },
          },
        },
      },
    );
    pipelineCreateRule.addTarget(
      new targets.LambdaFunction(fnOnPipelineCreate),
    );
  }

  private addProjectPolicies(): iam.PolicyStatement {
    return new iam.PolicyStatement({
      actions: [
        "ec2:DescribeSecurityGroups",
        "codestar-connections:GetConnection",
        "codestar-connections:GetConnectionToken",
        "codeconnections:GetConnectionToken",
        "codeconnections:GetConnection",
        "codeconnections:ListConnection",
        "codeconnections:UseConnection",
        "codebuild:ListConnectedOAuthAccounts",
        "codebuild:ListRepositories",
        "codebuild:PersistOAuthToken",
        "codebuild:ImportSourceCredentials",
      ],
      resources: ["*"],
    });
  }
}
