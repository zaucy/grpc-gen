const path = require("path");
const {ProtocGenOutputAdapter} = require("./ProtocGenOutputAdapter");

const DUMMY_PLUGIN_PATH = path.resolve(
  __dirname, "../bin/protoc-gen-dummy" +
  (process.platform == "win32" ? '.cmd' : '.sh')
).replace(/\\/g, '/');

class ProtocGenDummyOuputAdapter extends ProtocGenOutputAdapter {
  parseOptions(options) {
    this.options = options;
  }

  async run() {
    return this.execProtoc(__dirname, [].concat(
      `--plugin=protoc-gen-dummy=${DUMMY_PLUGIN_PATH}`,
      this.srcs
    ));
  }

};

exports.ProtocGenDummyOuputAdapter = ProtocGenDummyOuputAdapter;
