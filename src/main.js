const fse = require("fs-extra");
const path = require("path");
const util = require("util");
const {spawn} = require("child_process");
const {which} = require("./which.js");


if(require.main === module) {
	console.error("grpc-gen is not available as a module");
	process.exit(1);
}

const DEFAULT_CONFIG = {
};

const CONFIG_PATH = path.resolve(process.cwd(), ".grpc-gen");

let config = null;

try {
	config = fse.readJsonSync(CONFIG_PATH);
} catch(err) {
	console.error(`Unable to load '${CONFIG_PATH}'`);
	console.error(err);
	process.exit(1);
}

config = Object.assign({}, DEFAULT_CONFIG, config);

if(!config.files) {
	console.error("Missing 'files' in .grcp-gen config");
	process.exit(1);
}

if(!Array.isArray(config.files)) {
	console.error(
		`Expected array for 'files' in .grpc-gen config. ` +
		`Got: ${config.files}`
	);
	process.exit(1);
}

if(!config.node_out) {
	console.error("Missing 'node_out' in .grpc-gen config");
	process.exit(1);
}

if(!config.web_out) {
	console.error("Missing 'web_out' in .grpc-gen config");
	process.exit(1);
}

let node_out = path.resolve(path.dirname(CONFIG_PATH), config.node_out);
let web_out = path.resolve(path.dirname(CONFIG_PATH), config.web_out);

async function gen() {
	const [
		protoc,
		node_protoc_plugin,
		protoc_gen_web_ts_plugin,
		tsc_exec,
	] = await Promise.all([
		which("grpc_tools_node_protoc"),
		which("grpc_tools_node_protoc_plugin"),
		which("protoc-gen-ts"),
		which("tsc"),
	]);

	async function genNode() {

		await fse.emptyDir(node_out);
		await fse.ensureDir(node_out);

		async function genNodeJs() {
			let args =  [].concat(
				config.files,
				[`--js_out=import_style=commonjs,binary:${node_out}`],
				[`--grpc_out=${node_out}`],
				[`--plugin=protoc-gen-grpc=${node_protoc_plugin}`],
			);
			let options = {
				stdio: 'inherit'
			};

			return new Promise((resolve, reject) => {
				spawn(protoc, args, options)
					.on('exit', (code) => {
						if(code != 0) {
							reject();
						} else {
							resolve();
						}
					});
			});
		}

		async function genNodeTs() {
			let files = await fse.readdir(node_out);

			files = files.filter((file) => {
				return file.endsWith('.js');
			});

			files.forEach(async (file) => {
				let basename = path.basename(file, '.js');
				let filepath = path.resolve(node_out, file);

				// @TODO: Generate .d.ts files for the server side.
			});
		}

		await genNodeJs();
		await genNodeTs();
	}

	async function genWeb() {
		await fse.emptyDir(web_out);
		await fse.ensureDir(web_out);

		async function genWebTs() {
			let args =  [].concat(
				config.files,
				[`--js_out=import_style=commonjs,binary:${web_out}`],
				[`--ts_out=service=true:${web_out}`],
				[`--plugin=protoc-gen-ts=${protoc_gen_web_ts_plugin}`],
			);

			let options = {
				stdio: 'inherit'
			};

			return new Promise((resolve, reject) => {
				spawn(protoc, args, options)
					.on('exit', (code) => {
						if(code != 0) {
							reject();
						} else {
							resolve();
						}
					});
			});
		}

		async function genWebJs() {
			let args = [];

			let files = await fse.readdir(web_out);

			files = files.filter((file) => {
				return file.endsWith('.ts') && !file.endsWith('.d.ts');
			});

			args = ['-d'].concat(files);

			let child = spawn(tsc_exec, args, {
				stdio: 'inherit',
				cwd: web_out
			});
		}

		await genWebTs();
		await genWebJs();
	}

	await Promise.all([
		genNode(),
		genWeb(),
	]);
}

gen().catch(() => {
	console.error("grpc-gen failed to compile");
});
