# Multi-stage cargo-chef build, adapted from ref-proxy's Dockerfile — same 4-stage shape
# (chef -> planner -> builder -> runtime), updated for this workspace's 3 crates and its
# `portcullis` binary name (authstar-proxy's `[[bin]] name = "portcullis"`).
#
# Note: signet-client's generated protobuf/tonic bindings (`src/gen`) ship pre-generated inside
# its published crates.io tarball — no `protoc`/`buf` needed to build against it as a downstream
# dependency (confirmed: this Dockerfile never installs either).

FROM rust:1-slim-bookworm AS chef
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
RUN cargo install cargo-chef --locked

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release -p authstar-proxy

FROM gcr.io/distroless/cc-debian12
COPY --from=builder /app/target/release/portcullis /portcullis
EXPOSE 3710
ENTRYPOINT ["/portcullis"]
