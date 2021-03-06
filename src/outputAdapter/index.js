const {GrpcGenError, ConfigError} = require("../error");
const {GrpcGenDummyOuputAdapter} = require("./GrpcGenDummyOuputAdapter")
const {GrpcGenFallbackOutputAdapter} = require("./GrpcGenFallbackOutputAdapter");
const colors = require("colors");

function getOuputAdapter(outputName, options) {
  const adapterOptions = Object.assign(options, {
    outputName: outputName
  });

  let outputAdapterInstance;

  try {
    let {outputAdapter} = require(`./${outputName}/`);
    outputAdapterInstance = new outputAdapter(adapterOptions);
  } catch(err) {
    if(err.code == 'MODULE_NOT_FOUND') {
      outputAdapterInstance = new GrpcGenFallbackOutputAdapter(
        adapterOptions
      );
    } else {
      throw err;
    }
  }

  outputAdapterInstance.parseOptions(adapterOptions.options || {});

  return outputAdapterInstance;
}

async function runDummyOutput(options) {
  let adapterOptions = Object.assign({}, options, {
    outputName: 'dummy',
    pluginName: 'protoc-gen-dummy',
  });
  let dummyOutput = new GrpcGenDummyOuputAdapter(adapterOptions);
  dummyOutput.parseOptions(adapterOptions.options || {});

  await dummyOutput.run();

  return dummyOutput;
}

exports.getOuputAdapter = getOuputAdapter;
exports.runDummyOutput = runDummyOutput;
