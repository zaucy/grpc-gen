const argv = require("yargs")
	.option('poll', {
		describe: "Enable watch in poll mode"
	})
	.option('watch', {
		alias: ['w'],
		describe: "Watch for file changes"
	})
	.option('config', {
		describe: "Override default config file lookup with explicit path",
		type: "string"
	})
	.option('verbose', {
		alias: ['v'],
		describe: "Verbose logging. Useful for debugging.",
		type: "boolean"
	})
	.completion()
	.argv;

exports.argv = argv;
