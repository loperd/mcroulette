package legacy

import (
	"context"
	"database/sql"
	"fmt"
)

type TransactionReader interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// GuardWrite leases the legacy write barrier for the caller's local transaction.
// Every application writer must use it; privileged raw SQL is outside this boundary.
func GuardWrite(ctx context.Context, tx TransactionReader) error {
	var installed bool
	if err := tx.QueryRowContext(ctx, `SELECT to_regclass('legacy_economy_cutover.snapshot') IS NOT NULL`).Scan(&installed); err != nil {
		return err
	}
	if !installed {
		return nil
	}
	var frozen bool
	if err := tx.QueryRowContext(ctx, `SELECT frozen FROM legacy_economy_cutover.snapshot WHERE singleton FOR SHARE`).Scan(&frozen); err != nil {
		return err
	}
	if frozen {
		return fmt.Errorf("legacy economy is frozen")
	}
	return nil
}
