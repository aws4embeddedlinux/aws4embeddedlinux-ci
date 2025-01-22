import * as path from "path";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as events from "aws-cdk-lib/aws-events";
import * as events_target from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";

/**
 * Select options for the {@link BuildImageCodePipelineStack}.
 */
export interface EmbeddedLinuxCodePipelineBaseImageProps
  extends cdk.StackProps {
  /** The source bucket */
  readonly sourceBucket: s3.IBucket;
  /** The ECR Repository to push to. */
  readonly ecrRepository: ecr.IRepository;
  /** Artifact bucket to use */
  readonly artifactBucket: s3.Bucket;
  /** The encryption key use across*/
  readonly encryptionKey: kms.Key;
}

/**
 * The pipeline for building the CodeBuild Image used in other pipelines. This
 * will produce an image for an OS based on verified Yocto hosts.
 *
 * For configuration options see {@link BuildBaseImageCodePipelineProps}.
 */
export class EmbeddedLinuxCodePipelineBaseImageStack extends cdk.Stack {
  /** The ECR Repository where the image is located. */
  public readonly ecrRepository: ecr.IRepository;
  /** The ECR Image Tag to find the base imaged. */
  public readonly ecrRepositoryImageTag: string;

  constructor(
    scope: Construct,
    id: string,
    props: EmbeddedLinuxCodePipelineBaseImageProps,
  ) {
    super(scope, id, props);

    this.ecrRepository = props.ecrRepository;
    this.ecrRepositoryImageTag = `${id}`;

    const sourceBase: string = "base-image";
    const sourceFileName: string = `source-${sourceBase}.zip`;
    const sourceLocalPath: string = `source-zip/${sourceBase}`;
    const sourceDestinationKeyPrefix: string = `source/${sourceBase}`;

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
            `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/lambda/EmbeddedLinuxCodePipelineBaseImage-CustomCDKBucketDeployment*`,
          ],
        }),
      ],
    });
    const sourceBucketDeploymentRole = new iam.Role(
      this,
      "CodePipelineBuildBaseImageBucketDeploymentRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        inlinePolicies: { sourceBucketDeploymentPolicy },
      },
    );

    // deploy the source to the bucket
    const bucketDeployment = new BucketDeployment(
      this,
      "CodePipelineBuildBaseImageBucketDeployment",
      {
        // Note: Run `npm run zip-data` before deploying this stack!
        sources: [Source.asset(path.join(__dirname, "..", sourceLocalPath))],
        destinationBucket: props.sourceBucket,
        role: sourceBucketDeploymentRole,
        extract: true,
        destinationKeyPrefix: sourceDestinationKeyPrefix,
      },
    );

    // Create a source action.
    const sourceOutput = new codepipeline.Artifact("Source");
    const sourceAction = new codepipeline_actions.S3SourceAction({
      actionName: "Source",
      trigger: codepipeline_actions.S3Trigger.EVENTS,
      output: sourceOutput,
      bucket: props.sourceBucket,
      bucketKey: `${sourceDestinationKeyPrefix}/${sourceFileName}`,
    });

    // Create a build action.
    const project = new codebuild.PipelineProject(
      this,
      "CodePipelineBuildBaseImageProject",
      {
        projectName: `${this.ecrRepositoryImageTag}`,
        buildSpec: codebuild.BuildSpec.fromSourceFilename(`buildspec.yml`),
        environment: {
          computeType: codebuild.ComputeType.LARGE,
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          privileged: true,
        },
        environmentVariables: {
          ECR_REPOSITORY_URI: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.ecrRepository.repositoryUri,
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
            value: this.ecrRepositoryImageTag,
          },
        },
        logging: {
          cloudWatch: {
            logGroup: new logs.LogGroup(
              this,
              "CodePipelineBuildBaseImageBuildLogs",
              {
                logGroupName: `${id}-CodePipelineBuildBaseImageBuildLogs`,
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
    props.ecrRepository.grantPullPush(project);

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: "Build",
      project: project,
      input: sourceOutput,
    });

    const pipeline = new codepipeline.Pipeline(
      this,
      "CodePipelineBuildBaseImageCodePipeline",
      {
        artifactBucket: props.artifactBucket,
        pipelineName: `${this.ecrRepositoryImageTag}`,
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
        ],
        restartExecutionOnUpdate: true,
      },
    );
    pipeline.node.addDependency(project);

    // Run this pipeline weekly to update the image OS regularly.
    const pipelineTarget = new events_target.CodePipeline(pipeline);
    new events.Rule(this, "CodePipelineBuildBaseImageWeeklyRefreshSchedule", {
      schedule: events.Schedule.cron({
        weekDay: "Monday",
        minute: "0",
        hour: "6",
      }),
      targets: [pipelineTarget],
    });

    // Add a stack output for the ECR repository and image tag
    new cdk.CfnOutput(this, "ECRRepositoryName", {
      value: this.ecrRepository.repositoryName,
      description:
        "The ECR Repository name where the base image will be pushed",
    });
    new cdk.CfnOutput(this, "ECRBaseImageTag", {
      value: this.ecrRepositoryImageTag,
      description: "The ECR Image Tag where the base image will be pushed",
    });
    new cdk.CfnOutput(this, "ECRBaseImageCheckCommand", {
      value: `aws ecr list-images --repository-name "${this.ecrRepository.repositoryName}" --query "imageIds[?imageTag=='${this.ecrRepositoryImageTag}']"`,
      description: "The AWS CLI command to check if the ECR Image was pushed",
    });
  }
}
