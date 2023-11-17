import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';

import * as path from 'path';
import * as kms from 'aws-cdk-lib/aws-kms';
import { RemovalPolicy } from 'aws-cdk-lib';

/**
 * Select options for the BuildImageDataStack.
 */
export interface BuildImageDataProps extends cdk.StackProps {
  /** The bucket name for image build sources. This must be globally unique. */
  readonly bucketName: string;
}

/**
 * Input (Source) data for our Build Image Pipeline.
 */
export class BuildImageDataStack extends cdk.Stack {
  /** The bucket where source for Build Images are. */
  public readonly bucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: BuildImageDataProps) {
    super(scope, id, props);

    this.bucket = this.createDeploymentBucket(props.bucketName);
  }

  /**
   * Create a bucket and S3 deployment to this bucket.
   *
   * @param bucketName - The name of the bucket. Must be globally unique.
   * @param env - Environment passed to the stack.
   */
  private createDeploymentBucket(bucketName: string): s3.IBucket {
    const accessLoggingBucket = new s3.Bucket(this, 'LoggingBucket', {
      versioned: true,
      enforceSSL: true,
    });

    const encryptionKey = new kms.Key(this, 'PipelineArtifactKey', {
      removalPolicy: RemovalPolicy.DESTROY,
      enableKeyRotation: true,
    });

    // Create a bucket, then allow a deployment Lambda to upload to it.
    const dataBucket = new s3.Bucket(this, 'BuildImageDataBucket', {
      bucketName,
      versioned: true,
      encryptionKey: encryptionKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      serverAccessLogsBucket: accessLoggingBucket,
    });

    const cwPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: [
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/BuildImageData-CustomCDKBucketDeployment*"`,
          ],
        }),
      ],
    });

    const dataBucketDeploymentRole = new iam.Role(
      this,
      'BuildImageBucketRole',
      {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        inlinePolicies: { cwPolicy },
      }
    );

    dataBucketDeploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [encryptionKey.keyArn],
      })
    );

    new BucketDeployment(this, 'BuildImageBucketDeployment', {
      // Note: Run `npm run zip-data` before deploying this stack!
      sources: [Source.asset(path.join(__dirname, '..', 'assets/build-image'))],
      destinationBucket: dataBucket,
      role: dataBucketDeploymentRole,
      extract: true,
    });

    return dataBucket;
  }
}
