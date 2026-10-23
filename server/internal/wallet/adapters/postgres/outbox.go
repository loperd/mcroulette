package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/voxel-vault/api/internal/wallet/application"
	"github.com/voxel-vault/api/internal/wallet/domain"
	"time"
)

func (s *Store) ClaimEvents(ctx context.Context, owner string, now time.Time, ttl time.Duration, limit int) ([]application.Delivery, error) {
	return s.claimEvents(ctx, "", owner, now, ttl, limit)
}
func (s *Store) claimEvents(ctx context.Context, producer, owner string, now time.Time, ttl time.Duration, limit int) ([]application.Delivery, error) {
	rows, err := s.db.QueryContext(ctx, `WITH ready AS (
 SELECT id FROM wallet.outbox WHERE delivered_at IS NULL AND available_at<=$1 AND ($5='' OR producer=$5)
 AND (lease_until IS NULL OR lease_until<=$1) ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT $2
 ) UPDATE wallet.outbox o SET lease_owner=$3,lease_until=$4,lease_fence=o.lease_fence+1,attempts=o.attempts+1
 FROM ready WHERE o.id=ready.id RETURNING o.payload,o.lease_fence,o.attempts`, now, limit, owner, now.Add(ttl), producer)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []application.Delivery
	for rows.Next() {
		var raw []byte
		var d application.Delivery
		if err := rows.Scan(&raw, &d.Fence, &d.Attempts); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &d.Event); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, rows.Err()
}
func (s *Store) AckEvent(ctx context.Context, id, owner string, fence int64, now time.Time) error {
	r, err := s.db.ExecContext(ctx, `UPDATE wallet.outbox SET delivered_at=$4,lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2 AND lease_fence=$3 AND lease_until>$4 AND delivered_at IS NULL`, id, owner, fence, now)
	return leaseResult(r, err)
}
func (s *Store) RetryEvent(ctx context.Context, id, owner string, fence int64, now, next time.Time) error {
	r, err := s.db.ExecContext(ctx, `UPDATE wallet.outbox SET available_at=$5,lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2 AND lease_fence=$3 AND lease_until>$4 AND delivered_at IS NULL`, id, owner, fence, now, next)
	return leaseResult(r, err)
}

func leaseResult(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return application.ErrLeaseLost
	}
	return nil
}

// EventsFor isolates coordinator reply queues. An Inventory worker cannot consume and
// acknowledge a future Shop producer's events, even while sharing the Wallet database.
func (s *Store) EventsFor(producer string) (application.Outbox, error) {
	if !domain.ValidID(producer) {
		return nil, domain.ErrInvalid
	}
	return producerQueue{s, producer}, nil
}

type producerQueue struct {
	*Store
	producer string
}

func (q producerQueue) ClaimEvents(ctx context.Context, owner string, now time.Time, ttl time.Duration, limit int) ([]application.Delivery, error) {
	return q.Store.claimEvents(ctx, q.producer, owner, now, ttl, limit)
}
