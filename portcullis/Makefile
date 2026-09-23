.PHONY: build test clippy run clean docker

build:
	cargo build --workspace

test:
	cargo test --workspace

clippy:
	cargo clippy --workspace --all-targets -- -D warnings

run:
	cargo run -p authstar-proxy --bin portcullis

clean:
	cargo clean

docker:
	docker build -t portcullis:latest .
