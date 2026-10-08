import pytest

from CTFd.models import Pages
from CTFd.utils import set_config
from tests.helpers import (
    create_ctfd,
    destroy_ctfd,
    gen_challenge,
    gen_flag,
    gen_user,
    login_as_user,
)


@pytest.fixture
def phantom_app():
    app = create_ctfd(ctf_name="Phantom CTF", ctf_theme="phantom")
    yield app
    destroy_ctfd(app)


def test_phantom_preserves_pages_and_event_identity(phantom_app):
    with phantom_app.app_context():
        index = Pages.query.filter_by(route="index").one()
        index.content = "<p>Competition rules remain visible.</p>"
        phantom_app.db.session.commit()
        response = phantom_app.test_client().get("/")
        html = response.get_data(as_text=True)
        assert response.status_code == 200
        assert 'id="phantom-event-name">Phantom CTF' in html
        assert "Competition rules remain visible." in html
        assert "phantom/static/css/phantom.css" in html
        assert "phantom.dev.css" not in html
        assert (
            phantom_app.test_client()
            .get("/themes/phantom/static/css/phantom.css")
            .status_code
            == 200
        )
        assert (
            phantom_app.test_client()
            .get("/themes/phantom/static/js/phantom.js")
            .status_code
            == 200
        )
        assert (
            phantom_app.test_client()
            .get("/themes/phantom/static/img/city.webp")
            .status_code
            == 200
        )


def test_phantom_core_fallback_and_admin_isolation(phantom_app):
    with phantom_app.app_context():
        client = phantom_app.test_client()
        for route in ("/login", "/register"):
            response = client.get(route)
            assert response.status_code == 200
            assert 'class="phantom-theme ' in response.get_data(as_text=True)
        with login_as_user(phantom_app, "admin") as admin:
            for route in (
                "/challenges",
                "/scoreboard",
                "/users",
                "/settings",
                "/notifications",
                "/user",
            ):
                response = admin.get(route)
                assert response.status_code == 200
                assert 'class="phantom-theme ' in response.get_data(as_text=True)
            html = admin.get("/admin").get_data(as_text=True)
            assert "phantom.css" not in html
            assert "phantom-hero" not in html


def test_phantom_challenge_keeps_submission_evidence_controls(phantom_app):
    with phantom_app.app_context():
        gen_user(phantom_app.db, name="player")
        challenge = gen_challenge(phantom_app.db, name="Calling Card")
        gen_flag(phantom_app.db, challenge_id=challenge.id)
        challenge_id = challenge.id
        with login_as_user(phantom_app, "player") as player:
            response = player.get(f"/api/v1/challenges/{challenge_id}")
            assert response.status_code == 200
            view = response.get_json()["data"]["view"]
            assert 'id="challenge-input"' in view
            assert 'name="ai_source"' in view
            assert 'id="solver-files"' in view
            assert "submitChallenge()" in view


def test_phantom_can_be_deselected(phantom_app):
    with phantom_app.app_context():
        set_config("ctf_theme", "core")
        response = phantom_app.test_client().get("/")
        assert response.status_code == 200
        assert "phantom.css" not in response.get_data(as_text=True)
