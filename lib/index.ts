export * from "./codebuild-embedded-linux";
export * from "./codepipeline-embedded-linux-base-image";
export * from "./codepipeline-embedded-linux";
export * from "./codepipeline-resources";

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
