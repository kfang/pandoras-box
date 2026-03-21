IMAGE ?= kjfang/mnemosyne
TAG ?= latest

.PHONY: dev build clean check deps docker docker-push

dev: deps
	go run ./cmd/mnemosyne

build:
	go build -o bin/mnemosyne ./cmd/mnemosyne

docker:
	docker build -t $(IMAGE):$(TAG) .

docker-push: docker
	docker push $(IMAGE):$(TAG)

deps:
	@mkdir -p tmp/data/import tmp/data/library

check:
	go vet ./...

clean:
	rm -rf bin/ tmp/
