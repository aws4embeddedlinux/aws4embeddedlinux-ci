import * as s3 from "aws-cdk-lib/aws-s3";

export * from "./codebuild-embedded-linux";
export * from "./codepipeline-embedded-linux-base-image";
export * from "./codepipeline-embedded-linux";
export * from "./codepipeline-resources";

export function isBucketVersioned(bucket: s3.Bucket | s3.IBucket) {
  const bucketCfn: s3.CfnBucket = bucket.node.defaultChild as s3.CfnBucket;
  if (
    bucketCfn.versioningConfiguration &&
    (
      bucketCfn.versioningConfiguration as s3.CfnBucket.VersioningConfigurationProperty
    ).status != "Enabled"
  ) {
    return true;
  }
  return false;
}

/**
 * The type of project built.
 */
export enum ProjectType {
  /** Build core-image-minimal from poky. */
  Poky = "poky",
  /** Build the Qemu meta-aws Demonstration Distribution. */
  QEmu = "qemu",
  /** Build an EC2 AMI */
  PokyAmi = "poky-ami",
  /** Build an kas based image */
  Kas = "kas",
  /** Build an Renesas image */
  Renesas = "renesas",
  /** Build an IMX image using NXP layers. */
  NxpImx = "nxp-imx",
  /** Build no pipeline, just CodeBuild project to connect with GitHub actions. */
  CodeBuild = "codebuild",
  /** Build an image using a custom buildspec and asstes. */
  Custom = "custom",
}
