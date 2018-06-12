const {GrpcGenOutputAdapter} = require("./GrpcGenOutputAdapter");

class GrpcGenFallbackOutputAdapter extends GrpcGenOutputAdapter {
  parseOptions(options) {
    this.options = options;
  }

  async run() {
    const outputPath = this.outputPath;
    const options = this.options;

    let optionsStr = "";

    if(Object.keys(options).length > 0) {

      for(const optionName in options) {
        const optionValue = options[optionName];
        optionsStr += `${optionName}=${optionValue},`;
      }

      if(optionsStr[optionsStr.length-1] == ',') {
        optionsStr = optionsStr.substr(0, optionsStr.length-1);
      }

      optionsStr += ':' + outputPath;
    } else {
      optionsStr = outputPath;
    }

    return this.execProtoc(optionsStr);
  }

};

exports.GrpcGenFallbackOutputAdapter = GrpcGenFallbackOutputAdapter;
