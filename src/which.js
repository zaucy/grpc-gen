const path = require("path");
const fse = require("fs-extra");

const DEFAULT_DIR = path.resolve(__dirname, "..");
const BIN_EXTS = ['.exe', '.cmd', '.sh', ''];

exports.which = async (command, dir = DEFAULT_DIR) => {
	if(!await fse.exists(dir)) {
		throw Error(
			`Could not find '${command}'`
		);
	}

	const goNext = () => {
		let nextDir = path.resolve(dir, '..');
		if(nextDir == dir) {
			throw Error(
				`Could not find '${command}'`
			);
		}

		return exports.which(command, nextDir);
	};

	let binDir = path.resolve(dir, "node_modules/.bin");

	if(await fse.exists(binDir)) {
		let files = await fse.readdir(binDir);
		let commandPath = files.filter(file => {
			let fileExt = path.extname(file);
			let fileWithoutExt = path.basename(file, fileExt);

			if(!BIN_EXTS.includes(fileExt)) {
				return false;
			}

			if(fileWithoutExt == command) {
				return true;
			}
		});

		if(commandPath.length > 0) {
			commandPath = commandPath.sort((a,b) => a.length < b.length);
			return path.resolve(binDir, commandPath[0]);
		}

		return goNext();
	} else {
		return goNext();
	}
};
