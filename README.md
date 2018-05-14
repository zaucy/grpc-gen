# gRPC gen

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
