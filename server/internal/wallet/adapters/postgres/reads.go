package postgres

import (
	"context"
	"database/sql"

	"github.com/voxel-vault/api/internal/wallet/application"
	v1 "github.com/voxel-vault/api/internal/wallet/contracts/v1"
	"github.com/voxel-vault/api/internal/wallet/domain"
)

func (s *Store) Balances(ctx context.Context, subject string, assets []string) (map[string]domain.Funds, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	result := map[string]domain.Funds{}
	for _, asset := range assets {
		var funds domain.Funds
		id := domain.PlayerAccount(domain.Terms{Subject: subject, Asset: asset}).ID
		if err = tx.QueryRowContext(ctx, fundsQuery, id).Scan(&funds.Posted, &funds.Held); err != nil {
			return nil, err
		}
		if _, err = funds.Available(); err != nil {
			return nil, err
		}
		result[asset] = funds
	}
	return result, tx.Commit()
}
func (s *Store) History(ctx context.Context, subject, asset string, after *application.HistoryCursor, limit int) ([]application.HistoryEntry, error) {
	id := domain.PlayerAccount(domain.Terms{Subject: subject, Asset: asset}).ID
	var at any
	cursorID := ""
	if after != nil {
		at = after.At
		cursorID = after.ID
	}
	rows, err := s.db.QueryContext(ctx, `SELECT j.id,j.asset,
 CASE WHEN sum(CASE p.side WHEN 'credit' THEN p.units::numeric ELSE -p.units::numeric END)>0 THEN 'credit' ELSE 'debit' END,
 abs(sum(CASE p.side WHEN 'credit' THEN p.units::numeric ELSE -p.units::numeric END)),
 j.occurred_at,i.body#>>'{Terms,Purpose}',j.intent_id
 FROM wallet.postings p JOIN wallet.journals j ON j.id=p.journal_id
 JOIN wallet.intents i ON i.producer=j.producer AND i.id=j.intent_id
 WHERE p.account_id=$1 AND ($2::timestamptz IS NULL OR (j.occurred_at,j.id)<($2::timestamptz,$3))
 GROUP BY j.id,i.body#>>'{Terms,Purpose}'
 HAVING sum(CASE p.side WHEN 'credit' THEN p.units::numeric ELSE -p.units::numeric END)<>0
 ORDER BY j.occurred_at DESC,j.id DESC LIMIT $4`, id, at, cursorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []application.HistoryEntry{}
	for rows.Next() {
		var e application.HistoryEntry
		if err = rows.Scan(&e.ID, &e.Asset, &e.Side, &e.Units, &e.At, &e.Purpose, &e.Reference); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}
func (s *Store) Baseline(ctx context.Context) (v1.Baseline, error) {
	var result v1.Baseline
	err := s.db.QueryRowContext(ctx, `SELECT source,digest FROM wallet.opening_baseline WHERE singleton`).Scan(&result.Source, &result.Digest)
	if err == sql.ErrNoRows {
		return result, nil
	}
	result.Complete = err == nil
	return result, err
}
