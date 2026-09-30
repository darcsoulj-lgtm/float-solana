"""Prepare a D1 export for isolated recovery. Local only; never connects to D1.

Usage: python3 scripts/prepare-d1-recovery.py INPUT.sql OUTPUT.sql
Creates tables before data, orders parent tables first, and bounds cache payload
statements. Output contains private data: keep it outside git and delete after use.
"""
import os
import sqlite3
import sys
from pathlib import Path


def prepare(source, target):
    connection = sqlite3.connect(':memory:')
    try:
        connection.executescript(Path(source).read_text())
        if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Source integrity check failed')
        if connection.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('Source contains broken foreign keys')
        names = [r[0] for r in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        ordered, visiting = [], set()
        identifier = lambda value: '"' + value.replace('"', '""') + '"'
        def add(name):
            if name in ordered:
                return
            if name in visiting:
                raise ValueError('Cyclic foreign keys require a separate recovery plan')
            visiting.add(name)
            for row in connection.execute('PRAGMA foreign_key_list(' + identifier(name) + ')'):
                if row[2] != name:
                    add(row[2])
            visiting.remove(name)
            ordered.append(name)
        for name in names:
            add(name)
        quote = lambda value: connection.execute('SELECT quote(?)', (value,)).fetchone()[0]
        statements = ['PRAGMA defer_foreign_keys=TRUE;']
        statements.extend(connection.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ).fetchone()[0] + ';' for name in ordered)
        for name in ordered:
            columns = [r[1] for r in connection.execute('PRAGMA table_info(' + identifier(name) + ')')]
            for record in connection.execute('SELECT * FROM ' + identifier(name)):
                record, payload = list(record), None
                if name == 'market_cache':
                    index = columns.index('payload')
                    payload = record[index]
                    if payload is not None:
                        record[index] = ''
                statements.append('INSERT INTO ' + identifier(name) + '(' +
                                  ','.join(map(identifier, columns)) + ') VALUES(' +
                                  ','.join(map(quote, record)) + ');')
                if payload is not None:
                    for offset in range(0, len(payload), 30000):
                        statements.append('UPDATE market_cache SET payload=payload||' +
                                          quote(payload[offset:offset + 30000]) + ' WHERE key=' +
                                          quote(record[columns.index('key')]) + ';')
        statements.extend(r[0] + ';' for r in connection.execute(
            "SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL"))
        # Refuse overwrites and restrict permissions from the moment of creation.
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w') as output:
            output.write('\n'.join(statements))
        print('Prepared recovery SQL for', len(ordered), 'tables. No network operations performed.')
    finally:
        connection.close()


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: prepare-d1-recovery.py INPUT.sql OUTPUT.sql')
    prepare(sys.argv[1], sys.argv[2])
