const {spawn} = require("child_process");
const colors = require("colors");
const {argv} = require("../argv");
const {which} = require("../which");
const {GrpcGenError} = require("../error");

const BUILT_IN_OUTPUTS = [
	"cpp",
	"csharp",
	"java",
	"javanano",
	"objc",
	"php",
	"python",
	"ruby",
	"js",

	// grpc-gen related
	"dummy",
];

function spawnAsync(exec, args, options) {
	return new Promise((resolve, reject) => {
		let stderr = '';
		let stdout = '';
		if(argv.verbose) {
			console.log(colors.blue('[SPAWN]'), exec, ...args);
		}
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

				// if(argv.verbose) {
				// 	process.stderr.write(chunk);
				// }
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

class GrpcGenOutputAdapter {

	constructor(options) {
		this.additions = [];
		this.protoc = options.protoc;
		this.protocVersion = options.protocVersion;
		this.outputName = options.outputName;
		this.outputPath = options.outputPath;
		this.pluginPath = options.pluginPath || "";
		this.srcs = options.srcs;
		this.srcs_dir = options.srcs_dir;
	}

	getGrpcPlugin() {
		return null;
	}

	parseOptions(options) {}

	async run() {}

	async _ensurePluginExist(pluginName) {
		const foundPlugin = which(pluginName);

		if(!foundPlugin) {
			return Promise.reject(new GrpcGenError(
				`Could not find '${pluginName}' in your PATH variable or npm bin paths`
			));
		}

		return foundPlugin;
	}

	async execProtoc(options, srcs = this.srcs) {
		let args = [];

		args.push(`--${this.outputName}_out=${options}`);

		// We don't need to check built in outputs
		if(!BUILT_IN_OUTPUTS.includes(this.outputName)) {
			// protoc will look for the plugin with this name. We check it instead of
			// letting protoc fail, just so we have a prettier error.
			const pluginName = `protoc-gen-${this.outputName}`;
			const pluginPath = await this._ensurePluginExist(pluginName);

			args.push(`--plugin=${pluginName}=${pluginPath}`)
		}

		let grpcPlugin = this.getGrpcPlugin();
		if(grpcPlugin) {
			let grpcPluginName = grpcPlugin.name;
			let grpcPluginPath = await this._ensurePluginExist(grpcPluginName);
			
			args.push(`--grpc_out=${this.outputPath}`);
			args.push(`--plugin=protoc-gen-grpc=${grpcPluginPath}`);
		}

		for(const {name, value} of this.additions) {
			args.push(`--${name}_out=${value}`);
		}

		for(let src of srcs) {
			args.push(src);
		}

		return spawnAsync(this.protoc, args, {
			cwd: this.srcs_dir
		});
	}

};

exports.GrpcGenOutputAdapter = GrpcGenOutputAdapter;
