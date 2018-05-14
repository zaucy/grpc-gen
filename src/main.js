const https = require("https");
const stream = require("stream");
const unzip = require("unzip");
const fs = require("fs-extra");
const path = require("path");
const colors = require("colors");
const yaml = require("js-yaml");
const chokidar = require("chokidar");
const {spawn} = require("child_process");
const {Bar} = require("cli-progress");

const {GrpcGenError, ConfigError} = require("./error");
const {getOuputAdapter, runDummyOutput} = require("./outputAdapter/");;
const {logVerbose} = require("./log");
const {argv} = require("./argv");

const DEFAULT_PROTOC_VERSION = "3.5.1";
const BIN_DIR = path.resolve(__dirname, "../bin");

const defaultConfigNames = [
	'.grpc-gen.json',
	'.grpc-gen.yaml',
	'.grpc-gen.yml',
	'.grpc-gen.js',
];

let config;
let configDir;
let watcher;
let lastWatchSrcs = [];

function spawnAsync(exec, args, options) {
	return new Promise((resolve, reject) => {
		let stderr = '';
		let stdout = '';
		logVerbose(colors.blue('[SPAWN]'), exec, ...args);
		let child = spawn(exec, args, options);

		if(child.stdout) {
			child.stdout.on('data', chunk => {
				stdout += chunk.toString();
				
				if(argv.verbose) {
					process.stdout.write(chunk);
				}
			});
		}

		if(child.stderr) {
			child.stderr.on('data', chunk => {
				stderr += chunk.toString();

				if(argv.verbose) {
					process.stderr.write(chunk);
				}
			});
		}

		child.on("exit", code => {
			if(code !== 0) {
				reject(stderr);
			} else {
				resolve(stdout);
			}
		});
	});
}

async function downloadProtoc(version) {
	const prefix = `https://github.com/google/protobuf/releases/download/`;
	let platform = '';
	let arch = '';

	switch(process.platform) {
		case 'darwin':
			platform = 'osx-';
			switch(process.arch) {
				case 'x64':
					platform += 'x86_64'; 
					break;
				case 'x32':
					platform += 'x86_32';
					break;
				default:
					throw new GrpcGenError(
						`Cannot download protoc for platform '${process.platform}' with ` +
						`arch ${process.arch}`
					);
			}
			break;
		case 'linux':
			platform = 'linux-';
			switch(process.arch) {
				case 'x64':
					platform += 'x86_64'; 
					break;
				case 'x32':
					platform += 'x86_32';
					break;
				case 'arm64':
					platform += 'aarch_64';
					break;
				default:
					throw new GrpcGenError(
						`Cannot download protoc for platform '${process.platform}' with ` +
						`arch ${process.arch}`
					);
			}
			break;
		case 'cygwin':
		case 'win32':
			platform = 'win32';
			break;
		default:
			throw new GrpcGenError(
				`Cannot download protoc for platform '${process.platform}'`
			);
	}

	const downloadUrl = prefix + `v${version}/protoc-${version}-${platform}.zip`;
	const extractPath = path.resolve(BIN_DIR, `protoc-${version}`)

	
	await fs.ensureDir(BIN_DIR);
	
	let zipPath = path.resolve(BIN_DIR, `protoc-${version}.zip`)
	let zipWriteStream = fs.createWriteStream(zipPath);

	logVerbose(`Downloading '${downloadUrl}' -> '${zipPath}'`);

	let bar = new Bar();
	bar.start(100, 0);

	return new Promise((resolve, reject) => {
		https.get(downloadUrl, res => {
			bar.update(1);
	
			https.get(res.headers.location, res => {
				bar.update(5);
				res.pipe(zipWriteStream).on('close', () => {
					bar.update(75);
					logVerbose(`Extracting '${zipPath}' -> '${extractPath}'`);
					let zipReadStream = fs.createReadStream(zipPath);
					zipReadStream.pipe(unzip.Extract({
						path: extractPath
					})).on("close", () => {
						bar.update(95);
						logVerbose(`Removing '${zipPath}'`);
						fs.remove(zipPath).then(() => {
							bar.update(100);
							bar.stop();
							resolve();
						});
					});
				});
			});
		});
	});

}

function findConfigPath() {

	if(argv.config) {
		return argv.config;
	}

	let cwd = process.cwd();

	return defaultConfigNames.find((configName) => {
		logVerbose(`Looking for config '${configName}'`);
		return fs.existsSync(path.resolve(cwd, configName));
	}) || null;
}

async function readConfig(configPath) {

	const errHandler = (err) => {
		if(err.code == 'ENOENT') {
			return Promise.reject(new ConfigError(
				`Cannot open config file '${err.path}'`
			));
		} else {
			return Promise.reject(err);
		}
	};

	let extname = path.extname(configPath);
	switch(extname) {
		case '.yml':
		case '.yaml':
			return yaml.safeLoad(await fs.readFile(configPath).catch(errHandler));
		case '.js':
			return require(configPath);
			case '.json':
			return await fs.readJson(configPath).catch(errHandler);
		default:
			throw new ConfigError(
				`Invalid config extension '${extname}'. ` +
				`Must be .json, .yml, .yaml, or .js`
			);
	}
}

async function main() {
	let configPath = findConfigPath();
	if(!configPath) {
		throw new ConfigError(`grpc-gen config file not found`);
	}

	configDir = path.dirname(configPath);

	logVerbose(`Using config '${configPath}'`);

	config = await readConfig(configPath);

	if(typeof config.output != "object" || Object.keys(config.output).length == 0) {
		throw new ConfigError('Config must specify at least 1 output');
	}

	if(!Array.isArray(config.srcs) || config.srcs.length == 0) {
		throw new ConfigError(
			'Config must specify at least 1 source proto file in srcs'
		);
	}

	if(config.srcs_dir) {

	} else {
		// Automatically determine srcs_dir
	}

	if(watcher) {

		watcher.unwatch(lastWatchSrcs);
		lastWatchSrcs = [];

		for(let src of config.srcs) {
			let srcAbs = path.resolve(configDir, config.srcs_dir, src);
			lastWatchSrcs.push(srcAbs);
		}

		watcher.add(lastWatchSrcs);
	}

	let protocVersion = DEFAULT_PROTOC_VERSION;
	if(config.protoc) {
		
		if(typeof config.protoc == "string") {
			protocVersion = config.protoc;
			logVerbose(`Found protoc version in config: ${protocVersion}`);
		} else
		if(typeof config.protoc == "object") {
			if(typeof config.protoc.version == "string") {
				protocVersion = config.protoc.version;
				logVerbose(`Found protoc version in config: ${protocVersion}`);
			} else {
				logVerbose(
					"Config property 'protoc' is an object but does not provide " +
					`version. Using default: ${protocVersion}`
				);
			}
		} else {
			logVerbose(
				"Config property 'protoc' provided, but is not an object nor a " +  
				"string. Ignoring."
			);
		}
	}

	const protoc = path.resolve(
		BIN_DIR,
		`protoc-${protocVersion}/bin/protoc`
		+ (process.platform == "win32" ? '.exe' : '')
	);

	if(!await fs.exists(protoc)) {
		logVerbose(
			`Could not find protoc. Downloading protoc ${protocVersion} ...`
		);
		await downloadProtoc(protocVersion);
	} else {
		logVerbose(
			`Found protoc. Using protoc ${protocVersion}`
		);
	}

	logVerbose(`protoc binary '${protoc}'`);

	let srcsDirAbs = path.resolve(configDir, config.srcs_dir);
	let outputAdapters = [];
	let adapterOptions = {
		protoc: protoc,
		protocVersion: protocVersion,
		srcs: config.srcs,
		srcs_dir: config.srcs_dir,
	};

	// Run the dummy plugin just to check for syntax errors.
	logVerbose("Running dummy plugin for syntax errors");
	await runDummyOutput(Object.assign({}, adapterOptions));

	for(let outName in config.output) {
		let outOpts = config.output[outName];
		let outDir = "";
		let outDirAbs = "";
		if(typeof outOpts == "string") {
			outDir = outOpts;
			outOpts = {};
		}

		outDirAbs = outDir;

		if(!path.isAbsolute(outDir)) {
			outDirAbs = path.resolve(configDir, outDir);
		}

		outDir = path.relative(srcsDirAbs, outDirAbs);

		logVerbose("Output directory:", outDirAbs);

		outDir = outDir.replace(/\\/g, '/');

		for(let src of config.srcs) {
			let srcDirname = path.join(
				path.dirname(src),
				path.basename(src) + ".grpc.pb.js"
			);

			await fs.ensureDir(path.resolve(outDirAbs, path.dirname(srcDirname)));
		}

		let adapter = getOuputAdapter(outName, Object.assign({}, adapterOptions, {
			outputPath: outDir,
			options: outOpts,
		}));

		outputAdapters.push(adapter);
	}

	await Promise.all(outputAdapters.map(a => a.run()));
}

function parseOutputError(err = '') {

	let errLines = err.split("\n");
	let retErrMsg = '';

	for(let errLine of errLines) {
		errLine = errLine.trim();

		let errorPattern = /(\S+):(\d+):(\d+):(.*)+$/gm;
		let errComponents = errorPattern.exec(errLine);
		if(!errComponents) {
			retErrMsg += errLine + '\n';
			continue;
		}
	
		let [fullErr, filename, line, column, error] = errComponents;
		
		retErrMsg += colors.red('[ERROR] ') + fullErr + '\n';
	}

	return retErrMsg;
}

async function doMain() {
	return main()
		.then(() => {
			console.log(colors.green("DONE"));
		})
		.catch(err => {

			if(typeof err == "string") {
				console.error(parseOutputError(err).trim());
			} else
			if(err instanceof GrpcGenError) {
				console.error(colors.red("[ERROR] ") + err.message);
			} else {
				console.error(err);
			}
		});
}

async function doMainWatch() {
	let waiting = false;
	let currentMainPromise = doMain().then(afterMain, afterMain);

	function afterMain() {
		currentMainPromise = null;
		if(waiting) {
			waiting = false;
			currentMainPromise = doMain().then(afterMain, afterMain);
		} else {
			console.log("Waiting for changes ...");
		}
	}
	
	watcher = chokidar.watch();

	if(argv.config) {
		watcher.add(argv.config);
	} else {
		watcher.add(defaultConfigNames);
	}

	watcher.on("change", async (e) => {
		if(!currentMainPromise) {
			currentMainPromise = doMain().then(afterMain, afterMain);
		} else {
			waiting = true;
		}
	});
}

if(argv.watch) {
	doMainWatch();
} else {
	doMain();
}
