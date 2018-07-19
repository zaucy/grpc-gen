# gRPC gen

![build-status](https://travis-ci.org/zaucy/grpc-gen.svg?branch=master)

Simple command line for running the protoc compiler via a configuration file

## Configuration

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

### Output

The output configuration can either be an array or an object. Each element must be an object with exactly one key. The one key must be the plugin/language name. The value has a [long syntax](#long-syntax) and a [short syntax](#short-syntax).

#### Long Syntax

```YAML
output:
  # Name of plugin or language
  - js:
      # Output directory
      dir: dist/node
      # Options to pass to plugin
      options:
        import_style: commonjs

  # Specify a custom plugin
  - custom-plugin:
      custom: true
      # Name of plugin to look for on your PATH or npm bin directories
      plugin: grpc_tools_node_protoc_plugin
      # Custom plugin output directory
      dir: dist/node
      # Options to pass to custom plugin
      options:
```

#### Short Syntax

```YAML
output:
  # Name of plugin or language as key. Output direcotry as value.
  - php: dist/php
```

## Install

Install globally

```bash
npm i -g grpc-gen
```

OR install locally in your project as a dev dependency and add a build script to your `package.json`.

```bash
npm i -D grpc-gen
```

```js
// package.json
"scripts": {
  "build": "grpc-gen"
},
"devDependencies": [
  "grpc-gen": "^1.0.2"
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

## Troubleshooting

If grpc-gen is not behaving the way you expect and want to dive into the issue you can run `grpc-gen` in **verbose mode**. Just pass `--verbose` or `-v`.

```shell
grpc-gen --verbose
```
