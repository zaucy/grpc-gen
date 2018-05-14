const {argv} = require("./argv");
const colors = require("colors");

function logVerbose(...args) {
	if(argv.verbose) {
		console.log(colors.grey("[VERBOSE]"), ...args);
	}
}

exports.logVerbose = logVerbose;
