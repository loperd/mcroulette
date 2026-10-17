package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/go-jose/go-jose/v4"
)

// Telegram signs ID tokens with RS256, ES256 or EdDSA, and also publishes an ES256K (secp256k1)
// key. go-jose cannot parse secp256k1 and then rejects the whole JWKS — so go-oidc's remote key
// set fails for every token. This key set parses keys one by one and skips the ones it cannot use.
var telegramSigningAlgs = []jose.SignatureAlgorithm{jose.RS256, jose.ES256, jose.EdDSA}

type lenientKeySet struct {
	url    string
	client *http.Client

	mu      sync.Mutex
	keys    []jose.JSONWebKey
	fetched time.Time
}

func newLenientKeySet(url string) *lenientKeySet {
	return &lenientKeySet{url: url, client: &http.Client{Timeout: 10 * time.Second}}
}

// VerifySignature implements oidc.KeySet: it checks the signature only; the verifier checks claims.
func (k *lenientKeySet) VerifySignature(ctx context.Context, token string) ([]byte, error) {
	signed, err := jose.ParseSigned(token, telegramSigningAlgs)
	if err != nil {
		return nil, fmt.Errorf("parse ID token: %w", err)
	}
	if len(signed.Signatures) != 1 {
		return nil, errors.New("ID token must carry exactly one signature")
	}
	kid := signed.Signatures[0].Header.KeyID
	keys, err := k.current(ctx, kid)
	if err != nil {
		return nil, err
	}
	return k.verifyWith(keys, token)
}

func (k *lenientKeySet) verifyWith(keys []jose.JSONWebKey, token string) ([]byte, error) {
	signed, err := jose.ParseSigned(token, telegramSigningAlgs)
	if err != nil {
		return nil, fmt.Errorf("parse ID token: %w", err)
	}
	if len(signed.Signatures) != 1 {
		return nil, errors.New("ID token must carry exactly one signature")
	}
	kid := signed.Signatures[0].Header.KeyID
	for _, key := range keys {
		if kid != "" && key.KeyID != kid {
			continue
		}
		if payload, err := signed.Verify(key); err == nil {
			return payload, nil
		}
	}
	return nil, fmt.Errorf("no usable Telegram key verifies the ID token (kid=%q)", kid)
}

// current returns the cached keys, refetching when the kid is unknown (key rotation) or the cache
// is older than an hour; refetches are spaced at least a minute apart.
func (k *lenientKeySet) current(ctx context.Context, kid string) ([]jose.JSONWebKey, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	known := false
	for _, key := range k.keys {
		if key.KeyID == kid {
			known = true
			break
		}
	}
	stale := time.Since(k.fetched) > time.Hour
	if (known && !stale) || (len(k.keys) > 0 && time.Since(k.fetched) < time.Minute) {
		return k.keys, nil
	}
	keys, err := k.fetch(ctx)
	if err != nil {
		if len(k.keys) > 0 {
			return k.keys, nil // keep working on the last good set
		}
		return nil, err
	}
	k.keys, k.fetched = keys, time.Now()
	return keys, nil
}

func (k *lenientKeySet) fetch(ctx context.Context) ([]jose.JSONWebKey, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, k.url, nil)
	if err != nil {
		return nil, err
	}
	response, err := k.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch Telegram keys: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch Telegram keys: HTTP %d", response.StatusCode)
	}
	return parseLenientJWKS(io.LimitReader(response.Body, 1<<20))
}

// parseLenientJWKS keeps every public signing key go-jose understands and drops the rest.
func parseLenientJWKS(body io.Reader) ([]jose.JSONWebKey, error) {
	var set struct {
		Keys []json.RawMessage `json:"keys"`
	}
	if err := json.NewDecoder(body).Decode(&set); err != nil {
		return nil, fmt.Errorf("decode Telegram keys: %w", err)
	}
	keys := make([]jose.JSONWebKey, 0, len(set.Keys))
	for _, raw := range set.Keys {
		var key jose.JSONWebKey
		if err := key.UnmarshalJSON(raw); err != nil || !key.Valid() || !key.IsPublic() {
			continue // e.g. secp256k1 (ES256K): not supported by go-jose
		}
		if key.Use != "" && key.Use != "sig" {
			continue
		}
		keys = append(keys, key)
	}
	if len(keys) == 0 {
		return nil, errors.New("Telegram published no usable signing key")
	}
	return keys, nil
}
