# Multi-stage cargo-chef build, adapted from ref-proxy's Dockerfile — same 4-stage shape
# (chef -> planner -> builder -> runtime), updated for this workspace's 3 crates and its
# `portcullis` binary name (authstar-proxy's `[[bin]] name = "portcullis"`).
#
# Note: signet-client's generated protobuf/tonic bindings (`src/gen`) ship pre-generated inside
# its published crates.io tarball — no `protoc`/`buf` needed to build against it as a downstream
# dependency (confirmed: this Dockerfile never installs either).

FROM rust:1-slim-bookworm AS chef
WORKDIR /app
# CARGO_BUILD_JOBS=1: required for the linux/arm64 leg of a multi-platform build on an amd64
# runner (see .github/workflows/docker.yml) -- cargo's default parallel codegen-unit/crate
# compilation deadlocks (not just slows down) under QEMU user-mode emulation, a known
# characteristic of combining qemu-user with Rust's threading model, not specific to this
# project or to GitHub Actions. Confirmed for real: the arm64 leg hung for 1h14m+ on one build
# step with unlimited jobs before this was added. Serializes compilation, so it's slower per
# build, but it actually completes.
ENV CARGO_BUILD_JOBS=1
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
