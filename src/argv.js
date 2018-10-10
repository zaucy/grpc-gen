const argv = require("yargs")
	.option('poll', {
		number: true,
		describe: "Enable watch in poll mode"
	})
	.option('watch', {
		alias: ['w'],
		boolean: true,
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
