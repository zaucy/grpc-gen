const fse = require("fs-extra");
const tmp = require("tmp");
const path = require("path");
const util = require("util");
const {spawn} = require("child_process");
const {which} = require("./which.js");

const GOOGLE_PROTOS = path.resolve(
	path.dirname(require.resolve("grpc-tools")),
	"bin/google"
);

function spawnAsync(exec, args, options) {
	return new Promise((resolve, reject) => {
		let child = spawn(exec, args, options);
		child.on("exit", code => {
			if(code !== 0) {
				reject(code);
			} else {
				resolve();
			}
		});
	});
}

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

if(!config.srcs) {
	console.error("Missing 'srcs' in .grcp-gen config");
	process.exit(1);
}

if(!Array.isArray(config.srcs)) {
	console.error(
		`Expected array for 'srcs' in .grpc-gen config. ` +
		`Got: ${config.srcs}`
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

if(!config.srcs_dir) {
	console.error("Missing 'srcs_dir' in .grcp-gen config");
}

const SRCS_DIR = path.resolve(path.dirname(CONFIG_PATH), config.srcs_dir);

let node_out = path.resolve(path.dirname(CONFIG_PATH), config.node_out);
let web_out = path.resolve(path.dirname(CONFIG_PATH), config.web_out);
let tmpDir = '';
let tmpSrcsDir = '';
let tmpIncludesDir = '';

async function genJsIndex(dir) {
	let files = await fse.readdir(dir);

	for(let file of files) {
		let stat = await fse.stat(file).catch(err => {
			// Ignore non-existant files
		});
		if(stat && stat.isDirectory()) {
			await genJsIndex(path.resolve(dir, file));
		}
	}

	files = files.filter(file => {
		return file.endsWith('.js');
	});

	await fse.writeFile(
		path.resolve(dir, 'index.js'),
		`module.exports = Object.assign({},` + files.map(file => {
			let filename = path.basename(file, '.js');
			let dirname = path.dirname(file);
			return `\n\trequire("./${dirname}${filename}")`;
		}).join(',') +
		`\n);\n`
	);
}

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
				config.srcs,
				[`--js_out=import_style=commonjs,binary:${node_out}`],
				[`--grpc_out=${node_out}`],
				[`--plugin=protoc-gen-grpc=${node_protoc_plugin}`],
				[`--proto_path=${tmpSrcsDir}`],
				[`--proto_path=${tmpIncludesDir}`],
			);
			let options = {
				stdio: 'inherit',
				cwd: tmpSrcsDir,
			};

			return spawnAsync(protoc, args, options);
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
		await genJsIndex(node_out);
	}

	async function genWeb() {
		await fse.emptyDir(web_out);
		await fse.ensureDir(web_out);

		async function genWebTs() {
			let args =  [].concat(
				config.srcs,
				[`--js_out=import_style=commonjs,binary:${web_out}`],
				[`--ts_out=service=true:${web_out}`],
				[`--plugin=protoc-gen-ts=${protoc_gen_web_ts_plugin}`],
				[`--proto_path=${tmpSrcsDir}`],
				[`--proto_path=${tmpIncludesDir}`],
			);

			let options = {
				stdio: 'inherit',
				cwd: tmpSrcsDir,
			};

			return spawnAsync(protoc, args, options);
		}

		async function genWebJs(dir = web_out) {
			let args = [];

			let files = await fse.readdir(dir);

			for(let file of files) {
				let stat = await fse.stat(file).catch(err => {
					// Ignore non-existant files
				});
				if(stat && stat.isDirectory()) {
					await genWebJs(path.resolve(dir, file));
				}
			}

			files = files.filter((file) => {
				return file.endsWith('.ts') && !file.endsWith('.d.ts');
			});

			args = ['-d'].concat(files);

			if(files.length > 0) {
				await spawnAsync(tsc_exec, args, {
					stdio: 'inherit',
					cwd: dir
				});

				Promise.all(files.map(file => {
					return fse.remove(path.resolve(dir, file));
				}));
			}
		}

		async function genWebIndex(dir = web_out) {
			let files = await fse.readdir(dir);
			let indexPath = path.resolve(dir, 'index.ts');

			for(let file of files) {
				let stat = await fse.stat(file).catch(err => {
					// Ignore non-existant files
				});
				if(stat && stat.isDirectory()) {
					await genWebIndex(path.resolve(dir, file));
				}
			}

			files = files.filter(file => {
				return file.endsWith('.d.ts');
			});

			await fse.writeFile(
				indexPath,
				files.map(file => {
					let filename = path.basename(file, '.d.ts');
					let dirname = path.dirname(file);
					if(dirname.startsWith('.')) {
						dirname = dirname.substr(1);
					}
					return `export * from "./${dirname}${filename}";\n`;
				}).join('') + `\n`
			);

			await spawnAsync(tsc_exec, ['-d', indexPath], {
				stdio: 'inherit',
				cwd: dir
			});

			await fse.remove(indexPath);
		}

		await genWebTs();
		await genWebJs();
		await genWebIndex();
	}

	await Promise.all([
		genNode(),
		genWeb(),
	]);
}

async function startGen() {
	let tmpDirPath = await new Promise((resolve, reject) => {
		tmp.dir({prefix: 'grpc-gen-'}, (err, tmpDirPath) => {
			if(err) {
				reject(err);
			} else {
				resolve(tmpDirPath)
			}
		});
	});

	tmpDir = tmpDirPath;

	tmpSrcsDir = path.resolve(tmpDirPath, "srcs");
	tmpIncludesDir = path.resolve(tmpDirPath, "includes");
	await Promise.all([
		fse.ensureDir(tmpSrcsDir),
		fse.ensureDir(tmpIncludesDir),
	]);

	async function copyIncludes(protosPath, name) {
		await fse.copy(protosPath, path.resolve(tmpIncludesDir, name));
	}

	await Promise.all([
		fse.copy(SRCS_DIR, tmpSrcsDir),
		copyIncludes(GOOGLE_PROTOS, "google"),
	]);

	await gen();
	await fse.remove(tmpDirPath).catch(err => {
		// Don't fail the build just because we couldn't clean up.
	});
}

startGen().catch(err => {
	console.error("grpc-gen failed to compile", err);
});
