const https = require("https");
const stream = require("stream");
const unzip = require("unzipper");
const fs = require("fs-extra");
const path = require("path");
const colors = require("colors");
const yaml = require("js-yaml");
const chokidar = require("chokidar");
const { spawn } = require("child_process");
const { Bar } = require("cli-progress");
const download = require("download");

const { GrpcGenError, ConfigError } = require("./error");
const { getOuputAdapter, runDummyOutput } = require("./outputAdapter/");;
const { logVerbose } = require("./log");
const { argv } = require("./argv");

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

		if (child.stdout) {
			child.stdout.on('data', chunk => {
				stdout += chunk.toString();

				if (argv.verbose) {
					process.stdout.write(chunk);
				}
			});
		}

		if (child.stderr) {
			child.stderr.on('data', chunk => {
				stderr += chunk.toString();

				if (argv.verbose) {
					process.stderr.write(chunk);
				}
			});
		}

		child.on("exit", code => {
			if (code !== 0) {
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

	switch (process.platform) {
		case 'darwin':
			platform = 'osx-';
			switch (process.arch) {
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
			switch (process.arch) {
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
	await fs.remove(zipPath);

	logVerbose(`Downloading '${downloadUrl}' -> '${zipPath}'`);

	let bar = new Bar();
	bar.start(100, 0);

	await download(downloadUrl, extractPath, {
		followRedirect: true,
		extract: true,
	});

	bar.stop();
}

function findConfigPath() {

	if (argv.config) {
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
		if (err.code == 'ENOENT') {
			return Promise.reject(new ConfigError(
				`Cannot open config file '${err.path}'`
			));
		} else {
			return Promise.reject(err);
		}
	};

	let extname = path.extname(configPath);
	switch (extname) {
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
	let includes = [];
	let configPath = findConfigPath();
	if (!configPath) {
		return Promise.reject(new ConfigError(
			`grpc-gen config file not found`
		));
	}

	configDir = path.dirname(configPath);

	logVerbose(`Using config '${configPath}'`);

	config = await readConfig(configPath);

	if (typeof config.output != "object") {
		return Promise(new ConfigError(
			'Config must specify output as array or object'
		));
	}

	if (Array.isArray(config.output)) {
		if (config.output.length == 0) {
			return Promise.reject(new ConfigError(
				'Config must specify at least 1 output'
			));
		}
	} else
		if (Object.keys(config.output).length == 0) {
			if (config.output.length == 0) {
				return Promise.reject(new ConfigError(
					'Config must specify at least 1 output'
				));
			}
		}

	if (!Array.isArray(config.srcs)) {
		return Promise.reject(new ConfigError(
			'Config must specify srcs as array'
		));
	}

	if (config.srcs.length == 0) {
		return Promise.reject(new ConfigError(
			'Config must specify at least 1 source proto file in srcs'
		));
	}

	if (typeof config.srcs_dir !== "string") {
		return Promise.reject(new ConfigError(
			'Config must specify srcs_dir'
		));
	}

	if (Array.isArray(config.include)) {
		includes = config.include.filter(inc => typeof inc === 'string');
	}

	if (watcher) {

		watcher.unwatch(lastWatchSrcs);
		lastWatchSrcs = [];

		for (let src of config.srcs) {
			let srcAbs = path.resolve(configDir, config.srcs_dir, src);
			lastWatchSrcs.push(srcAbs);
		}

		watcher.add(lastWatchSrcs);
	}

	let protocVersion = DEFAULT_PROTOC_VERSION;
	if (config.protoc) {

		if (typeof config.protoc == "string") {
			protocVersion = config.protoc;
			logVerbose(`Found protoc version in config: ${protocVersion}`);
		} else
			if (typeof config.protoc == "object") {
				if (typeof config.protoc.version == "string") {
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

	let srcsDirAbs = path.resolve(configDir, config.srcs_dir);
	let outputs = [];

	if (Array.isArray(config.output)) {
		for (const outputItem of config.output) {
			const outputItemType = typeof outputItem;
			if (Array.isArray(outputItem)) {
				return Promise.reject(new ConfigError(
					'Output (array) item expected to be an object. Got array.'
				));
			} else
				if (outputItemType != "object") {
					return Promise.reject(new ConfigError(
						'Output (array) item expected to be an object. Got ' + outputItemType
					));
				}

			const outputItemKeys = Object.keys(outputItem);
			if (outputItemKeys.length != 1) {
				return Promise.reject(new ConfigError(
					'Output (array) item expected to be an object with 1 key. Got ' +
					`${outputItemKeys.length} [${outputItemKeys.join(', ')}]`
				));
			}

			const outName = outputItemKeys[0];
			const outOpts = outputItem[outName];

			outputs.push({ outName, outOpts });
		}
	} else {
		for (const outName in config.output) {
			const outOpts = config.output[outName];
			outputs.push({ outName, outOpts });
		}
	}

	logVerbose(`${outputs.length} outputs`);

	const protoc = path.resolve(
		BIN_DIR,
		`protoc-${protocVersion}/bin/protoc`
		+ (process.platform == "win32" ? '.exe' : '')
	);

	if (!await fs.exists(protoc)) {
		logVerbose(
			`Could not find protoc. Downloading protoc ${protocVersion} ...`
		);
		await downloadProtoc(protocVersion);
		await fs.chmod(protoc, '755');
	} else {
		logVerbose(
			`Found protoc. Using protoc ${protocVersion}`
		);
	}


	let outputAdapters = [];
	let adapterOptions = {
		protoc: protoc,
		protocVersion: protocVersion,
		srcs: config.srcs,
		srcs_dir: srcsDirAbs,
		includes: includes.filter(inc => typeof inc === 'string').map(inc => {
			if (path.isAbsolute(inc)) return inc;
			else return path.resolve(configDir, inc);
		}),
	};

	logVerbose(`protoc binary '${protoc}'`);

	// Run the dummy plugin just to check for syntax errors.
	logVerbose("Running dummy plugin for syntax errors");
	await runDummyOutput(Object.assign({}, adapterOptions));

	for (let { outName, outOpts } of outputs) {
		let custom = false;
		let pluginName = `protoc-gen-${outName}`;
		let outDir = "";
		let outDirAbs = "";
		if (typeof outOpts == "string") {
			outDir = outOpts;
			outOpts = {};
		} else
			if (Array.isArray(outOpts)) {
				return Promise.reject(new ConfigError(
					"Array not supported for output options"
				));
			} else
				if (typeof outOpts == "object") {
					outDir = outOpts.dir;
					custom = outOpts.custom || false;
					if (outOpts.plugin) {
						pluginName = outOpts.plugin;

						if (pluginName.search(/\.|\/|\\/) > -1) {
							return Promise.reject(new ConfigError(
								`Invalid plugin '${pluginName}' cannot contain dots or slashes`
							));
						}
					}
					outOpts = outOpts.options || {};
				}

		if (!outDir) {
			return Promise.reject(new ConfigError(
				`Missing output dir for '${outName}'`
			));
		}

		outDirAbs = outDir;

		if (!path.isAbsolute(outDir)) {
			outDirAbs = path.resolve(configDir, outDir);
		}

		outDir = path.relative(srcsDirAbs, outDirAbs);

		logVerbose("Output directory:", outDirAbs);

		outDir = outDir.replace(/\\/g, '/');

		for (let src of config.srcs) {
			let srcDirname = path.join(
				path.dirname(src),
				path.basename(src) + ".grpc.pb.js"
			);

			await fs.ensureDir(path.resolve(outDirAbs, path.dirname(srcDirname)));
		}

		let adapter = getOuputAdapter(outName, Object.assign({}, adapterOptions, {
			outputPath: outDir,
			options: outOpts,
			pluginName: pluginName,
			custom: custom,
		}));

		outputAdapters.push(adapter);
	}

	await Promise.all(outputAdapters.map(a => a.run()));
}

function parseOutputError(err = '') {

	let errLines = err.split("\n");
	let retErrMsg = '';

	for (let errLine of errLines) {
		errLine = errLine.trim();

		let errorPattern = /(\S+):(\d+):(\d+):(.*)+$/gm;
		let errComponents = errorPattern.exec(errLine);
		if (!errComponents) {
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

			if (typeof err == "string") {
				console.error(parseOutputError(err).trim());
			} else
				if (err instanceof GrpcGenError) {
					console.error(colors.red("[ERROR] ") + err.message);
				} else {
					console.error(err);
				}

			return Promise.reject(err);
		});
}

async function doMainWatch() {
	let waiting = false;
	let currentMainPromise = doMain().then(afterMain, afterMain);

	function afterMain() {
		currentMainPromise = null;
		if (waiting) {
			waiting = false;
			currentMainPromise = doMain().then(afterMain, afterMain);
		} else {
			console.log("Waiting for changes ...");
		}
	}

	let watcherOptions = {};

	if (argv.poll && !isNaN(argv.poll)) {
		watcherOptions.usePolling = true;
		if (argv.poll === true) {
			watcherOptions.interval = 600;
		} else {
			watcherOptions.interval = argv.poll || 600;
		}

		logVerbose(
			'Watching using polling at',
			watcherOptions.interval + 'ms',
			'intervals'
		);
	}

	watcher = chokidar.watch([], watcherOptions);

	if (argv.config) {
		watcher.add(argv.config);
	} else {
		watcher.add(defaultConfigNames);
	}

	watcher.on("change", async (e) => {
		if (!currentMainPromise) {
			currentMainPromise = doMain().then(afterMain, afterMain);
		} else {
			waiting = true;
		}
	});
}

if (argv.watch) {
	doMainWatch();
} else {
	doMain().catch(() => {
		process.exit(1);
	});
}
