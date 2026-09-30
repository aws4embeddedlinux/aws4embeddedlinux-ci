#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

const app = new cdk.App();

const env = {
  account: "205930633217",
  region: "us-west-2",
};

/** Yocto releases that need their own hash equivalence server. */
const RELEASES = ["master", "scarthgap", "whinlatter", "wrynose"];

/**
 * Deploys per-release Hash Equivalence Servers with:
 * - RDS PostgreSQL backend (existing instance, databases pre-created)
 * - Cloud Map for DNS service discovery
 * - 2 Fargate tasks per release for availability
 * - HTTP health check on port 8687
 */
class HashEquivalenceServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const port = 8686;
    const healthPort = 8687;

    // Import existing resources
    const vpc = ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: "vpc-0674b335dfcb26866",
    });

    const codeBuildSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "CodeBuildSg",
      "sg-0819bfca947c7c361",
    );

    // Import existing RDS credentials from Secrets Manager
    // (manually created secret pointing to existing RDS instance)
    const dbSecret = new secretsmanager.Secret(this, "HashServDBSecret", {
      secretName: "hashserv-db-credentials-v2",
      secretStringValue: cdk.SecretValue.unsafePlainText(JSON.stringify({
        host: "hashequivalenceserver-hashservdb2386d325-0ewh2naxlsc9.cfe8064aeucv.us-west-2.rds.amazonaws.com",
        username: "hashserv",
        password: "HashServ2026SecurePass",
        port: 5432,
      })),
    });

    // Security group for hashserv tasks
    const hashservSg = new ec2.SecurityGroup(this, "HashServSG", {
      vpc,
      description: "Hash Equivalence Servers (PostgreSQL backend)",
    });
    hashservSg.addIngressRule(
      codeBuildSg,
      ec2.Port.tcp(port),
      "CodeBuild to HashServ",
    );

    // Allow hashserv to reach existing RDS (on default VPC SG)
    const defaultSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "DefaultSg",
      "sg-095d13de1e040f414",
    );
    defaultSg.addIngressRule(
      hashservSg,
      ec2.Port.tcp(5432),
      "HashServ to RDS",
    );

    // ECS cluster
    const cluster = new ecs.Cluster(this, "HashEquivCluster", { vpc });

    // Cloud Map namespace for DNS discovery
    const namespace = new servicediscovery.PrivateDnsNamespace(
      this,
      "HashServNamespace",
      { name: "internal", vpc },
    );

    // Deploy per-release: 2 Fargate tasks with Cloud Map
    for (const release of RELEASES) {
      const taskDef = new ecs.FargateTaskDefinition(
        this,
        `HashServTask-${release}`,
        {
          cpu: 512,
          memoryLimitMiB: 1024,
        },
      );

      taskDef.addContainer("hashserv", {
        image: ecs.ContainerImage.fromAsset("../hashserv"),
        environment: {
          DB_HOST: "hashequivalenceserver-hashservdb2386d325-0ewh2naxlsc9.cfe8064aeucv.us-west-2.rds.amazonaws.com",
          DB_NAME: `hashserv_${release}`,
          DB_USER: "hashserv",
          LOG_LEVEL: "INFO",
        },
        secrets: {
          DB_PASS: ecs.Secret.fromSecretsManager(dbSecret, "password"),
        },
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: `hashserv-${release}`,
          logRetention: logs.RetentionDays.ONE_MONTH,
        }),
        portMappings: [
          { containerPort: port },
          { containerPort: healthPort },
        ],
        healthCheck: {
          command: ["CMD-SHELL", `python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:${healthPort}/')" || exit 1`],
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          retries: 3,
          startPeriod: cdk.Duration.seconds(10),
        },
      });

      new ecs.FargateService(
        this,
        `HashServService-${release}`,
        {
          cluster,
          taskDefinition: taskDef,
          desiredCount: 2,
          securityGroups: [hashservSg],
          vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
          cloudMapOptions: {
            cloudMapNamespace: namespace,
            name: `hashserv-${release}`,
            containerPort: port,
          },
        },
      );

      new cdk.CfnOutput(this, `HashServEndpoint-${release}`, {
        value: `hashserv-${release}.internal:${port}`,
        description: `Hash Equivalence Server endpoint for ${release}`,
      });
    }
  }
}

new HashEquivalenceServerStack(app, "HashEquivalenceServer", { env });
app.synth();
