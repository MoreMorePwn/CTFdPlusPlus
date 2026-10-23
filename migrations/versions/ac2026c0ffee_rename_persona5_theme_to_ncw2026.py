"""Rename the Persona 5 theme to NCW 2026 without losing the selection."""

import sqlalchemy as sa
from alembic import op
from flask import has_app_context

from CTFd.cache import cache
from CTFd.utils import _get_config

revision = "ac2026c0ffee"
down_revision = "ab3899c0ffee"
branch_labels = None
depends_on = None


def _rename_theme(old, new):
    connection = op.get_bind()
    configs = sa.table("config", sa.column("key"), sa.column("value"))
    connection.execute(
        configs.update()
        .where(configs.c.key == "ctf_theme")
        .where(configs.c.value == old)
        .values(value=new)
    )
    pages = sa.table("pages", sa.column("content"))
    old_path, new_path = f"themes/{old}/static/", f"themes/{new}/static/"
    connection.execute(
        pages.update()
        .where(pages.c.content.contains(old_path))
        .values(content=sa.func.replace(pages.c.content, old_path, new_path))
    )
    if has_app_context():
        cache.delete_memoized(_get_config, "ctf_theme")


def upgrade():
    _rename_theme("persona5", "ncw2026")


def downgrade():
    _rename_theme("ncw2026", "persona5")
