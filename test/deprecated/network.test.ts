import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { PipelineNetworkStack } from "../../lib/deprecated/network";

describe("Pipeline Networking", () => {
  const props = {
    env: { account: "111111111111", region: "eu-central-1" },
  };

  test("Logs Have Retention Period", () => {
    const app = new cdk.App();
    const stack = new PipelineNetworkStack(app, "PipelineNetworkStack", props);
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    template.allResourcesProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 365,
    });
  });

  test("Snapshot", () => {
    const app = new cdk.App();
    const stack = new PipelineNetworkStack(app, "PipelineNetworkStack", props);
    const template = Template.fromStack(stack);
    expect(template).toMatchSnapshot();
  });
});
