## Reporting Security Issues

We take all security reports seriously.
When we receive such reports,
we will investigate and subsequently address
any potential vulnerabilities as quickly as possible.
If you discover a potential security issue in this project,
please notify AWS/Amazon Security via our
[vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/)
or directly via email to [AWS Security](mailto:aws-security@amazon.com).
Please do *not* create a public GitHub issue in this project.

## Use of AWS Secrets Manager
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
