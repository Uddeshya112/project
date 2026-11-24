import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.auth import Principal, current_principal
from app.database import engine
from app.observability import RequestContextMiddleware
from app.settings import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.app_env == "production" and not settings.database_url:
        raise RuntimeError("DATABASE_URL must be configured in production")
    yield
    if engine is not None:
        await engine.dispose()


logging.basicConfig(level=settings.log_level.upper(), format="%(message)s")
app = FastAPI(title="IntelliSchedule API", version="0.1.0", lifespan=lifespan)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_allowed_origins.split(",") if x.strip()], allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type", "X-Request-ID"])


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", tags=["health"])
async def ready() -> dict[str, str]:
    if engine is None:
        if settings.app_env == "production":
            raise HTTPException(status_code=503, detail="database is not configured")
        return {"status": "ready", "database": "unconfigured-development"}
    try:
        async with engine.connect() as connection:
            await connection.execute(text("select 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    return {"status": "ready", "database": "connected"}


@app.get("/v1/me", tags=["identity"])
async def me(principal: Principal = Depends(current_principal)) -> dict[str, str]:
    return {"user_id": principal.user_id, "institution_id": principal.institution_id, "role": principal.role, "email": principal.email}
