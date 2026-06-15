.PHONY: start dev build test clean

# Default values
PORT ?= 3004
LOG ?= 0
CACHE ?= 1

# Start the server
start:
	@echo "Starting server on port $(PORT)..."
	@if [ "$(LOG)" = "1" ]; then \
		echo "📝 Detailed logging enabled (LOG=1)"; \
	fi
	@if [ "$(CACHE)" = "0" ]; then \
		echo "⚡ Caching disabled (CACHE=0)"; \
	fi
	@LOG=$(LOG) CACHE=$(CACHE) PORT=$(PORT) node backend/server.js

# Development mode with watch
dev:
	@echo "Starting development server..."
	@LOG=$(LOG) CACHE=$(CACHE) node backend/server.js

# Build Docker image
build:
	docker build -t todo-pwa:latest .

# Run tests
test:
	npm test

# Clean up
clean:
	@echo "Cleaning..."
	rm -rf backend/data/*.json 2>/dev/null || true