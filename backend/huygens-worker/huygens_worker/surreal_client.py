from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast

from surrealdb import AsyncSurreal
from surrealdb.connections.async_ws import AsyncWsSurrealConnection

from .settings import settings

# AsyncSurreal is a factory function, not a class. For ws:// URLs it returns
# an AsyncWsSurrealConnection — we use that as the type everywhere so pyright
# and mypy can reason about it as a real class.
DB = AsyncWsSurrealConnection

# The SDK's query() return is a discriminated union of every possible Value.
# In practice every query we run returns a list of row-dicts, so we cast once
# at the boundary and keep the rest of the code typed against what it actually
# sees.
Row = dict[str, Any]


@asynccontextmanager
async def open_db() -> AsyncIterator[DB]:
    db: DB = cast("DB", AsyncSurreal(settings.surreal_url))
    try:
        await db.signin({"username": settings.surreal_user, "password": settings.surreal_pass})
        await db.use(settings.surreal_ns, settings.surreal_db)
        yield db
    finally:
        await db.close()


async def query_rows(db: DB, sql: str, params: dict[str, Any] | None = None) -> list[Row]:
    result = await db.query(sql, params or {})
    return cast("list[Row]", result)


async def execute(db: DB, sql: str, params: dict[str, Any] | None = None) -> None:
    """Run a statement we don't read rows from (UPDATE, RELATE, INSERT, DELETE)."""
    await db.query(sql, params or {})
