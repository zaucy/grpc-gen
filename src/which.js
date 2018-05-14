const {GrpcGenError} = require("./error");
const path = require("path");
const fs = require("fs-extra");
const which = require("which");

const DEFAULT_DIR = path.resolve(__dirname, "..");
const BIN_EXTS = process.platform == 'win32' ? ['.exe', '.cmd'] : ['.sh', ''];

const npmBinWhich = async (command, dir = DEFAULT_DIR) => {

	if(!await fs.exists(dir)) {
		return Promise.reject(new GrpcGenError(
			`Could not find '${command}' in npm bin paths`
		));
	}

	const goNext = async () => {
		let nextDir = path.resolve(dir, '..');

		if(nextDir == dir) {
			return Promise.reject(new GrpcGenError(
				`Could not find '${command}' in npm bin paths`
			));
		}

		return npmBinWhich(command, nextDir);
	};

	let binDir = path.resolve(dir, "node_modules/.bin");

	if(await fs.exists(binDir)) {
		let files = await fs.readdir(binDir);
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

exports.which = async (command) => {

	// Check path
	let pathWhich = await new Promise(resolve => {
		which(command, (err, commandPath) => {
			if(err) {
				resolve(null);
			} else {
				resolve(commandPath);
			}
		});
	});

	if(pathWhich) {
		return pathWhich;
	}

	return npmBinWhich(command).catch(() => {
		return Promise.reject(new GrpcGenError(
			`Could not find '${command}' in your PATH or npm bin paths`
		));
	});
}
