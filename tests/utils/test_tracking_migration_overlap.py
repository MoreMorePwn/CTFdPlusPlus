from importlib import import_module

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

FORK = "migrations.versions.d2e3f4a5b6c7_add_anti_cheat_events"
UPSTREAM = "migrations.versions.a3e1c5d7b9f2_add_user_agent_column_to_tracking"
MERGE = "migrations.versions.ab3899c0ffee_merge_upstream_user_agent_tracking"


@pytest.mark.parametrize("order", [(FORK, UPSTREAM), (UPSTREAM, FORK)])
def test_shared_user_agent_column_can_be_migrated_in_either_order(monkeypatch, order):
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        metadata = sa.MetaData()
        for table in ("users", "teams", "challenges", "submissions", "tracking"):
            sa.Table(table, metadata, sa.Column("id", sa.Integer, primary_key=True))
        metadata.create_all(connection)
        operations = Operations(MigrationContext.configure(connection))
        for name in order:
            migration = import_module(name)
            monkeypatch.setattr(migration, "op", operations)
            migration.upgrade()
        columns = sa.inspect(connection).get_columns("tracking")
        assert sum(c["name"] == "user_agent" for c in columns) == 1
        assert "browser_fingerprint" in {c["name"] for c in columns}
        # Rolling back the upstream branch must not remove anti-cheat's column.
        import_module(UPSTREAM).downgrade()
        assert "user_agent" in {
            c["name"] for c in sa.inspect(connection).get_columns("tracking")
        }
    engine.dispose()


def test_native_upstream_user_agent_column_is_widened_without_losing_data(monkeypatch):
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE tracking (id INTEGER PRIMARY KEY, user_agent VARCHAR(256))"
            )
        )
        connection.execute(
            sa.text("INSERT INTO tracking VALUES (1, 'Preserved browser')")
        )
        migration = import_module(MERGE)
        monkeypatch.setattr(
            migration, "op", Operations(MigrationContext.configure(connection))
        )
        migration.upgrade()
        columns = {c["name"]: c for c in sa.inspect(connection).get_columns("tracking")}
        assert isinstance(columns["user_agent"]["type"], sa.Text)
        assert (
            connection.execute(
                sa.text("SELECT user_agent FROM tracking WHERE id=1")
            ).scalar()
            == "Preserved browser"
        )
    engine.dispose()
