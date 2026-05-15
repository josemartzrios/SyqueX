"""
Regression test: pgBouncer DuplicatePreparedStatementError fix.

Root cause (asyncpg 0.30 + SQLAlchemy 2.0.35):
  SQLAlchemy calls asyncpg.Connection.prepare(name=None).
  asyncpg._prepare() converts None → named=True, triggering _get_unique_id('stmt')
  which produces *named* prepared statements (__asyncpg_stmt_N__) even when
  statement_cache_size=0.  Named statements accumulate on pgBouncer backend
  connections and raise DuplicatePreparedStatementError on connection reuse.

Fix: prepared_statement_name_func=lambda:"" forces name="" (empty string),
  which asyncpg routes through isinstance(named,str) → stmt_name="" (unnamed).
  asyncpg 0.30 then calls mark_unprepared() for pgBouncer transaction-pool mode.
"""
import sys
import os

# Ensure backend/ is importable without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import database


class TestConnectArgsPgBouncer:
    def test_statement_cache_size_is_zero(self):
        assert database._connect_args.get("statement_cache_size") == 0

    def test_prepared_statement_name_func_present(self):
        assert "prepared_statement_name_func" in database._connect_args

    def test_prepared_statement_name_func_returns_empty_string(self):
        func = database._connect_args["prepared_statement_name_func"]
        assert func() == ""

    def test_prepared_statement_name_func_is_callable(self):
        func = database._connect_args["prepared_statement_name_func"]
        assert callable(func)
