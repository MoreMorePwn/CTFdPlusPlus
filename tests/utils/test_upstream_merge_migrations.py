import os

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from flask_migrate import upgrade
from sqlalchemy import inspect, text

from CTFd.utils.migrations import create_database, drop_database, get_current_revision
from tests.helpers import create_ctfd, destroy_ctfd


def test_merged_migrations_have_one_head():
    config = Config("migrations/alembic.ini")
    config.set_main_option("script_location", "migrations")
    assert ScriptDirectory.from_config(config).get_heads() == ["ab3888c0ffee"]


@pytest.mark.skipif(
    not os.getenv("TESTING_DATABASE_URL", "").startswith("mysql"),
    reason="Full historical migrations require a disposable MySQL/MariaDB database",
)
@pytest.mark.parametrize(
    "starting_revision", ["48d8250d19bd", "a9b8c7d6e5f4", "f63a9205d72f"]
)
def test_upgrade_baseline_fork_and_upstream_preserves_data(starting_revision):
    app = create_ctfd()
    try:
        with app.app_context():
            # create_ctfd assigns a fresh UUID database; never use deployment data.
            app.db.session.remove()
            app.db.engine.dispose()
            drop_database()
            create_database()
            upgrade(revision=starting_revision)
            app.db.session.execute(
                text(
                    "INSERT INTO users (id, name, email, type) VALUES (1, 'preserved', 'preserved@examplectf.com', 'user')"
                )
            )
            app.db.session.execute(
                text(
                    "INSERT INTO challenges (id, name, type, state, logic, position) VALUES (1, 'preserved', 'standard', 'visible', 'any', 0)"
                )
            )
            if starting_revision == "a9b8c7d6e5f4":
                app.db.session.execute(
                    text(
                        "UPDATE users SET type='assistant', assistant_permissions='[\"tickets\"]' WHERE id=1"
                    )
                )
                app.db.session.execute(
                    text(
                        "UPDATE challenges SET require_ai_source=1, require_solver=1 WHERE id=1"
                    )
                )
            elif starting_revision == "f63a9205d72f":
                app.db.session.execute(
                    text(
                        "UPDATE challenges SET scheduled_at='2030-01-01 00:00:00' WHERE id=1"
                    )
                )
            app.db.session.commit()
            upgrade(revision="head")
            assert get_current_revision() == "ab3888c0ffee"
            assert (
                app.db.session.execute(
                    text("SELECT name FROM challenges WHERE id=1")
                ).scalar()
                == "preserved"
            )
            tables = set(inspect(app.db.engine).get_table_names())
            assert {
                "audiences",
                "audience_members",
                "modules",
                "module_audience_access",
                "tickets",
                "announcer_bot_logs",
                "anti_cheat_events",
            } <= tables
            assert {
                "require_ai_source",
                "require_solver",
                "scheduled_at",
                "module_id",
            } <= {c["name"] for c in inspect(app.db.engine).get_columns("challenges")}
            if starting_revision == "a9b8c7d6e5f4":
                assert (
                    app.db.session.execute(
                        text("SELECT assistant_permissions FROM users WHERE id=1")
                    ).scalar()
                    == '["tickets"]'
                )
                assert (
                    app.db.session.execute(
                        text("SELECT require_solver FROM challenges WHERE id=1")
                    ).scalar()
                    == 1
                )
            elif starting_revision == "f63a9205d72f":
                assert (
                    app.db.session.execute(
                        text("SELECT scheduled_at FROM challenges WHERE id=1")
                    )
                    .scalar()
                    .year
                    == 2030
                )
    finally:
        destroy_ctfd(app)
