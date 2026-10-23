import os
from importlib import import_module

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations

from CTFd.models import Pages
from CTFd.utils import get_config, set_config
from CTFd.utils.config import get_themes
from CTFd.utils.exports import export_ctf, import_ctf
from tests.helpers import (
    create_ctfd,
    destroy_ctfd,
    gen_challenge,
    gen_flag,
    gen_user,
    login_as_user,
)


@pytest.fixture
def p5_app():
    app = create_ctfd(ctf_name="Phantom Heist", ctf_theme="ncw2026")
    yield app
    destroy_ctfd(app)


def test_ncw2026_home_is_title_screen_only(p5_app):
    with p5_app.app_context():
        index = Pages.query.filter_by(route="index").one()
        index.content = "<p>Competition rules remain visible.</p>"
        p5_app.db.session.commit()
        client = p5_app.test_client()
        html = client.get("/").get_data(as_text=True)
        assert 'id="p5-title-name" data-p5-ransom>Phantom Heist' in html
        # The index page's content (CTFd's stock placeholder by default) is not rendered.
        assert "Competition rules remain visible." not in html
        assert "data-p5-countdown" in html
        assert "img/logo/ncw-logo.webp" in html
        assert "img/logo/eagle-icon.png" in html
        for path in (
            "css/ncw2026.css",
            "js/ncw2026.js",
            "vendor/gsap.min.js",
            "fonts/anton.woff2",
            "img/mascots/laptop.webp",
            "img/emblem/eagle-dark.webp",
            "img/logo/ncw-logo.webp",
            "sfx/manifest.json",
        ):
            assert client.get(f"/themes/ncw2026/static/{path}").status_code == 200


def test_ncw2026_renders_every_participant_page(p5_app):
    with p5_app.app_context():
        client = p5_app.test_client()
        for route in ("/login", "/register", "/reset_password"):
            response = client.get(route)
            assert response.status_code == 200, route
            assert 'class="p5-auth"' in response.get_data(as_text=True), route
        with login_as_user(p5_app, "admin") as admin:
            for route in (
                "/challenges",
                "/scoreboard",
                "/users",
                "/settings",
                "/notifications",
                "/user",
            ):
                response = admin.get(route)
                assert response.status_code == 200, route
                html = response.get_data(as_text=True)
                assert 'class="p5 p5-ep-' in html, route
                assert "p5-sound" in html, route
            assert "p5-board" in admin.get("/challenges").get_data(as_text=True)
            assert "p5-podium" in admin.get("/scoreboard").get_data(as_text=True)


def test_ncw2026_error_page_and_admin_isolation(p5_app):
    with p5_app.app_context():
        client = p5_app.test_client()
        response = client.get("/this-page-does-not-exist")
        assert response.status_code == 404
        assert "p5-lost" in response.get_data(as_text=True)
        with login_as_user(p5_app, "admin") as admin:
            html = admin.get("/admin/statistics").get_data(as_text=True)
            assert "ncw2026.css" not in html
            assert "p5-wipe" not in html


def test_ncw2026_challenge_view_keeps_submission_controls(p5_app):
    with p5_app.app_context():
        gen_user(p5_app.db, name="player")
        challenge = gen_challenge(p5_app.db, name="Calling Card")
        gen_flag(p5_app.db, challenge_id=challenge.id)
        challenge_id = challenge.id
        with login_as_user(p5_app, "player") as player:
            response = player.get(f"/api/v1/challenges/{challenge_id}")
            assert response.status_code == 200
            view = response.get_json()["data"]["view"]
            assert "p5-dialog" in view
            assert (
                'class="challenge-name p5-dialog__name" data-p5-ransom>Calling Card'
                in view
            )
            assert 'id="challenge-input"' in view
            assert 'id="challenge-submit"' in view
            assert 'name="ai_source"' in view
            assert 'id="solver-files"' in view
            assert "submitChallenge()" in view


def test_ncw2026_can_be_deselected(p5_app):
    with p5_app.app_context():
        set_config("ctf_theme", "core")
        html = p5_app.test_client().get("/").get_data(as_text=True)
        assert "ncw2026.css" not in html


def test_ncw2026_is_selectable_under_its_new_name(p5_app):
    with p5_app.app_context():
        assert "ncw2026" in get_themes()
        assert "persona5" not in get_themes()
        html = p5_app.test_client().get("/").get_data(as_text=True)
        assert "/themes/ncw2026/static/" in html
        assert "/themes/persona5/static/" not in html


@pytest.mark.parametrize("theme", ["persona5", "core"])
def test_theme_rename_preserves_selection_and_page_assets(p5_app, monkeypatch, theme):
    with p5_app.app_context():
        set_config("ctf_theme", theme)
        index = Pages.query.filter_by(route="index").one()
        index.content = '<img src="/themes/persona5/static/img/logo/ncw-logo.webp">'
        p5_app.db.session.commit()
        migration = import_module(
            "migrations.versions.ac2026c0ffee_rename_persona5_theme_to_ncw2026"
        )
        connection = p5_app.db.session.connection()
        monkeypatch.setattr(
            migration, "op", Operations(MigrationContext.configure(connection))
        )
        migration.upgrade()
        p5_app.db.session.commit()
        assert get_config("ctf_theme") == ("ncw2026" if theme == "persona5" else theme)
        assert (
            "/themes/ncw2026/static/"
            in Pages.query.filter_by(route="index").one().content
        )
        assert p5_app.test_client().get("/").status_code == 200
        monkeypatch.setattr(
            migration,
            "op",
            Operations(MigrationContext.configure(p5_app.db.session.connection())),
        )
        migration.downgrade()
        p5_app.db.session.commit()
        assert get_config("ctf_theme") == theme


@pytest.mark.skipif(
    not os.getenv("TESTING_DATABASE_URL", "").startswith("mysql"),
    reason="Import/export requires a disposable MySQL/MariaDB database",
)
def test_legacy_persona5_backup_import_selects_ncw2026(p5_app, tmp_path):
    with p5_app.app_context():
        set_config("ctf_theme", "persona5")
        backup_path = tmp_path / "legacy-theme.zip"
        with export_ctf() as backup:
            backup_path.write_bytes(backup.read())
        import_ctf(str(backup_path))
        assert get_config("ctf_theme") == "ncw2026"
        html = p5_app.test_client().get("/").get_data(as_text=True)
        assert "ncw2026.css" in html
