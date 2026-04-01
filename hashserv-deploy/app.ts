#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

const app = new cdk.App();

const env = {
  account: "205930633217",
  region: "us-west-2",
};

/**
 * Standalone stack that deploys the Hash Equivalence Server
 * alongside the existing EmbeddedLinuxCodeBuildProject infrastructure.
 */
class HashEquivalenceServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const port = 8686;

    // Import existing resources
    const vpc = ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: "vpc-0674b335dfcb26866",
    });

    const codeBuildSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "CodeBuildSg",
      "sg-0819bfca947c7c361",
    );

    const sstateSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "SstateFsSg",
      "sg-03318f553912dbc34",
    );

    const sstateFs = efs.FileSystem.fromFileSystemAttributes(
      this,
      "SstateFs",
      {
        fileSystemId: "fs-0e8a6bba497718a0c",
        securityGroup: sstateSg,
      },
    );

    // EFS access point for hashserv database
    const accessPoint = new efs.AccessPoint(this, "HashServAccessPoint", {
      fileSystem: sstateFs,
      path: "/hashserv",
      createAcl: { ownerGid: "1000", ownerUid: "1000", permissions: "755" },
      posixUser: { gid: "1000", uid: "1000" },
    });

    // Security group for the Fargate task
    const hashservSg = new ec2.SecurityGroup(this, "HashServSG", {
      vpc,
      description: "Hash Equivalence Server",
    });
    hashservSg.addIngressRule(
      codeBuildSg,
      ec2.Port.tcp(port),
      "CodeBuild to HashServ",
    );
    sstateSg.addIngressRule(
      hashservSg,
      ec2.Port.tcp(2049),
      "HashServ to EFS",
    );

    // ECS Fargate
    const cluster = new ecs.Cluster(this, "HashEquivCluster", { vpc });

    const taskDef = new ecs.FargateTaskDefinition(this, "HashServTask", {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    taskDef.addVolume({
      name: "hashserv-data",
      efsVolumeConfiguration: {
        fileSystemId: "fs-0e8a6bba497718a0c",
        transitEncryption: "ENABLED",
        authorizationConfig: {
          accessPointId: accessPoint.accessPointId,
          iam: "ENABLED",
        },
      },
    });

    taskDef.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
        ],
        resources: [
          `arn:aws:elasticfilesystem:${this.region}:${this.account}:file-system/fs-0e8a6bba497718a0c`,
        ],
        conditions: {
          StringEquals: {
            "elasticfilesystem:AccessPointArn": accessPoint.accessPointArn,
          },
        },
      }),
    );

    const container = taskDef.addContainer("hashserv", {
      image: ecs.ContainerImage.fromAsset("../hashserv"),
      command: [
        "--bind",
        `0.0.0.0:${port}`,
        "--database",
        "/hashserv-data/hashserv.db",
        "--log",
        "INFO",
      ],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "hashserv",
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      portMappings: [{ containerPort: port }],
    });

    container.addMountPoints({
      sourceVolume: "hashserv-data",
      containerPath: "/hashserv-data",
      readOnly: false,
    });

    // Service discovery — hashserv.internal
    const namespace = new servicediscovery.PrivateDnsNamespace(
      this,
      "HashServNamespace",
      { name: "internal", vpc },
    );

    new ecs.FargateService(this, "HashServService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      securityGroups: [hashservSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      cloudMapOptions: {
        cloudMapNamespace: namespace,
        name: "hashserv",
      },
    });

    new cdk.CfnOutput(this, "HashServEndpoint", {
      value: `hashserv.internal:${port}`,
      description: "Hash Equivalence Server endpoint for BB_HASHSERVE",
    });
  }
}

new HashEquivalenceServerStack(app, "HashEquivalenceServer", { env });
app.synth();
