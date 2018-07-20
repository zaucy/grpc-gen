const path = require("path");
const {GrpcGenOutputAdapter} = require("../GrpcGenOutputAdapter");

class GrpcGenGrpcWebOutputAdapter extends GrpcGenOutputAdapter {
  parseOptions(options) {
    this._options = options || {};
  }
  
  async run() {

    let protocExecs = [];
    const mode = this.mode;
    const outputPath = this.outputPath.replace(/\\/g, '/');
    
    for(let src of this.srcs) {
      let options = Object.assign({}, this._options);
      let out = path.join(
        path.dirname(src),
        path.basename(src, '.proto') + "_grpc_pb.js"
      );

      if(options.out) {
        out = options.out;
        delete options.out;
      } else {
        out = out.replace(/\\/g, '/');
      }

      let optionsStr = Object.keys(this._options).map(key => {
        return `${key}=${this._options[key]}`
      }).join(',');

      protocExecs.push(this.execProtoc(`out=${out},${optionsStr}:${outputPath}`, [src]));
    }

    return Promise.all(protocExecs);
  }
};

exports.GrpcGenGrpcWebOutputAdapter = GrpcGenGrpcWebOutputAdapter;
