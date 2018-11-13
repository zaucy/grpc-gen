class ProtocGenError extends Error {};

class ConfigError extends ProtocGenError {
	constructor(msg) {
		super(msg);
	}
};

exports.ProtocGenError = ProtocGenError;
exports.ConfigError = ConfigError;
