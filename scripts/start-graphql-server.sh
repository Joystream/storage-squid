#!/usr/bin/env bash

# docker entrypoint fot graphql-server, to allow running with telemetry
if [[ "$TELEMETRY_ENABLED" = "yes" ]]; then
    node --require ./opentelemetry/index.js ./node_modules/@subsquid/graphql-server/bin/run.js $*
else
    node ./node_modules/@subsquid/graphql-server/bin/run.js $*
fi
