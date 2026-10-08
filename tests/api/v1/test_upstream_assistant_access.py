import datetime
import json
from unittest.mock import Mock

import pytest
from flask import Response

from CTFd.models import SolutionFiles, Unlocks
from tests.helpers import (
    create_ctfd,
    destroy_ctfd,
    gen_challenge,
    gen_file,
    gen_flag,
    gen_hint,
    gen_module,
    gen_solution,
    gen_user,
    login_as_user,
)


@pytest.mark.parametrize("permission", ["modules", "audiences"])
def test_assistant_can_manage_only_granted_access_section(permission):
    app = create_ctfd()
    try:
        with app.app_context():
            gen_user(
                app.db,
                name="assistant",
                type="assistant",
                assistant_permissions=json.dumps([permission]),
            )
            other = "audiences" if permission == "modules" else "modules"
            with login_as_user(app, "assistant") as client:
                assert client.get("/admin").location.endswith("/admin/" + permission)
                assert client.get("/admin/" + permission).status_code == 200
                assert client.get("/admin/" + permission + "/new").status_code == 200
                assert client.get("/admin/" + other).status_code == 403
                assert client.get("/api/v1/" + other).status_code == 403
                assert (
                    client.post("/api/v1/" + other, json={"name": "denied"}).status_code
                    == 403
                )
                assert client.get("/api/v1/flags").status_code == 403
                assert client.get("/api/v1/submissions").status_code == 403
                assert client.get("/api/v1/comments").status_code == 403
                assert client.get("/api/v1/files").status_code == 403

                base = "/api/v1/" + permission
                response = client.post(base, json={"name": "access group"})
                assert response.status_code == 200
                object_id = response.get_json()["data"]["id"]
                item = base + "/" + str(object_id)
                assert client.get(item).status_code == 200
                assert (
                    client.get(
                        "/admin/" + permission + "/" + str(object_id)
                    ).status_code
                    == 200
                )
                assert client.patch(item, json={"name": "renamed"}).status_code == 200
                assert client.delete(item, json=True).status_code == 200
    finally:
        destroy_ctfd(app)


@pytest.mark.parametrize(
    "permission", ["modules", "audiences", "statistics", "submissions_read"]
)
@pytest.mark.parametrize("gate", ["module", "schedule"])
def test_scoped_assistant_cannot_bypass_challenge_access(permission, gate, monkeypatch):
    app = create_ctfd()
    try:
        with app.app_context():
            kwargs = {}
            if gate == "module":
                kwargs["module_id"] = gen_module(app.db).id
            else:
                kwargs["scheduled_at"] = (
                    datetime.datetime.utcnow() + datetime.timedelta(days=1)
                )
            challenge_id = gen_challenge(app.db, **kwargs).id
            gen_flag(app.db, challenge_id=challenge_id)
            hint_id = gen_hint(app.db, challenge_id=challenge_id).id
            solution_id = gen_solution(
                app.db, challenge_id=challenge_id, state="visible"
            ).id
            gen_file(
                app.db, location="restricted/challenge.txt", challenge_id=challenge_id
            )
            app.db.session.add(
                SolutionFiles(
                    solution_id=solution_id, location="restricted/solution.txt"
                )
            )
            app.db.session.commit()
            gen_user(
                app.db,
                name="assistant",
                type="assistant",
                assistant_permissions=json.dumps([permission]),
            )
            # Successful storage isolates authorization from missing fixture files.
            uploader = Mock()
            uploader.download.return_value = Response("secret")
            monkeypatch.setattr("CTFd.views.get_uploader", lambda: uploader)
            with login_as_user(app, "assistant") as client:
                response = client.get("/api/v1/challenges?view=admin")
                assert response.status_code == 200
                assert response.get_json()["data"] == []
                for path in [
                    f"/api/v1/challenges/{challenge_id}",
                    f"/api/v1/challenges/{challenge_id}/solves",
                    f"/api/v1/challenges/{challenge_id}/solution",
                    f"/api/v1/hints/{hint_id}",
                    f"/api/v1/solutions/{solution_id}",
                    "/files/restricted/challenge.txt",
                    "/files/restricted/solution.txt",
                ]:
                    assert client.get(path).status_code == 404, path
                assert (
                    client.post(
                        "/api/v1/challenges/attempt?preview=true",
                        json={"challenge_id": challenge_id, "submission": "flag"},
                    ).status_code
                    == 404
                )
                for unlock_type, target in [
                    ("hints", hint_id),
                    ("solutions", solution_id),
                ]:
                    assert (
                        client.post(
                            "/api/v1/unlocks",
                            json={"type": unlock_type, "target": target},
                        ).status_code
                        == 404
                    )
                assert Unlocks.query.count() == 0
    finally:
        destroy_ctfd(app)
