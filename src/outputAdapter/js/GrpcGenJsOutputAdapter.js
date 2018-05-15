const {ConfigError} = require("../../error");
const {GrpcGenOutputAdapter} = require("../GrpcGenOutputAdapter");

const IMPORT_STYLES = [
  "closure",
  "commonjs",
];

class GrpcGenJsOutputAdapter extends GrpcGenOutputAdapter {

  parseOptions(options) {
    this.import_style = options.import_style || "";
    this.binary = options.binary || false;
    this.library = options.library || "";

    if(this.import_style && !IMPORT_STYLES.includes(this.import_style)) {
      throw new ConfigError(
        `[js] unknown import_style '${this.import_style}' may be one of the ` +
        `following: ` + IMPORT_STYLES.join(', ')
      );
    }
  }

  async run() {
    const outputPath = this.outputPath;
    const importStyle = this.import_style;
    const binary = this.binary;
    const library = this.library;

    let opts = [];

    if(importStyle) {
      opts.push(`import_style=${importStyle}`);
    }

    if(binary) {
      opts.push('binary');
    }

    if(library) {
      opts.push(`library=${library}`);
    }

    opts = opts.join(',');

    if(opts) {
      opts += ':';
    }

    opts += outputPath;

    return this.execProtoc(opts);
  }
};

exports.GrpcGenJsOutputAdapter = GrpcGenJsOutputAdapter;
