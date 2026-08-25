"""FastAPI application entrypoint."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    adhoc,
    admin,
    auth,
    facilities,
    health,
    history,
    operations,
    transport,
    users,
    weekly,
)
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Transportation Management Portal API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API = "/api/v1"
for module in (health, auth, users, weekly, adhoc, transport, operations, facilities, history, admin):
    app.include_router(module.router, prefix=API)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "Transportation Management Portal", "docs": "/docs", "health": f"{API}/health"}
