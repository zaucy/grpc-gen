class GrpcGenError extends Error {};

class ConfigError extends GrpcGenError {
	constructor(msg) {
		super(msg);
	}
};

exports.GrpcGenError = GrpcGenError;
exports.ConfigError = ConfigError;
