const fs = require('fs');
const path = require('path');

const DUMMY_PLUGIN_PATH = path.resolve(
  __dirname, "src/bin/protoc-gen-dummy" +
  (process.platform == "win32" ? '.cmd' : '.sh')
).replace(/\\/g, '/');

fs.chmodSync(DUMMY_PLUGIN_PATH, '0755');
