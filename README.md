# gRPC gen

![build-status](https://travis-ci.org/zaucy/grpc-gen.svg?branch=master)

Simple command line for running the protoc compiler via a configuration file

Example `.grpc-gen.yml` config file

```YAML
# Root of all your sources
srcs_dir: ./src
# Array of sources relative to srcs_dir
srcs:
  - file.proto
# Output object where the key is the plugin name and the value is
# the directory for the plugins output.
output:
  plugin-name: output-directory
```

## Install

Install globally

```bash
npm i -g grpc-gen@next
```

OR install locally in your project as a dev dependency and add a build script to your `package.json`.

```bash
npm i -D grpc-gen@next
```

```js
// package.json
"scripts": {
  "build": "grpc-gen"
},
"devDependencies": [
  "grpc-gen": "^1.0.0-0"
]
```

```bash
npm run build
```

## Usage

Running `grpc-gen` in the directory containing your configuration file will build your proto files.

```bash
grpc-gen
```

You can also specify a different configuration file with `--config`

```bash
# Extension can be: .yml .yaml .json .js
grpc-gen --config=custom-config.yml
```

`grpc-gen` may also run in *watch* mode. When your config file or proto files change compilation will re-run.

```
grpc-gen --watch
```