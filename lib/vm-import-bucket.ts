import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

const TAG = 'aws4embeddedlinux-ci';

export interface VMImportBucketProps extends s3.BucketProps {
  /**  The sanitized role name */
  readonly sanitizedRoleName?: string;
  readonly encryptionKeyArn: string;
}

/**
 * An S3 Bucket with roles for the VM Import/Export service.
 */
export class VMImportBucket extends s3.Bucket {
  public readonly roleName: string;
  constructor(scope: Construct, id: string, props: VMImportBucketProps) {
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
          actions: ['ec2:CreateTags', 'ec2:DescribeTags'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'ec2:ResourceTag/CreatedBy': [TAG],
            },
          },
        }),
        new iam.PolicyStatement({
          actions: ['ec2:CopySnapshot'],
          resources: [`arn:aws:ec2:${this.stack.region}::snapshot/*`],
        }),
        new iam.PolicyStatement({
          actions: ['ec2:DescribeSnapshots'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: [
            'kms:CreateGrant',
            'kms:Decrypt',
            'kms:DescribeKey',
            'kms:GenerateDataKeyWithoutPlaintext',
          ],
          resources: [props.encryptionKeyArn],
        }),
      ],
    });

    const importRole = new iam.Role(scope, 'VMImportRole', {
      roleName: props.sanitizedRoleName,
      assumedBy: new iam.ServicePrincipal('vmie.amazonaws.com'),
      externalIds: ['vmimport'],
      inlinePolicies: { importPolicy },
    });

    this.roleName = importRole.roleName;
  }
}
