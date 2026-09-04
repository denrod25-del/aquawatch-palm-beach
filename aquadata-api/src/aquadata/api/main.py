"""ASGI entrypoint: `uvicorn aquadata.api.main:app --workers 4`."""

from aquadata.api.app import create_app

app = create_app()
