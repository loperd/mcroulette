package legacy

import (
	"context"
	"fmt"
)

type State struct {
	Installed, Frozen bool
	Source, Digest    string
}

func (s Source) State(ctx context.Context) (State, error) {
	var r State
	if err := s.DB.QueryRowContext(ctx, `SELECT to_regclass('legacy_economy_cutover.snapshot') IS NOT NULL`).Scan(&r.Installed); err != nil {
		return r, err
	}
	if !r.Installed {
		return r, nil
	}
	err := s.DB.QueryRowContext(ctx, `SELECT frozen,COALESCE(source,''),COALESCE(digest,'') FROM legacy_economy_cutover.snapshot WHERE singleton`).Scan(&r.Frozen, &r.Source, &r.Digest)
	return r, err
}
func (s Source) LegacyWritable(ctx context.Context) error {
	r, err := s.State(ctx)
	if err != nil {
		return err
	}
	if r.Frozen {
		return fmt.Errorf("legacy economy is frozen")
	}
	return nil
}
