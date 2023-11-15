## aws4embeddedlinux-ci

This [cdk](https://github.com/aws/aws-cdk) IaC library help you to deploy AWS cloud infrastructure to allow embedded Linux builds for your project.

### Architecture
![architecture overview](architecture.drawio.svg "Architecture")

### Quickstart
Use the [examples](https://github.com/aws4embeddedlinux/aws4embeddedlinux-ci-examples) in our examples repo.

### Development Setup
You can use [`npm link`](https://docs.npmjs.com/cli/v10/commands/npm-link) to develop with a local copy of this repo.

#### In this library repo:
```bash
$ npm link
$ cd your-project
```

#### In your-project folder:
```bash
$ npm link aws4embeddedlinux-ci
```

This will link through the system `node_modules` install. When using a system node install on Linux, this can require sudo access. To avoid this, use a [node version manager](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm#using-a-node-version-manager-to-install-nodejs-and-npm) or [set a node prefix](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).


## Security

See [SECURITY](SECURITY.md) for more information about reporting issues with this project.

### Git Credentials and Build Time Secrets
If you need to access secrets like Git credentials in your CodeBuild Project you should access them via the AWS Secrets Manager, instead of adding them as plain text.

1. In console, go to AWS Secretes Manager and create a secret
    - select other type of secret
    - after successful generation go to secret details and copy Secret ARN
2. Go to AWS CodeCommit and modify the build.buildspec.yml of your project.
    - add this to access the secret stored in AWS Secrets Manager, replace \<Secret ARN> by the copied ARN in step 1.

        ```
        env:
          secrets-manager:
            SECRET_VALUE: "<Secret ARN>"
        phases:
          build:
            commands:
              - echo $SECRET_VALUE
        ```

    - run the build, it will fail AccessDeniedException and show you which IAM user you have to give permissions in the next step

3. Add IAM permissions to allow CodeBuild access the secret

    - find role, add policy, replace \<Secret ARN> by the copied ARN in step 1.
        ```
            {
            "Version": "2012-10-17",
            "Statement": [
            {
            "Effect": "Allow",
            "Action": "secretsmanager:GetSecretValue",
            "Resource": "<Secret ARN>"
            }
            ]
            }
        ```

### CVE Checking With Yocto

CVE checking is enabled in the reference implementations. Details for this can be found in the [yocto documentation](https://docs.yoctoproject.org/4.0.13/singleindex.html#checking-for-vulnerabilities).

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md) for more information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
