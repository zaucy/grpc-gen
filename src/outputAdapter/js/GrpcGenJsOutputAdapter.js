const {GrpcGenOutputAdapter} = require("../GrpcGenOutputAdapter");

class GrpcGenJsOutputAdapter extends GrpcGenOutputAdapter {

  getGrpcPlugin() {
    return {
      name: 'grpc_tools_node_protoc_plugin'
    };
  }
  
  parseOptions(options) {
    this.import_style = options.import_style || "commonjs";
  }

  async run() {
    const outputPath = this.outputPath;
    const importStyle = this.import_style;

    return this.execProtoc(`import_style=${importStyle},binary:${outputPath}`);
  }
};

exports.GrpcGenJsOutputAdapter = GrpcGenJsOutputAdapter;
