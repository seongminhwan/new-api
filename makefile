FRONTEND_DIR = ./web/default
FRONTEND_CLASSIC_DIR = ./web/classic
BACKEND_DIR = .

.PHONY: all build-frontend build-frontend-classic build-all-frontends start-backend dev dev-api dev-web dev-web-classic docker-buildx-setup docker-push

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
	@docker compose -f docker-compose.dev.yml up -d

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
