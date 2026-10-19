// Package wallet is a player's balances: the shared currency and the material of each collection.
package wallet

import (
	"errors"
	"maps"
)

// Currency is the shared resource; every other resource is a collection's material.
const Currency = "currency"

var (
	ErrInsufficient = errors.New("not enough on balance")
	ErrNegative     = errors.New("amount must not be negative")
)

// Amount is a whole number of one resource.
type Amount struct {
	Resource string
	Value    int64
}

type Wallet struct {
	owner    string
	balances map[string]int64
}

func New(owner string) *Wallet { return &Wallet{owner: owner, balances: map[string]int64{}} }

// Restore brings back a stored wallet.
func Restore(owner string, balances map[string]int64) *Wallet {
	w := New(owner)
	maps.Copy(w.balances, balances)
	return w
}

func (w *Wallet) Owner() string                 { return w.owner }
func (w *Wallet) Balance(resource string) int64 { return w.balances[resource] }
func (w *Wallet) Balances() map[string]int64    { return maps.Clone(w.balances) }

func (w *Wallet) Credit(a Amount) error {
	if a.Value < 0 {
		return ErrNegative
	}
	w.balances[a.Resource] += a.Value
	return nil
}

// Debit takes an amount; a balance never goes below zero.
func (w *Wallet) Debit(a Amount) error {
	if a.Value < 0 {
		return ErrNegative
	}
	if w.balances[a.Resource] < a.Value {
		return ErrInsufficient
	}
	w.balances[a.Resource] -= a.Value
	return nil
}
