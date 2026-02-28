.PHONY: dev up down migrate test test-e2e build logs

# Start backend in dev mode (without Docker)
dev:
	cd backend && yarn start:dev

# Docker Compose
up:
	docker-compose up --build -d

down:
	docker-compose down

logs:
	docker-compose logs -f

# Database
migrate:
	cd backend && yarn drizzle-kit push

# Tests
test:
	cd backend && yarn test

test-e2e:
	cd backend && yarn test:e2e

# Build
build:
	cd backend && yarn build
