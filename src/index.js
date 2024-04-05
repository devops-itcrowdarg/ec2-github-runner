const aws = require('./aws');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');

function setOutput(labels, ec2InstanceIds) {
  core.setOutput('labels', labels);
  core.setOutput('ec2-instance-ids', ec2InstanceIds);
}

async function start() {
  const labels = [];
  const ec2InstanceIds = [];
  for (let i = 0; i < config.input.desiredRunners; i++) {
    const label = config.generateUniqueLabel();
    const githubRegistrationToken = await gh.getRegistrationToken();
    const ec2InstanceId = await aws.startEc2Instance(label, githubRegistrationToken);
    
    await aws.waitForInstanceRunning(ec2InstanceId);
    await gh.waitForRunnerRegistered(label);
    labels[i] = label;
    ec2InstanceIds[i] = ec2InstanceId
  }
  setOutput(labels, ec2InstanceIds);
}

async function stop() {
  await aws.terminateEc2Instance();
  await gh.removeRunner();
}

(async function () {
  try {
    config.input.mode === 'start' ? await start() : await stop();
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();
