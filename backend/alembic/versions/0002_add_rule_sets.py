"""add rule_sets table

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('rule_sets',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('device_id', UUID(as_uuid=True), nullable=False),
        sa.Column('rules', JSONB, nullable=False, server_default='{}'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('device_id'),
    )
    op.create_index('ix_rule_sets_device_id', 'rule_sets', ['device_id'])


def downgrade() -> None:
    op.drop_index('ix_rule_sets_device_id', 'rule_sets')
    op.drop_table('rule_sets')
