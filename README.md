# aws4embeddedlinux-ci

This [cdk](https://github.com/aws/aws-cdk) IaC library helps you to deploy AWS cloud infrastructure to allow embedded Linux builds for your project.

## Architecture
![architecture overview](images/architecture.svg "Architecture")

## API documentation
[API documentation](https://aws4embeddedlinux.github.io/aws4embeddedlinux-ci/) generated by `npm run doc`

# Setting Up

## Quickstart
Use the [examples](https://github.com/aws4embeddedlinux/aws4embeddedlinux-ci-examples) in our examples repo.


## Setting Up A New Project

1. Create a CDK project. More details can be found in the [CDK Getting Started Documentation](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html).
   ```
   mkdir my-project
   cd my-project
   cdk init app --language typescript
   ```
2. Add the cdk library with `npm install aws4embeddedlinux/aws4embeddedlinux-ci`.
3. Create your application using the library. Refer to the [API Documentation](https://aws4embeddedlinux.github.io/aws4embeddedlinux-ci)
   and the [Examples](github.com/aws4embeddedlinux/aws4embeddedlinux-ci-examples) for more details.
4. Deploy your application using `cdk deploy`.
5. After the application is deployed, the 'Build Image' Pipeline needs to be run. This will create an Ubuntu based container for
   building Yocto. This container is used by the other pipelines. If the other pipelines are run before this container is created
   and pushed to [ECR](https://aws.amazon.com/ecr/), they will fail. This Build Image Pipeline will run weekly by default to keep
   this container patched.
6. Now the application pipeline can be run. This will push the contents of the Yocto deploy directory into S3.

## Development Setup
You can use [`npm link`](https://docs.npmjs.com/cli/v10/commands/npm-link) to develop with a local copy of this repo.

### In this library repo:
```bash
npm install
```

### In your-project folder:
```bash
npm install
npm link ../aws4embeddedlinux-ci
```

This will link through the system `node_modules` install. When using a system node install on Linux, this can require sudo access. To avoid this, use
a [node version manager](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm#using-a-node-version-manager-to-install-nodejs-and-npm)
or [set a node prefix](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

## Known issues
- Windows is currently not supported
- When using AWS Cloud9 a micro instance type will run out of memory
- Deletion of stacks while a CodePipeline is running this can lead to unexpected failures


## Security

See [SECURITY](SECURITY.md) for more information about reporting issues with this project.

### Git Credentials and Build Time Secrets
[AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) is the preferred method of adding secrets
to your pipeline. This service provides a structured means of access and avoids the pitfalls of putting secrets in environment variables,
source repos, etc.

1. Create a _Secret_ in Secrets Manager and add your secret value.
1. Grant access permissions to the CodeBuild pipeline project.
   1. Find the IAM role for the CodeBuild Project in the CodeBuild console page under the "Build Details". This is also called the "Service Role".
   1. In the IAM console page, add a new policy, replacing \<Secret ARN\> with the ARN of the secret created.
      ```json
      {
          "Version": "2012-10-17",
          "Statement": [ {
              "Effect": "Allow",
              "Action": "secretsmanager:GetSecretValue",
              "Resource": "<Secret ARN>"
          } ]
      }
      ```

The secret can then be used in the CodeBuild Project by adding it to the BuildSpec. See
the [CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html) for more details.
```yaml
env:
    secrets-manager:
        SECRET_VALUE: "<Secret ARN>"
```

### CVE Checking With Yocto

CVE checking is enabled in the reference implementations. Details on this can be found in
the [yocto documentation](https://docs.yoctoproject.org/4.0.13/singleindex.html#checking-for-vulnerabilities).

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md) for more information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
