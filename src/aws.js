const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

// User data scripts are run as the root user
function buildUserDataScript(githubRegistrationToken, label) {
  if (config.input.runnerHomeDir) {
    // If runner home directory is specified, we expect the actions-runner software (and dependencies)
    // to be pre-installed in the AMI, so we simply cd into that directory and then start the runner
    return [
      '#!/bin/bash',
      `cd "${config.input.runnerHomeDir}"`,
      `echo "${config.input.preRunnerScript}" > pre-runner-script.sh`,
      'source pre-runner-script.sh',
      'export RUNNER_ALLOW_RUNASROOT=1',
      `./config.sh --url https://github.com/${config.getGitHubApiRepoPath()} --token ${githubRegistrationToken} --labels ${label},worker`,
      './run.sh',
    ];
  } else {
    return [
      '#!/bin/bash',
      'mkdir actions-runner && cd actions-runner',
      `echo "${config.input.preRunnerScript}" > pre-runner-script.sh`,
      'source pre-runner-script.sh',
      'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
      `curl -O -L https://github.com/actions/runner/releases/download/v${config.input.runnerVersion}/actions-runner-linux-$RUNNER_ARCH-${config.input.runnerVersion}.tar.gz`,
      `tar xzf ./actions-runner-linux-$RUNNER_ARCH-${config.input.runnerVersion}.tar.gz`,
      'export RUNNER_ALLOW_RUNASROOT=1',
      `./config.sh --url https://github.com/${config.getGitHubApiRepoPath()} --token ${githubRegistrationToken} --labels ${label},worker`,
      './run.sh',
    ];
  }
}

async function startEc2Instance(label, githubRegistrationToken) {
  const ec2 = new AWS.EC2();

  const userData = buildUserDataScript(githubRegistrationToken, label);

  const params = {
    ImageId: config.input.ec2ImageId,
    InstanceType: config.input.ec2InstanceType,
    MinCount: 1,
    MaxCount: 1,
    UserData: Buffer.from(userData.join('\n')).toString('base64'),
    SubnetId: config.input.subnetId,
    SecurityGroupIds: [config.input.securityGroupId],
    IamInstanceProfile: { Name: config.input.iamRoleName },
    TagSpecifications: config.tagSpecifications,
    BlockDeviceMappings: [
      {
        DeviceName: "/dev/sda1", 
        Ebs: {
          VolumeSize: 30
        }
      }, 
      {
        DeviceName: "/dev/sdb",
        VirtualName: "ephemeral0"
      },
      {
        DeviceName: "/dev/sdc", 
        VirtualName: "ephemeral1"
      }
    ], 
  };

  // Add KeyName attribute if it is not empty
  if (config.input.keyName) {
    params.KeyName = config.input.keyName;
  }

  try {
    const result = await ec2.runInstances(params).promise();
    const ec2InstanceId = result.Instances[0].InstanceId;
    core.info(`AWS EC2 instance ${ec2InstanceId} is started`);
    return ec2InstanceId;
  } catch (error) {
    core.error('AWS EC2 instance starting error');
    throw error;
  }
}

async function terminateEc2Instance() {
    const instanceIds = JSON.parse(config.input.ec2InstanceIds);
    const ec2 = new AWS.EC2();

    const params = {
      InstanceIds: instanceIds,
    };

    try {
      await ec2.terminateInstances(params).promise();
      core.info(`AWS EC2 instance ${config.input.ec2InstanceIds} is terminated`);
      return;
    } catch (error) {
      core.error(`AWS EC2 instance ${config.input.ec2InstanceIds} termination error`);
      throw error;
    }
}

async function waitForInstanceRunning(ec2InstanceId) {
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: [ec2InstanceId],
  };

  try {
    await ec2.waitFor('instanceRunning', params).promise();
    core.info(`AWS EC2 instance ${ec2InstanceId} is up and running`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instance ${ec2InstanceId} initialization error`);
    throw error;
  }
}

module.exports = {
  startEc2Instance,
  terminateEc2Instance,
  waitForInstanceRunning,
};
