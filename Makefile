.PHONY: install dev seed reset test lint format build

install:
	./scripts/install.sh

dev:
	./scripts/dev-all.sh

seed reset:
	cd frontend && npm run seed:claims

test:
	cd frontend && npm test -- --run

lint:
	cd frontend && npm run lint

format:
	cd frontend && npm run format

build:
	cd frontend && npm run build
