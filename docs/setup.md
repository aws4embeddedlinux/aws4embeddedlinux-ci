# Setting Up

see an example how to use this lib in [`examples`](../../examples/docs/setup.md)


## Setting Up A New Project

1. Create a CDK project. More details can be found in the [CDK Getting Started Documentation](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html).
```
mkdir my-project
cd my-project
cdk init app --language typescript
```
2. Add the cdk library with `npm install aws4embeddedlinux/aws4embeddedlinux-ci`
3. Create your application using the library. Refer to the [Library Documentation](TODO) and the [Examples](github.com/aws4embeddedlinux/aws4embeddedlinux-ci-examples) for more details.
4. Deploy your application using `cdk deploy`.
5. After the application is deployed, the 'Build Image' Pipeline needs to be run. This will create an Ubuntu based container for building Yocto. This container is used by the other pipelines. If the other pipelines are run before this container is created and pushed to [ECR](https://aws.amazon.com/ecr/), they will fail. This Build Image Pipeline will run weekly by default to keep this container patched.
6. Now the application pipeline is able to be run. This will push contents of the Yocto deploy directory into S3.

## Examples

### A Simple Poky Based Pipeline

TODO...

### A Poky Based EC2 AMI Pipeline

Yocto can be used to create an EC2 AMI. This example demonstrates using this library to create a pipeline which builds an AMI and registers it in your account.

TODO...

### Using pre-build, proprietary artifacts in a Pipeline

This example is based on this [work](https://elinux.org/R-Car/Boards/Yocto-Gen3/v5.9.0) to build an image for Renesas R-Car-H3 Starter Kit Premier (unofficial name - H3ULCB) board including the proprietary graphics and multimedia drivers from Renesas.

You need to download Multimedia and Graphics library and related Linux drivers, please from the following link (registration necessary):
https://www.renesas.com/us/en/application/automotive/r-car-h3-m3-h2-m2-e2-documents-software

#### Download two files:

R-Car_Gen3_Series_Evaluation_Software_Package_for_Linux-20220121.zip
R-Car_Gen3_Series_Evaluation_Software_Package_of_Linux_Drivers-20220121.zip

Graphic drivers are required for Wayland. Multimedia drivers are optional.

#### Steps to build the image

Create a folder named `proprietary` in the root of the source repo. Put those two downloaded files into this folder. After you did deploy the build pipeline and uncomment the `#TODO` in the build.sh file.

Now a build should automatically start, succeed and you will get an image containing the proprietary graphics and multimedia drivers.
