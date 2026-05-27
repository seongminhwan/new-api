FRONTEND_DIR = ./web/default
FRONTEND_CLASSIC_DIR = ./web/classic
BACKEND_DIR = .
DEV_COMPOSE_FILE = docker-compose.dev.yml
DEV_POSTGRES_SERVICE = postgres
DEV_BACKEND_SERVICE = new-api
DEV_POSTGRES_DB = new-api
DEV_POSTGRES_USER = root
DEV_SQLITE_PATH ?= one-api.db

.PHONY: all build-frontend build-frontend-classic build-all-frontends start-backend dev dev-api dev-api-rebuild dev-web dev-web-classic reset-setup docker-buildx-setup docker-push

all: build-all-frontends start-backend

build-frontend:
	@echo "Building default frontend..."
	@cd $(FRONTEND_DIR) && bun install && DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$(cat ../../VERSION) bun run build

build-frontend-classic:
	@echo "Building classic frontend..."
	@cd $(FRONTEND_CLASSIC_DIR) && bun install && VITE_REACT_APP_VERSION=$(cat ../../VERSION) bun run build

build-all-frontends: build-frontend build-frontend-classic

start-backend:
	@echo "Starting backend dev server..."
	@cd $(BACKEND_DIR) && ERROR_LOG_ENABLED=true go run main.go &

dev-api:
	@echo "Starting backend services (docker)..."
	@docker compose -f $(DEV_COMPOSE_FILE) up -d

dev-api-rebuild:
	@echo "Rebuilding and starting backend service (docker)..."
	@docker compose -f $(DEV_COMPOSE_FILE) up -d --build $(DEV_BACKEND_SERVICE)

dev-web:
	@echo "Starting frontend dev server..."
	@cd $(FRONTEND_DIR) && bun install && bun run dev

dev-web-classic:
	@echo "Starting classic frontend dev server..."
	@cd $(FRONTEND_CLASSIC_DIR) && bun install && bun run dev

dev: dev-api dev-web

# ── Docker multi-arch build & push ──────────────────────────────────
REGISTRY  ?= registry.routerhub.io/newapi/cat-newapi
PLATFORMS ?= linux/amd64,linux/arm64
TIMESTAMP := $(shell date +%Y%m%d%H%M%S)
BUILDX_BUILDER ?= multiarch-builder

.PHONY: docker-buildx-setup docker-push

docker-buildx-setup: ## Ensure a multi-arch buildx builder exists
	@if ! docker buildx inspect $(BUILDX_BUILDER) >/dev/null 2>&1; then \
		echo "Creating buildx builder '$(BUILDX_BUILDER)'..."; \
		docker buildx create --name $(BUILDX_BUILDER) --use --driver docker-container; \
	else \
		docker buildx use $(BUILDX_BUILDER); \
	fi

docker-push: docker-buildx-setup ## Build & push multi-arch image (amd64+arm64)
	@echo "──────────────────────────────────────────"
	@echo "  Registry:   $(REGISTRY)"
	@echo "  Tags:       latest, $(TIMESTAMP)"
	@echo "  Platforms:  $(PLATFORMS)"
	@echo "──────────────────────────────────────────"
	docker buildx build \
		--platform $(PLATFORMS) \
		-t $(REGISTRY):latest \
		-t $(REGISTRY):$(TIMESTAMP) \
		--push .

reset-setup:
	@echo "Resetting local setup wizard state..."
	@if docker compose -f $(DEV_COMPOSE_FILE) ps --services --status running | grep -qx "$(DEV_POSTGRES_SERVICE)"; then \
		echo "Detected running docker dev PostgreSQL. Removing setup record and root users..."; \
		docker compose -f $(DEV_COMPOSE_FILE) exec -T $(DEV_POSTGRES_SERVICE) \
			psql -U $(DEV_POSTGRES_USER) -d $(DEV_POSTGRES_DB) \
			-c 'DELETE FROM setups;' \
			-c 'DELETE FROM users WHERE role = 100;' \
			-c "DELETE FROM options WHERE key IN ('SelfUseModeEnabled', 'DemoSiteEnabled');"; \
		echo "Restarting docker dev backend so setup status is recalculated..."; \
		docker compose -f $(DEV_COMPOSE_FILE) restart $(DEV_BACKEND_SERVICE); \
	elif db_path="$${SQLITE_PATH:-$(DEV_SQLITE_PATH)}"; db_path="$${db_path%%\?*}"; [ -f "$$db_path" ]; then \
		db_path="$${SQLITE_PATH:-$(DEV_SQLITE_PATH)}"; \
		db_path="$${db_path%%\?*}"; \
		echo "Detected local SQLite database: $$db_path"; \
		sqlite3 "$$db_path" \
			"DELETE FROM setups; DELETE FROM users WHERE role = 100; DELETE FROM options WHERE key IN ('SelfUseModeEnabled', 'DemoSiteEnabled');"; \
		echo "SQLite setup state reset. Restart the local backend process before testing the setup wizard."; \
	else \
		echo "No running docker dev PostgreSQL or local SQLite database found."; \
		echo "Start the dev stack with 'make dev-api', or set SQLITE_PATH/DEV_SQLITE_PATH to your local SQLite database."; \
		exit 1; \
	fi
