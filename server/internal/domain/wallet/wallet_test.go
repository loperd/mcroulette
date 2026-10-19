package wallet_test

import (
	"errors"
	"testing"

	"github.com/voxel-vault/api/internal/domain/wallet"
)

func TestBalancesNeverGoNegative(t *testing.T) {
	w := wallet.New("player")
	_ = w.Credit(wallet.Amount{Resource: wallet.Currency, Value: 5})
	if err := w.Debit(wallet.Amount{Resource: wallet.Currency, Value: 6}); !errors.Is(err, wallet.ErrInsufficient) {
		t.Fatalf("overdraft: %v", err)
	}
	if err := w.Credit(wallet.Amount{Resource: wallet.Currency, Value: -1}); !errors.Is(err, wallet.ErrNegative) {
		t.Fatalf("negative credit: %v", err)
	}
	if err := w.Debit(wallet.Amount{Resource: wallet.Currency, Value: 5}); err != nil || w.Balance(wallet.Currency) != 0 {
		t.Fatalf("debit: %v, balance %d", err, w.Balance(wallet.Currency))
	}
}

func TestARestoredEmptyWalletTakesCredit(t *testing.T) {
	w := wallet.Restore("player", nil)
	if err := w.Credit(wallet.Amount{Resource: wallet.Currency, Value: 1}); err != nil || w.Balance(wallet.Currency) != 1 {
		t.Fatalf("credit: %v", err)
	}
}
