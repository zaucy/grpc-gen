const fse = require("fs-extra");
const tmp = require("tmp");
const path = require("path");
const util = require("util");
const {spawn} = require("child_process");
const {which} = require("./which.js");
const colors = require("colors");
const yaml = require("js-yaml");

const GOOGLE_PROTOS = path.resolve(
	path.dirname(require.resolve("grpc-tools")),
	"bin/google"
);

function spawnAsync(exec, args, options) {
	return new Promise((resolve, reject) => {
		let stderr = '';
		let stdout = '';
		let child = spawn(exec, args, options);

		if(child.stdout) {
			child.stdout.on('data', chunk => stdout += chunk.toString());
		}

		if(child.stderr) {
			child.stderr.on('data', chunk => stderr += chunk.toString());
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

function findConfigPath() {
	let cwd = process.cwd();
	const configNames = [
		'.grpc-gen.json',
		'.grpc-gen.yaml',
		'.grpc-gen.yml',
		'.grpc-gen.js',
		'.grpc-gen'
	];

	return configNames.find((configName) => {
		return fse.existsSync(path.resolve(cwd, configName));
	}) || configNames[0];
}

function readConfig(configPath) {
	let extname = path.extname(configPath);
	switch(extname) {
		case '.yml':
		case '.yaml':
			return yaml.safeLoad(fse.readFileSync(configPath));
		case '.js':
			return require(configPath);
		default:
			console.warn(colors.yellow("DEPRECATED") + `: .grpc-gen config file without extension will be removed in next major version. Please switch to .grpc-gen.json or .grpc-gen.yaml`);
		case '.json':
			return fse.readJsonSync(configPath);
	}
}

if(require.main === module) {
	console.error("grpc-gen is not available as a module");
	process.exit(1);
}

const DEFAULT_CONFIG = {
};

const CONFIG_PATH = findConfigPath();
const CONFIG_DIR = path.dirname(CONFIG_PATH);

let config = null;

try {
	config = readConfig(CONFIG_PATH);
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

const SRCS_DIR = path.resolve(CONFIG_DIR, config.srcs_dir);

let node_out = path.resolve(CONFIG_DIR, config.node_out);
let web_out = path.resolve(CONFIG_DIR, config.web_out);
let tmpDir = '';
let tmpSrcsDir = '';
let tmpIncludesDir = '';

async function genJsIndex(dir, rootDir) {
	rootDir = rootDir || dir;

	let files = await fse.readdir(dir);

	for(let index in files) {
		let file = files[index];
		let fullPath = path.resolve(dir, file);
		let stat = await fse.stat(fullPath).catch(err => {
			// Ignore non-existant files
		});

		if(stat && stat.isDirectory()) {
			await genJsIndex(fullPath, rootDir);
			files[index] = fullPath + "/index.js";
		} else {
			files[index] = fullPath;
		}

		files[index] = path.relative(dir, files[index]);
	}

	files = files.filter(filepath => {
		return filepath.endsWith(".js") || filepath.endsWith("index");
	});

	await fse.writeFile(
		path.resolve(dir, 'index.js'),
		`module.exports = Object.assign({},` + files.map(file => {
			let filename = path.basename(file, '.js');
			let dirname = path.dirname(file);
			let requirePath = `./${dirname}/${filename}`;

			if(requirePath.startsWith("././")) {
				requirePath = requirePath.substr(2);
			}

			return `\n\trequire("${requirePath}")`;
		}).join(',') +
		`\n);\n`
	);
}

async function genDtsIndex(dir, rootDir) {
	rootDir = rootDir || dir;

	let files = await fse.readdir(dir);

	for(let index in files) {
		let file = files[index];
		let fullPath = path.resolve(dir, file);
		let stat = await fse.stat(fullPath).catch(err => {
			// Ignore non-existant files
		});

		if(stat && stat.isDirectory()) {
			await genDtsIndex(fullPath, rootDir);
			files[index] = fullPath + "/index";
		} else {
			files[index] = fullPath;
		}

		files[index] = path.relative(dir, files[index]);
	}

	files = files.filter(filepath => {
		return filepath.endsWith(".d.ts") || filepath.endsWith("index");
	});

	await fse.writeFile(
		path.resolve(dir, 'index.d.ts'), files.map(file => {
			let filename = path.basename(file, '.d.ts');
			let dirname = path.dirname(file);
			let requirePath = `./${dirname}/${filename}`;

			if(requirePath.startsWith("././")) {
				requirePath = requirePath.substr(2);
			}

			return `export * from "${requirePath}";`;
		}).join('\n') +
		`\n`
	);
}

async function checkSyntax() {
	const dummyExt = process.platform == 'win32' ? '.cmd' : '';
	const protoc = await which("grpc_tools_node_protoc");
	const dummyProtocPlugin = path.resolve(__dirname, 'dummy' + dummyExt);
	let args =  [].concat(config.srcs, [
		'--dummy_out=./',
		`--plugin=protoc-gen-dummy=${dummyProtocPlugin}`
	]);
	let options = {
		cwd: tmpSrcsDir,
	};

	return spawnAsync(protoc, args, options).catch(err => {
		let errLines = err.split('\n');
		let errLineKeys = {};

		errLines.forEach(errLine => {
			for(let src of config.srcs) {
				if(errLine.startsWith(src)) {
					errLineKeys[errLine.trim()] = true;
					return;
				}
			}
		});

		let msg = Object.keys(errLineKeys).map(errLine => {
			return path.relative(CONFIG_DIR, path.resolve(SRCS_DIR, errLine));
			// return 'example/src/' + errLine;
		}).join('\n');
		let syntaxError = new Error(msg);
		syntaxError.protoSyntaxErr = true;
		syntaxError.originalError = err;
		return Promise.reject(syntaxError);
	});
}

async function gen() {
	const [
		protoc,
		node_protoc_plugin,
		protoc_gen_web_ts_plugin,
		tsc_exec,
		protoc_gen_ngx,
	] = await Promise.all([
		which("grpc_tools_node_protoc"),
		which("grpc_tools_node_protoc_plugin"),
		which("protoc-gen-ts"),
		which("tsc"),
		which("protoc-gen-ngx"),
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
		await genDtsIndex(web_out);
		await genJsIndex(web_out); 
		// await genWebIndex(web_out);
	}

	async function genNgx() {

		// ngx is optional
		if(!config.ngx_out) {
			return;
		}

		const ngx_out = path.resolve(CONFIG_DIR, config.ngx_out);
		const ngxWebOut = path.resolve(ngx_out, "_grpc-gen_web_out");

		await fse.emptyDir(ngx_out);
		await fse.ensureDir(ngx_out);
		await fse.ensureDir(ngxWebOut);

		async function genNgxTs() {
			let args =  [].concat(
				config.srcs,
				[`--ngx_out=${ngx_out}`],
				[`--plugin=protoc-gen-ngx=${protoc_gen_ngx}`],
				[`--proto_path=${tmpSrcsDir}`],
				[`--proto_path=${tmpIncludesDir}`],
			);

			let options = {
				stdio: 'inherit',
				cwd: tmpSrcsDir,
			};

			return spawnAsync(protoc, args, options);
		}

		async function genNgxModule() {

		}

		async function genNgxIndex() {

		}

		async function genNgxJs(dir = ngx_out) {
			let files = await fse.readdir(dir);

			for(let file of files) {
				let stat = await fse.stat(file).catch(err => {
					// Ignore non-existant files
				});
				if(stat && stat.isDirectory()) {
					await genWebIndex(path.resolve(dir, file));
				}
			}

			files = files.filter(file => {
				return file.endsWith('.ts');
			});

			await spawnAsync(tsc_exec, ['-d'].concat(files), {
				stdio: 'inherit',
				cwd: dir
			});
		}

		async function copyWebForNgx() {
			await fse.copy(web_out, ngxWebOut);
		}

		await genNgxTs();
		// await genNgxModule();
		// await genNgxIndex();
		// await genNgxJs();
		await copyWebForNgx();
	}

	await Promise.all([
		genNode(),
		// ngx depends on web
		genWeb().then(() => genNgx()),
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

	await checkSyntax();
	await gen();
	await fse.remove(tmpDirPath).catch(err => {
		// Don't fail the build just because we couldn't clean up.
	});
}

startGen().catch(err => {
	if(err.protoSyntaxErr) {

		if(!err.message.trim()) {
			console.warn("[WARN] No error message, but protoSyntaxError was set.");
			console.warn(err.originalError);
			process.exit(1);
		}

		let errMsg = err.message.split('\n').map(errLine => {
			return colors.red('ERROR') + ': ' + errLine;
		}).join('\n');

		console.error(errMsg);
	} else {
		console.error(err);
	}

	process.exit(1);
});
