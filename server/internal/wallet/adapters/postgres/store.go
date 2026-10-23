// Package postgres persists Wallet state exclusively in the wallet schema. Its unit of
// work is never joined to an Inventory/Accounts transaction or foreign repository.
package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/voxel-vault/api/internal/wallet/application"
	"github.com/voxel-vault/api/internal/wallet/domain"
)

type Store struct{ db *sql.DB }

func New(db *sql.DB) *Store { return &Store{db} }

// ReadIntent is a primary-store observation, not a cancellation fence. In particular,
// Missing does not rule out a delayed command and must not authorize compensation.
func (s *Store) ReadIntent(ctx context.Context, producer, id string) (domain.Intent, error) {
	var raw []byte
	err := s.db.QueryRowContext(ctx, `SELECT body FROM wallet.intents WHERE producer=$1 AND id=$2`, producer, id).Scan(&raw)
	if err == sql.ErrNoRows {
		return domain.Intent{Producer: producer, ID: id, State: domain.Missing}, nil
	}
	if err != nil {
		return domain.Intent{}, err
	}
	var intent domain.Intent
	if err := json.Unmarshal(raw, &intent); err != nil {
		return domain.Intent{}, err
	}
	if intent.Producer != producer || intent.ID != id {
		return domain.Intent{}, domain.ErrInvariant
	}
	return intent, nil
}

func (s *Store) Transact(ctx context.Context, fn func(application.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = fn(&unit{ctx, tx}); err != nil {
		return err
	}
	return tx.Commit()
}

type unit struct {
	ctx context.Context
	tx  *sql.Tx
}

func (t *unit) ClaimCommand(producer, id, fingerprint string) (*application.Receipt, error) {
	if _, err := t.tx.ExecContext(t.ctx, `INSERT INTO wallet.commands(producer,id,fingerprint) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, producer, id, fingerprint); err != nil {
		return nil, err
	}
	var existing string
	var raw []byte
	if err := t.tx.QueryRowContext(t.ctx, `SELECT fingerprint,receipt FROM wallet.commands WHERE producer=$1 AND id=$2 FOR UPDATE`, producer, id).Scan(&existing, &raw); err != nil {
		return nil, err
	}
	if existing != fingerprint {
		return nil, domain.ErrConflict
	}
	if raw == nil {
		return nil, nil
	}
	var receipt application.Receipt
	if err := json.Unmarshal(raw, &receipt); err != nil {
		return nil, err
	}
	return &receipt, nil
}
func (t *unit) LockIntent(producer, id string) (domain.Intent, error) {
	if _, err := t.tx.ExecContext(t.ctx, `INSERT INTO wallet.intents(producer,id) VALUES($1,$2) ON CONFLICT DO NOTHING`, producer, id); err != nil {
		return domain.Intent{}, err
	}
	var raw []byte
	if err := t.tx.QueryRowContext(t.ctx, `SELECT body FROM wallet.intents WHERE producer=$1 AND id=$2 FOR UPDATE`, producer, id).Scan(&raw); err != nil {
		return domain.Intent{}, err
	}
	if raw == nil {
		return domain.Intent{Producer: producer, ID: id, State: domain.Missing}, nil
	}
	var intent domain.Intent
	if err := json.Unmarshal(raw, &intent); err != nil {
		return intent, err
	}
	if intent.Producer != producer || intent.ID != id {
		return intent, domain.ErrInvariant
	}
	return intent, nil
}
func (t *unit) LockAccounts(input []domain.Account) error {
	accounts := append([]domain.Account(nil), input...)
	sort.Slice(accounts, func(i, j int) bool { return accounts[i].ID < accounts[j].ID })
	for _, a := range accounts {
		if _, err := t.tx.ExecContext(t.ctx, `INSERT INTO wallet.accounts(id,subject,asset,role) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, a.ID, a.Subject, a.Asset, a.Role); err != nil {
			return err
		}
		var subject, asset, role string
		if err := t.tx.QueryRowContext(t.ctx, `SELECT subject,asset,role FROM wallet.accounts WHERE id=$1 FOR UPDATE`, a.ID).Scan(&subject, &asset, &role); err != nil {
			return err
		}
		if subject != a.Subject || asset != a.Asset || role != a.Role {
			return domain.ErrConflict
		}
	}
	return nil
}

const fundsQuery = `SELECT
 COALESCE((SELECT sum(CASE side WHEN 'credit' THEN units::numeric ELSE -units::numeric END) FROM wallet.postings WHERE account_id=$1),0),
 COALESCE((SELECT sum(units::numeric) FROM wallet.holds WHERE account_id=$1),0)`

func (t *unit) Funds(account string) (domain.Funds, error) {
	var f domain.Funds
	err := t.tx.QueryRowContext(t.ctx, fundsQuery, account).Scan(&f.Posted, &f.Held)
	return f, err
}
func (t *unit) SaveIntent(i domain.Intent) error {
	raw, err := json.Marshal(i)
	if err != nil {
		return err
	}
	if _, err = t.tx.ExecContext(t.ctx, `UPDATE wallet.intents SET body=$3 WHERE producer=$1 AND id=$2`, i.Producer, i.ID, raw); err != nil {
		return err
	}
	if i.State == domain.Reserved {
		if i.Terms == nil {
			return domain.ErrInvariant
		}
		a := domain.PlayerAccount(*i.Terms)
		_, err = t.tx.ExecContext(t.ctx, `INSERT INTO wallet.holds(producer,intent_id,account_id,units) VALUES($1,$2,$3,$4)`, i.Producer, i.ID, a.ID, i.Terms.Units)
	} else {
		_, err = t.tx.ExecContext(t.ctx, `DELETE FROM wallet.holds WHERE producer=$1 AND intent_id=$2`, i.Producer, i.ID)
	}
	return err
}
func (t *unit) AppendJournal(j domain.Journal) error {
	if err := j.Validate(); err != nil {
		return err
	}
	if _, err := t.tx.ExecContext(t.ctx, `INSERT INTO wallet.journals(id,producer,intent_id,asset,occurred_at) VALUES($1,$2,$3,$4,$5)`, j.ID, j.Producer, j.IntentID, j.Asset, j.At); err != nil {
		return err
	}
	for n, p := range j.Postings {
		if _, err := t.tx.ExecContext(t.ctx, `INSERT INTO wallet.postings(journal_id,ordinal,account_id,asset,side,units) VALUES($1,$2,$3,$4,$5,$6)`, j.ID, n, p.Account, p.Asset, p.Side, p.Units); err != nil {
			return err
		}
	}
	return nil
}
func (t *unit) CompleteCommand(producer, id string, r application.Receipt) error {
	raw, err := json.Marshal(r)
	if err != nil {
		return err
	}
	result, err := t.tx.ExecContext(t.ctx, `UPDATE wallet.commands SET receipt=$3 WHERE producer=$1 AND id=$2 AND receipt IS NULL`, producer, id, raw)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return fmt.Errorf("%w: command receipt not claimed", domain.ErrInvariant)
	}
	return nil
}
func (t *unit) Enqueue(e application.Event) error {
	raw, err := json.Marshal(e)
	if err != nil {
		return err
	}
	_, err = t.tx.ExecContext(t.ctx, `INSERT INTO wallet.outbox(id,payload,created_at,available_at,producer) VALUES($1,$2,$3,$3,$4)`, e.ID, raw, e.At, e.Receipt.Intent.Producer)
	return err
}

// Balance is an adapter-level read for an already-authorized query. Authorization belongs
// to the inbound/application boundary, not this repository. One statement gives one snapshot.
func (s *Store) Balance(ctx context.Context, subject, asset string) (domain.Funds, error) {
	account := domain.PlayerAccount(domain.Terms{Subject: subject, Asset: asset})
	var f domain.Funds
	err := s.db.QueryRowContext(ctx, fundsQuery, account.ID).Scan(&f.Posted, &f.Held)
	return f, err
}

// PendingEvents returns committed outbox facts. Delivery leasing/acknowledgment is a separate
// adapter slice; reading a pending event does not mark it delivered.
func (s *Store) PendingEvents(ctx context.Context) ([]application.Event, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT payload FROM wallet.outbox WHERE delivered_at IS NULL ORDER BY created_at,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var events []application.Event
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var e application.Event
		if err := json.Unmarshal(raw, &e); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}
