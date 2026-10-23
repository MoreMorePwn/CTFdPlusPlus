"""Merge upstream 3.8.9 tracking with the fork's anti-cheat schema."""

import sqlalchemy as sa
from alembic import op

revision = "ab3899c0ffee"
down_revision = ("ab3888c0ffee", "a3e1c5d7b9f2")
branch_labels = None
depends_on = None


def upgrade():
    # Native upstream databases use VARCHAR(256); keep the fork's longer values.
    columns = sa.inspect(op.get_bind()).get_columns("tracking")
    user_agent = next(c for c in columns if c["name"] == "user_agent")
    if not isinstance(user_agent["type"], sa.Text):
        with op.batch_alter_table("tracking") as batch_op:
            batch_op.alter_column(
                "user_agent", existing_type=user_agent["type"], type_=sa.Text()
            )


def downgrade():
    # Retain TEXT rather than truncate existing anti-cheat data.
    pass
