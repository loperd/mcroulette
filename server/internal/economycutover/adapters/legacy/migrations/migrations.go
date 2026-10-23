// Package migrations installs the legacy economy export barrier explicitly with Goose.
// It does not attempt to baseline or replace the legacy application's AutoMigrate schema.
package migrations

import (
	"context"
	"database/sql"
	"errors"

	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

func Up(ctx context.Context, db *sql.DB) error {
	locker, err := lock.NewPostgresSessionLocker(lock.WithLockID(0x4355544f564552))
	if err != nil {
		return err
	}
	p, err := goose.NewProvider(goose.DialectPostgres, db, nil, goose.WithDisableGlobalRegistry(true), goose.WithTableName("legacy_cutover_schema_version"), goose.WithSessionLocker(locker),
		goose.WithGoMigrations(goose.NewGoMigration(1, &goose.GoFunc{RunTx: upBarrier}, &goose.GoFunc{RunTx: func(context.Context, *sql.Tx) error {
			return errors.New("legacy export barrier is forward-only; do not reopen writes after import")
		}})))
	if err != nil {
		return err
	}
	_, err = p.Up(ctx)
	return err
}
