from contextlib import asynccontextmanager
from typing import AsyncIterator

from surrealdb import AsyncSurreal

from .settings import settings


@asynccontextmanager
async def open_db() -> AsyncIterator[AsyncSurreal]:
    db = AsyncSurreal(settings.surreal_url)
    try:
        await db.signin({"username": settings.surreal_user, "password": settings.surreal_pass})
        await db.use(settings.surreal_ns, settings.surreal_db)
        yield db
    finally:
        await db.close()
