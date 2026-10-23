"""Add user_agent column to Tracking

Revision ID: a3e1c5d7b9f2
Revises: f63a9205d72f
Create Date: 2026-10-15 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "a3e1c5d7b9f2"
down_revision = "f63a9205d72f"
branch_labels = None
depends_on = None


def upgrade():
    # The fork's anti-cheat migration can create this column first.
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("tracking")}
    if "user_agent" not in columns:
        op.add_column("tracking", sa.Column("user_agent", sa.Text(), nullable=True))


def downgrade():
    # Never remove a column still owned by the fork's anti-cheat feature.
    if "anti_cheat_events" not in sa.inspect(op.get_bind()).get_table_names():
        op.drop_column("tracking", "user_agent")
