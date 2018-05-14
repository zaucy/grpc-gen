const path = require("path");
const {GrpcGenOutputAdapter} = require("../GrpcGenOutputAdapter");

class GrpcGenGrpcWebOutputAdapter extends GrpcGenOutputAdapter {
  parseOptions(options) {
    this.mode = options.mode || "grpcweb";
  }
  
  async run() {

    let protocExecs = [];
    const mode = this.mode;
    const outputPath = this.outputPath.replace(/\\/g, '/');

    for(let src of this.srcs) {
      let out = path.join(
        path.dirname(src),
        path.basename(src) + ".grpc.pb.js"
      );

      out = out.replace(/\\/g, '/');

      protocExecs.push(this.execProtoc(`out=${out},mode=${mode}:${outputPath}`, [src]));
    }

    return Promise.all(protocExecs);
  }
};

exports.GrpcGenGrpcWebOutputAdapter = GrpcGenGrpcWebOutputAdapter;
