.PHONY: dev dev-all dev-client up down migrate test test-e2e build build-client logs

# Start backend in dev mode (without Docker)
dev:
	cd backend && pnpm start:dev

# Start everything: DB + backend (Docker) + web-client (local Vite)
dev-all:
	docker-compose up --build -d
	cd web-client && pnpm dev

# Docker Compose
up:
	docker-compose up --build -d

down:
	docker-compose down

logs:
	docker-compose logs -f

# Database
migrate:
	cd backend && pnpm drizzle-kit push

# Tests
test:
	cd backend && pnpm test

test-e2e:
	cd backend && pnpm test:e2e

# Web client
dev-client:
	cd web-client && pnpm dev

build-client:
	cd web-client && pnpm build

# Build
build:
	cd backend && pnpm build
