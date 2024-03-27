# 1.5.0

- Updates mappings to process `NodeOperationalStatusMetadata` protobuf message. This metaprotocol message enables both storage/distribution workers & leads to set the operational status of the nodes.


# 1.4.4

- Modified script to save graphql schema in `./generated/schema.graphql` file so that it can be fetched directly, previously the schema was generated and returned by spinning up the graphql server.
- **FIX**: Start the postgres DB in `generate-graphql-schema.sh` script.


# 1.4.3

- Allow configuring RPC rate limit via `RPC_RATE_LIMIT` environment variable.

# 1.4.2

- **FIX**: Bump Subsquid processor (`@subsquid/substrate-processor`) version to include fix for switching to RPC when processing unfinalized blocks.

# 1.4.1

- **FIX**: Install `bash` in Dockerfile, since it does not come pre-installed in `node:18-alpine` image.

# 1.4.0

- Created `SquidVersion` graphql entity schema and exposed query to fetch the current version of the storage squid package.

# 1.3.0

- Disables processing of Hot/Un-finalized blocks by the processor.
- Add `DataObjectDeletedEventData` event type.

# 1.2.0

- patched `@subsquid/openreader` to pass parameter values in 'queryConfig' object instead of passing as param to `pgClient.query` function.
- enabled enhanced Opentelemetry postgres query traces.

# 1.1.0

- remove unused dependencies from `package.json` file.
- add opentelemetry integration.
- adds `get-graphql-schema` npm command.
- **FIX**: convert `ipfsHash` to string.

# 1.0.0

- Initial release of `storage-squid` package.
