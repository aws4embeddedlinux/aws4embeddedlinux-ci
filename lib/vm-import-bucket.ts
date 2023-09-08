import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib/core';

const MAX_ALLOWED_LENGTH = 50;
/**
 * ...
 */
export class VMImportBucket extends s3.Bucket {
  constructor(scope: Construct, id: string, props: s3.BucketProps) {
    super(scope, id, {
      ...props,
    });

    // Adapted from meta-aws-ewaol and
    // https://docs.aws.amazon.com/vm-import/latest/userguide/required-permissions.html
    const importPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['s3:GetBucketLocation', 's3:GetObject', 's3:ListBucket'],
          resources: [this.bucketArn, `${this.bucketArn}/*`],
        }),
        new iam.PolicyStatement({
          actions: [
            'ec2:ModifySnapshotAttribute',
            'ec2:CopySnapshot',
            'ec2:RegisterImage',
            'ec2:Describe*',
          ],
          resources: ['*'],
        }),
      ],
    });

    const stackName = cdk.Stack.of(this).stackName;
    const sanitizedName = stackName.substring(
      0,
      Math.min(stackName.length, MAX_ALLOWED_LENGTH)
    );
    const roleName = `vmimport-${sanitizedName}`;

    new iam.Role(scope, 'VMImportRole', {
      roleName: roleName,
      assumedBy: new iam.ServicePrincipal('vmie.amazonaws.com'),
      externalIds: [roleName],
      inlinePolicies: { importPolicy },
    });
  }
}
