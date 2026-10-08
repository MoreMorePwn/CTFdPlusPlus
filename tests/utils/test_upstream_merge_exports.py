import datetime
import os

import pytest

from CTFd.models import (
    AnnouncerBotLogs,
    AntiCheatEvents,
    Challenges,
    Modules,
    PostRevokeCalcAccounts,
    Solves,
    SubmissionFiles,
    Tickets,
    Users,
)
from CTFd.utils.exports import export_ctf, import_ctf
from CTFd.utils.post_revoke_calc import update_account_state, update_solve_state
from tests.helpers import (
    create_ctfd,
    destroy_ctfd,
    gen_audience,
    gen_audience_member,
    gen_challenge,
    gen_module,
    gen_module_audience_access,
    gen_solve,
    gen_user,
    login_as_user,
)


@pytest.mark.parametrize(
    "permission", ["post_revoke_calc_read", "post_revoke_calc_write", "modules"]
)
def test_post_revoke_pdf_access_and_content(permission):
    app = create_ctfd()
    try:
        with app.app_context():
            gen_user(
                app.db,
                name="assistant",
                type="assistant",
                assistant_permissions='["' + permission + '"]',
            )
            with login_as_user(app, "assistant") as client:
                response = client.get("/admin/post-revoke-calc/export.pdf")
                if permission == "modules":
                    assert response.status_code == 403
                else:
                    assert response.status_code == 200
                    assert response.mimetype == "application/pdf"
                    assert response.data.startswith(b"%PDF-")
                    assert len(response.data) > 1000
    finally:
        destroy_ctfd(app)


@pytest.mark.skipif(
    not os.getenv("TESTING_DATABASE_URL", "").startswith("mysql"),
    reason="Import/export requires a disposable MySQL/MariaDB database",
)
def test_export_import_preserves_upstream_and_fork_data(tmp_path):
    app = create_ctfd()
    try:
        with app.app_context():
            user_id = gen_user(
                app.db,
                name="assistant",
                type="assistant",
                assistant_permissions='["tickets", "modules"]',
            ).id
            module_id = gen_module(app.db).id
            audience_id = gen_audience(app.db).id
            gen_audience_member(app.db, audience_id, user_id=user_id)
            gen_module_audience_access(app.db, module_id, audience_id)
            scheduled_at = datetime.datetime(2030, 1, 1)
            challenge_id = gen_challenge(
                app.db,
                module_id=module_id,
                scheduled_at=scheduled_at,
                require_ai_source=True,
                require_solver=True,
            ).id
            solve_id = gen_solve(
                app.db,
                user_id=user_id,
                challenge_id=challenge_id,
                ai_source='["https://example.com/source"]',
                verified=True,
            ).id
            app.db.session.add_all(
                [
                    SubmissionFiles(
                        submission_id=solve_id, location="solver/script.py"
                    ),
                    Tickets(title="ticket", message="preserved", user_id=user_id),
                    AnnouncerBotLogs(
                        event_type="solve",
                        user_id=user_id,
                        challenge_id=challenge_id,
                        success=True,
                    ),
                    AntiCheatEvents(
                        type="test", user_id=user_id, submission_id=solve_id
                    ),
                ]
            )
            app.db.session.commit()
            update_account_state(user_id, manual_banned=True, note="preserved")
            update_solve_state(solve_id, percentage=75, revoked=False, note="preserved")
            backup_path = tmp_path / "merged.zip"
            with export_ctf() as backup:
                backup_path.write_bytes(backup.read())
            import_ctf(str(backup_path))
            app.db.session.remove()
            challenge = Challenges.query.get(challenge_id)
            assert challenge.module_id == module_id
            assert challenge.scheduled_at == scheduled_at
            assert challenge.require_ai_source and challenge.require_solver
            assert Modules.query.get(module_id)
            assert Users.query.get(user_id).assistant_permission_list == [
                "tickets",
                "modules",
            ]
            solve = Solves.query.get(solve_id)
            assert solve.verified and "example.com/source" in solve.ai_source
            assert SubmissionFiles.query.filter_by(submission_id=solve_id).count() == 1
            assert Tickets.query.filter_by(message="preserved").count() == 1
            assert AnnouncerBotLogs.query.filter_by(success=True).count() == 1
            assert AntiCheatEvents.query.filter_by(type="test").count() == 1
            assert (
                PostRevokeCalcAccounts.query.filter_by(account_id=user_id)
                .first()
                .manual_banned
            )
    finally:
        destroy_ctfd(app)
