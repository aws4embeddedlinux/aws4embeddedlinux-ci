# aws4embeddedlinux-ci

The `aws4embeddedlinux-ci` library helps you deploy an AWS cloud infrastructure supporting the Embedded Linux builds for your project using [AWS CDK](https://github.com/aws/aws-cdk).

## Table of Contents

1. [Architecture](#architecture)
1. [API documentation](#api-documentation)
1. [Project Build with AWS CodePipeline](#project-build-with-aws-codepipeline)
1. [Project Build with AWS CodeBuild as Action Runner](#project-build-with-aws-codebuild-as-action-runner)
1. [Setup](#setup)
1. [Development Setup](#development-setup)
1. [Known issues](#known-issues)
1. [Security](#security)
1. [Contributing](#contributing)
1. [License](#license)

## Architecture

This is the overall architecture pattern used to deploy the build pipeline:

![architecture overview](images/architecture-v0.2.x.svg "Architecture")

[Bask to the top](#aws4embeddedlinux-ci)

## API documentation

The [API documentation](https://aws4embeddedlinux.github.io/aws4embeddedlinux-ci/) is generated automatically using [Typedoc](https://typedoc.org/).

[Bask to the top](#aws4embeddedlinux-ci)

## Project Build with AWS CodePipeline

Several pipelines are provided in this library, each one demonstrating a different aspect of how to build a Yocto image with AWS.

Once deployed, ou can review the pipeline execution from the `Developer Tools > Pipeline - CodePipeline > Pipelines` page in the AWS Console.

From the pipeline page, you can find the source repository (S3), the CodeBuild Project (with the build logs), and the S3 bucket that the image is uploaded to, at the end.

Each pipelines will refresh/re-run automatically every week using AWS EventBridge in order to grab the latest updates.

### <ins>__Poky__</ins>

The pipeline name will end with **`poky`**.

This example will build the `core-image-minimal` image from Poky using the repo tool to manage layers. CVE checking is also enabled in the buildspec file.

**_Expected build times_**:

- First build: **32 minutes**
- Rebuild (without any change, just use sstate cache): **8 minutes**

### <ins>__Poky EC2 AMI__</ins>

The pipeline name will end with **`poky-ami`**.

Yocto can be used to create an EC2 AMI. This example builds an AMI based on Poky and meta-aws and exports it to your AMI registry using the [VM Import/Export Service](https://docs.aws.amazon.com/vm-import/latest/userguide/what-is-vmimport.html).

**_Expected build times_**:

- First build: **52 minutes**
- Rebuild (without any change, just use sstate cache): **17 minutes**

### <ins>__Kas__</ins>

The pipeline name will end with **`kas`**.

The Kas example shows how to use a [Kas Config](https://github.com/aws4embeddedlinux/aws4embeddedlinux-ci/blob/main/source-repo/kas/kas.yml) to manage layers.

This tool can help programatically manage layers and config with tighter Yocto integration than Git Submodules or the Repo tool.

**_Expected build times_**:

- First build: **36 minutes**
- Rebuild (without any change, just use sstate cache): **11 minutes**

### <ins>__QEmu__</ins>

The pipeline name will end with **`qemu`**.

This example builds a Qemu based image using [meta-aws-demos](https://github.com/aws4embeddedlinux/meta-aws-demos).

The Qemu image can be run in the CodeBuild environment. Using SLIRP networking, [OEQA testing](https://docs.yoctoproject.org/singleindex.html#performing-automated-runtime-testing) such as ptest can be run in the pipeline.

**_Expected build times_**:

- First build: **45 minutes**
- Rebuild (without any change, just use sstate cache): **14 minutes**

### <ins>__NXP / IMX__</ins>

The pipeline name will end with **`nxp`**.

This example will build an image for the [i.MX 6ULL EVK](https://www.nxp.com/design/development-boards/i-mx-evaluation-and-development-boards/evaluation-kit-for-the-i-mx-6ull-and-6ulz-applications-processor:MCIMX6ULL-EVK) board.

**NXP requires users to accept and comply with a EULA in order to build** and, for this reason, **the buildspec will require modification before the build succeeds**.

See the [IMX Yocto Users Guide](https://www.nxp.com/docs/en/user-guide/IMX_YOCTO_PROJECT_USERS_GUIDE.pdf) for more detail.

**_Expected build times_**:

- First build: **xx minutes**
- Rebuild (without any change, just use sstate cache): **xx minutes**

### <ins>__Renesas__</ins>

This example is based on the [Yocto / Renesas R-Car work](https://elinux.org/R-Car/Boards/Yocto-Gen3/v5.9.0) to build an image for Renesas R-Car-H3 Starter Kit Premier board (unofficial name - H3ULCB) including the proprietary graphics and multimedia drivers from Renesas.

You will need to download the Multimedia and Graphics library and related Linux drivers from the following link (registration necessary):

- https://www.renesas.com/us/en/application/automotive/r-car-h3-m3-h2-m2-e2-documents-software

**Download the following files:**

- R-Car_Gen3_Series_Evaluation_Software_Package_for_Linux-20220121
- R-Car_Gen3_Series_Evaluation_Software_Package_of_Linux_Drivers-20220121

Graphic drivers are required for Wayland. Multimedia drivers are optional.

**Steps to build the image:**

- Create a folder named `proprietary` in the root of the source repo
- Copy the downloaded files into the `proprietary` folder
- Uncomment the `#TODO` line in the `build.sh` file in the source repo
- Deploy the build pipeline

A build should automatically start. Once it succeeds you will get an image containing the proprietary graphics and multimedia drivers.

**_Expected build times_**:

- First build: **30 minutes**
- Rebuild (without any change, just use sstate cache): **9 minutes**

[Bask to the top](#aws4embeddedlinux-ci)


## Project Build with AWS CodeBuild as Action Runner


This will create an AWS CodeBuild project ready to build Embedded Linux which can be used to connect to an external source, e.g. [GitHub Actions](https://docs.aws.amazon.com/codebuild/latest/userguide/action-runner.html). This is not using any AWS CodePipeline as in the the Pipeline examples section.

You can use the following [example](https://github.com/aws4embeddedlinux/meta-aws-demos/blob/master/.github/workflows/build-gg.yml) for your GitHub Action.

We recommend you to clone the created AWS CodeBuild project and then proceed with the GitHub Action configuration.
However, this will result in the use of the same EFS file system across projects.

Using the AWS CodeBuild project requires a source to be configured manually in the AWS Console at `Developer Tools > Build - CodeBuild > Projects`.

To configure the AWS CodeBuild source connection to a GitHub repository, you will need to:

- Select the AWS CodeBuild project (`aws4el-ci-codebuild-project`)
- Select the `Project Details` tab
- Scroll to the `Source` section and click on **Edit**.
- Select **`GitHub`** as a **Source provider**. Configure the access to your repository
- Scroll to the **Primary source webhook events** section, enable **Rebuild every time a code change is pushed to this repository**
- Expand the **Webhook event filter groups** section and click on **Add filter group** if no group is present, then select **WORKFLOW_JOB_QUEUED** as **Filter group 1**


Modify your repository GitHub action by replacing the following line:
```
runs-on: ${{ vars.CODEBUILD_RUNNER_NAME }}-${{ github.run_id }}-${{ github.run_attempt }}
```

with:

```
runs-on: codebuild-<project-name>-${{ github.run_id }}-${{ github.run_attempt }}
```

`<project-name>` should be replaced by your AWS CodeBuild project name (`aws4el-ci-codebuild-project`).
There might be more than one occuerence to replace in the file.

Refer to the following [example](https://github.com/aws4embeddedlinux/meta-aws-demos/blob/master/.github/workflows/build-gg.yml) for more details.

[Bask to the top](#aws4embeddedlinux-ci)

## Setup

In order to use this library, you must first set up an [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) project, including
installing the CDK tool and bootstrapping the account you wish to deploy to.

Additionally, you must have [NodeJS](https://nodejs.org/en/) installed.

> [!NOTE]
>
> This library is tested against Node Versions 22. If these version is not available for your system, we recommend using [NVM](https://github.com/nvm-sh/nvm) to install a compatible version.
>

You can also use the [sample project code](https://github.com/aws4embeddedlinux/aws4embeddedlinux-ci-examples) provided to get started and deploy the stacks.

[Bask to the top](#aws4embeddedlinux-ci)

### Setting Up A New Project

In order to create a new project, you will need to initialize a new CDK project.

More details can be found in the [CDK Getting Started Documentation](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html).

The following commands will create a new CDK project named `my-project`:

```bash
mkdir my-project
cd my-project
cdk init app --language typescript
```

Then you will need to install the CDK library including the `aws4embeddedlinux-ci` library either using `npm`:

```bash
npm install aws4embeddedlinux/aws4embeddedlinux-ci
```

of `yarn':

```bash
yarn add aws4embeddedlinux-cdk-lib@aws4embeddedlinux/aws4embeddedlinux-ci
yarn install
```

> If you are not familliar with Yarn, please refer to the [documentation](https://yarnpkg.com/getting-started).

Once added, you can start creatin your application using the library.

For example, you can start by importing classes using:

```ts
import {
  EmbeddedLinuxCodePipelineBaseImageStack,
  EmbeddedLinuxCodePipelineStack,
  EmbeddedLinuxCodeBuildProjectStack,
  PipelineResourcesStack,
  ProjectType,
} from "aws4embeddedlinux-cdk-lib";
```

Then deploy the base resources and base image pipeline stacks:

```typescript
const pipelineResourcesStack = new PipelineResourcesStack(app, `demo-resources`, {...});
const baseImageStack = new EmbeddedLinuxCodePipelineBaseImageStack(app, `demo-pipeline-base-image`, {...});
```

And ultimately deploy the target pipeline:
```typescript
const projectPipeline = new EmbeddedLinuxCodePipelineStack(app, "demo-project", {
  projectType: ProjectType.Poky,
  ecrRepository: <ecrRepository>,
  ecrRepositoryImageTag: <ecrRepositoryImageTag>,
  pipelineSourceBucket: <SourceBucket>,
  pipelineArtifactBucket: <ArtifactBucket>,
  pipelineOutputBucket: <OutputBucket>,
  vpc: <vpc>,
  encryptionKey: <encryptionKey>,
});
```

Refer to the [API Documentation](https://aws4embeddedlinux.github.io/aws4embeddedlinux-ci) and the [sample](https://github.com/aws4embeddedlinux/aws4embeddedlinux-ci-examples) for more details.

Once you have completed the code of your application, you can deploy the CDK stack using:

```bash
cdk deploy
```

After the CDK application is successfully deployed, the 'Base Image' pipeline needs to complete successfully.

This will create an Ubuntu based container for building the Yocto images.

> [!NOTE]
>
> This container is used by the other pipelines. If the other pipelines are run before this container is created and pushed to [ECR](https://aws.amazon.com/ecr/), they will fail.
>
> The 'Base Image' pipeline will run weekly by default to keep the container patched and up to date.
>

> [!NOTE]
>
> We recommend you to deploy first the 'Base Image' pipeline and once the pipeline completes successfully, then you can deploy the other pipelines in you application as described in the [sample](https://github.com/aws4embeddedlinux/aws4embeddedlinux-ci-examples).
>

Once your pipelines completes successfully, the Yocto deploy directory generated content will be pushed into a S3 bucket.

[Bask to the top](#aws4embeddedlinux-ci)

## Development Setup

The repository is leveraging Yarn 2 and if you are not familliar with Yarn, please refer to the [documentation](https://yarnpkg.com/getting-started).

If you are looking to develop new feature, you can use [`yarn link`](https://classic.yarnpkg.com/lang/en/docs/cli/link/k) to develop with a local copy of this repo.

In this library repo, execute the following:

```bash
yarn install
yarn run build
yarn link
```

and in your project folder:

```bash
yarn install
yarn link "aws4embeddedlinux-cdk-lib"
yarn run build
```

This will link through the system `node_modules` install.

> _Note:_
>
> You should not install / reference the `aws4embeddedlinux/aws4embeddedlinux-ci` library in your `package.json` when using this approach.
>


> _Note:_
>
> After changing the code for the `aws4embeddedlinux/aws4embeddedlinux-ci` library, you will need to run `yarn run build` for changes to be available in your current project.
>


> _Note:_
>
> When using a system node install on Linux, this can require sudo access.
> To avoid this, use a [node version manager](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm#using-a-node-version-manager-to-install-nodejs-and-npm) or [set a node prefix](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

### Using Git Credentials and Build Time Secrets

[AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) is the preferred method for adding and using secrets in your pipelines.

The service provides a structured means of access and avoids the pitfalls of putting secrets in environment variables, source repos, etc.

The following steps detaisl at a high level, how you can enable the use of AWS Secrets Manager in your pipelines:

- Create a _Secret_ in Secrets Manager and add your secret value.
- Grant access permissions to the CodeBuild pipeline project.
- Create a [Policy Statement](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_iam.PolicyStatement.html) which allows `secretsmanager:GetSecretValue` for your secret.
- Add this policy statement to the `buildPolicyAdditions` props for the `EmbeddedLinuxPipelineStack`. e.g.

  ```typescript
  import * as iam from "aws-cdk-lib/aws-iam";
  const projectPipeline = new EmbeddedLinuxCodePipelineStack(app, "MyPokyPipeline", {
    projectType: ProjectType.Poky,
    ecrRepository: <ecrRepository>,
    ecrRepositoryImageTag: <ecrRepositoryImageTag>,
    pipelineSourceBucket: <SourceBucket>,
    pipelineArtifactBucket: <ArtifactBucket>,
    pipelineOutputBucket: <OutputBucket>,
    vpc: <vpc>,
    encryptionKey: <encryptionKey>,
    buildPolicyAdditions: [
      iam.PolicyStatement.fromJson({
        Effect: "Allow",
        Action: "secretsmanager:GetSecretValue",
        Resource:
          "arn:aws:secretsmanager:us-west-2:123456789012:secret:my-secret-??????",
      }),
    ],
  });
  ```

- The secret can then be used in the CodeBuild Project by adding it to the BuildSpec.

  ```yaml
  env:
      secrets-manager:
          SECRET_VALUE: "<Secret ARN>"
  ```
See the [CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html) for more details.

### CVE Checking With Yocto

CVE checking is enabled in the reference implementations. Details on this can be found in the [Yocto documentation](https://docs.yoctoproject.org/4.0.13/singleindex.html#checking-for-vulnerabilities).

[Bask to the top](#aws4embeddedlinux-ci)

## Known issues

- The use of this CDK library is currently not supported in Windows environments (you can still use WSL).
- When using AWS Cloud9, a micro instance type will run out of memory.
- Deletion of stacks while a CodePipeline is running can lead to unexpected behaviours.
- The NXP-IMX pipeline will fail unless you adjust the build spec file and address the licence acceptance requirement.

[Bask to the top](#aws4embeddedlinux-ci)

## Security

See [SECURITY](SECURITY.md) for more information about reporting issues with this project.

[Bask to the top](#aws4embeddedlinux-ci)

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md) for more information.

[Bask to the top](#aws4embeddedlinux-ci)

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.

[Bask to the top](#aws4embeddedlinux-ci)
