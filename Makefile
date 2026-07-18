.PHONY: install dev seed reset test lint format build

install:
	./scripts/install.sh

dev:
	./scripts/dev.sh

seed reset:
	cd backend && uv run python -m app.seed

test:
	cd backend && uv run pytest -q
	cd frontend && npm test -- --run

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint

format:
	cd backend && uv run ruff format .
	cd frontend && npm run format

build:
	cd backend && uv run python -m compileall -q app
	cd frontend && npm run build
