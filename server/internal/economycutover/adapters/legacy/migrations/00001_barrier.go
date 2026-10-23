package migrations

import (
	"context"
	"database/sql"
)

func upBarrier(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `CREATE SCHEMA legacy_economy_cutover;
 CREATE TABLE legacy_economy_cutover.snapshot(
 singleton boolean PRIMARY KEY CHECK(singleton),frozen boolean NOT NULL DEFAULT false,
 source text,digest text,manifest bytea,
 CHECK(NOT frozen OR (source IS NOT NULL AND digest IS NOT NULL AND manifest IS NOT NULL))
 );
 INSERT INTO legacy_economy_cutover.snapshot(singleton) VALUES(true);
`)
	return err
}
