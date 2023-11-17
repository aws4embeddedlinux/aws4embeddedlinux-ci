# Setting Up

see an example how to use this lib in [`examples`](../../examples/docs/setup.md)


## Setting Up A New Project

1. Create a CDK project. More details can be found in the [CDK Getting Started Documentation](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html).
```
mkdir my-project
cd my-project
cdk init app --language typescript
```
1. Add the cdk library with `npm install aws4embeddedlinux/aws4embeddedlinux-ci`
1. Create your application using the library. Refer to the [Library Documentation](TODO) and the [Examples](github.com/aws4embeddedlinux/aws4embeddedlinux-ci-examples) for more details.
1. Deploy your application using `cdk deploy`.


## Examples

### A Simple Poky Based Pipeline

TODO...

### A Poky Based EC2 AMI Pipeline

Yocto can be used to create an EC2 AMI. This example demonstrates using this library to create a pipeline which builds an AMI and registers it in your account.

TODO...

### Using A Processor SDK In A Pipeline

TODO... (Renesas)
