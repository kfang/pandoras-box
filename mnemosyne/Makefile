.PHONY: dev build clean check deps

dev: deps
	go run ./cmd/mnemosyne --import ./tmp/import --library ./tmp/library

build:
	go build -o bin/mnemosyne ./cmd/mnemosyne

deps:
	@mkdir -p tmp/import tmp/library

check:
	go vet ./...

clean:
	rm -rf bin/ tmp/
