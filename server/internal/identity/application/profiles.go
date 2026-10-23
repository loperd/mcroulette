package application

import (
	"context"
	"github.com/voxel-vault/api/internal/identity/domain"
)

type Profile struct{ ID, Handle, DisplayName string }
type ProfileReader interface {
	Profile(context.Context, string) (Profile, error)
}

func (a Accounts) Profile(ctx context.Context, id string) (Profile, error) {
	if !domain.ValidID(id) {
		return Profile{}, domain.ErrInvalid
	}
	if _, err := a.access(ctx, "identity.profile.read", "account", id); err != nil {
		return Profile{}, err
	}
	reader := a.Profiles
	if reader == nil {
		return Profile{}, domain.ErrInvalid
	}
	return reader.Profile(ctx, id)
}
func (a Accounts) Exists(ctx context.Context, id string) (bool, error) {
	if !domain.ValidID(id) {
		return false, domain.ErrInvalid
	}
	if _, err := a.access(ctx, "identity.profile.read", "account", id); err != nil {
		return false, err
	}
	return a.Registry.Exists(ctx, id)
}
