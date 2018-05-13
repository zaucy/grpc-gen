const https = require("https");
const stream = require("stream");
const unzip = require("unzip");
const fs = require("fs-extra");
const path = require("path");
const colors = require("colors");
const yaml = require("js-yaml");
const {spawn} = require("child_process");
const {Bar} = require("cli-progress");


const DEFAULT_PROTOC_VERSION = "3.5.1";
const BIN_DIR = path.resolve(__dirname, "bin");
const BUILT_IN_OUTPUTS = [
	"cpp",
	"csharp",
	"java",
	"javanano",
	"objc",
	"php",
	"python",
	"ruby",
];

const argv = require("yargs")
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

class GrpcGenError extends Error {};

class ConfigError extends GrpcGenError {
	constructor(msg) {
		super(msg);
	}
};

function logVerbose(...args) {
	if(argv.verbose) {
		console.log(colors.grey("[VERBOSE]"), ...args);
	}
}

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
	const configNames = [
		'.grpc-gen.json',
		'.grpc-gen.yaml',
		'.grpc-gen.yml',
		'.grpc-gen.js',
	];

	return configNames.find((configName) => {
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

	logVerbose(`Using config '${configPath}'`);

	let config = await readConfig(configPath);

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

	let protocArgs = [];

	for(let outName in config.output) {
		let outOpts = config.output[outName];
		let outDir = "";
		if(typeof outOpts == "string") {
			outDir = outOpts;
		}

		protocArgs.push(`--${outName}_out=${outDir}`);
	}

	for(let src of config.srcs) {
		protocArgs.push(src);
	}

	await spawnAsync(protoc, protocArgs);
}

main()
	.then(() => {
		console.log(colors.green("DONE"));
	})
	.catch(err => {
		if(err instanceof GrpcGenError) {
			console.error(colors.red("[ERROR] ") + err.message);
		} else {
			console.error(err);
		}
	});
