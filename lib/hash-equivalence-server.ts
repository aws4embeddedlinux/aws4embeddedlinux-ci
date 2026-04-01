import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as efs from "aws-cdk-lib/aws-efs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";

export interface HashEquivalenceServerProps extends cdk.StackProps {
  /** VPC where the server will run. */
  readonly vpc: ec2.IVpc;
  /** Security group used by CodeBuild projects that need access. */
  readonly codeBuildSecurityGroup: ec2.ISecurityGroup;
  /** Existing sstate EFS filesystem ID. */
  readonly sstateFileSystemId: string;
  /** Security group of the existing sstate EFS. */
  readonly sstateSecurityGroupId: string;
}

/**
 * Deploys a BitBake Hash Equivalence Server on ECS Fargate.
 *
 * The server stores its database on an EFS access point and is
 * discoverable via Cloud Map at hashserv.internal:8686.
 */
export class HashEquivalenceServerStack extends cdk.Stack {
  /** The DNS name for the hash equivalence server. */
  public readonly endpoint: string;

  constructor(
    scope: Construct,
    id: string,
    props: HashEquivalenceServerProps,
  ) {
    super(scope, id, props);

    const port = 8686;

    // Import the existing sstate EFS
    const sstateSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "SstateFsSg",
      props.sstateSecurityGroupId,
    );
    const sstateFs = efs.FileSystem.fromFileSystemAttributes(
      this,
      "SstateFs",
      {
        fileSystemId: props.sstateFileSystemId,
        securityGroup: sstateSg,
      },
    );

    const accessPoint = new efs.AccessPoint(this, "HashServAccessPoint", {
      fileSystem: sstateFs,
      path: "/hashserv",
      createAcl: { ownerGid: "1000", ownerUid: "1000", permissions: "755" },
      posixUser: { gid: "1000", uid: "1000" },
    });

    // Security group for the Fargate task
    const hashservSg = new ec2.SecurityGroup(this, "HashServSG", {
      vpc: props.vpc,
      description: "Hash Equivalence Server",
    });
    hashservSg.addIngressRule(
      props.codeBuildSecurityGroup,
      ec2.Port.tcp(port),
      "CodeBuild to HashServ",
    );
    // Allow the Fargate task to reach EFS
    sstateSg.addIngressRule(hashservSg, ec2.Port.tcp(2049), "HashServ to EFS");

    // ECS cluster
    const cluster = new ecs.Cluster(this, "HashEquivCluster", {
      vpc: props.vpc,
    });

    // Task definition
    const taskDef = new ecs.FargateTaskDefinition(this, "HashServTask", {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    taskDef.addVolume({
      name: "hashserv-data",
      efsVolumeConfiguration: {
        fileSystemId: props.sstateFileSystemId,
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
          `arn:aws:elasticfilesystem:${this.region}:${this.account}:file-system/${props.sstateFileSystemId}`,
        ],
        conditions: {
          StringEquals: {
            "elasticfilesystem:AccessPointArn": accessPoint.accessPointArn,
          },
        },
      }),
    );

    const container = taskDef.addContainer("hashserv", {
      image: ecs.ContainerImage.fromAsset("./hashserv"),
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
      { name: "internal", vpc: props.vpc },
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

    this.endpoint = `hashserv.internal:${port}`;

    new cdk.CfnOutput(this, "HashServEndpoint", {
      value: this.endpoint,
      description: "Hash Equivalence Server endpoint for BB_HASHSERVE",
    });
  }
}
