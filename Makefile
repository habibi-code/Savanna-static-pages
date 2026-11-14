.PHONY: dev build test axe wcag ingest clean

# ── Development ───────────────────────────────────────────────────
dev:
	@echo "Starting Savanna Multilingual Assistant in dev mode …"
	cp -n .env.example .env 2>/dev/null || true
	docker compose up --build

dev-api:
	cd api && pip install -r requirements.txt -q && \
	  uvicorn main:app --reload --port 8000

dev-widget:
	python3 -m http.server 3000 --directory widget

# ── Build ─────────────────────────────────────────────────────────
build:
	docker compose build

# ── Ingest course documents ───────────────────────────────────────
ingest:
	cd api && python -c "import asyncio; from rag.ingest import ensure_ingested; asyncio.run(ensure_ingested('../docs', './chroma_data', force=True))"

# ── Accessibility testing ─────────────────────────────────────────
axe:
	@echo "Running axe-core accessibility audit …"
	node widget/widget-a11y.test.js

# ── WCAG conformance report ───────────────────────────────────────
wcag:
	@echo "Generating WCAG 2.2 AA conformance report …"
	$(MAKE) axe
	@echo "See wcag-report.md for the full manual test log."

# ── Unit / integration tests ──────────────────────────────────────
test:
	@echo "Running backend test suite …"
	cd api && PYTHONPATH=. ../.venv/bin/python -m unittest tests/test_assistant.py 2>/dev/null || \
	  (cd api && PYTHONPATH=. python3 -m unittest tests/test_assistant.py)

# ── LTI key generation ────────────────────────────────────────────
lti-keys:
	openssl genrsa -out api/lti_private.pem 2048
	openssl rsa -in api/lti_private.pem -pubout -out api/lti_public.pem
	@echo "Keys written to api/lti_private.pem and api/lti_public.pem"

# ── Clean ─────────────────────────────────────────────────────────
clean:
	docker compose down -v
	rm -rf api/chroma_data axe-results.json
