package httpapi

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"strings"
	"testing"

	"github.com/go-jose/go-jose/v4"
)

// Telegram's real JWKS shape: an RSA key next to a secp256k1 key go-jose cannot parse.
func TestLenientJWKSKeepsUsableKeysNextToSecp256k1(t *testing.T) {
	private, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	rsaJWK, err := json.Marshal(jose.JSONWebKey{Key: &private.PublicKey, KeyID: "oidc-1", Algorithm: "RS256", Use: "sig"})
	if err != nil {
		t.Fatal(err)
	}
	secp := `{"kty":"EC","crv":"secp256k1","kid":"oidc-es256k-1","alg":"ES256K","use":"sig",` +
		`"x":"Ypy0nWNvodgD3OrkkwBc3xm6OvO42rpiWDcHUbNWKTM","y":"lHEeLDGBbLSiQ6Wbg8z98SsYz3lgEqVVfcu1zA7cIw0"}`
	keys, err := parseLenientJWKS(strings.NewReader(`{"keys":[` + string(rsaJWK) + `,` + secp + `]}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 1 || keys[0].KeyID != "oidc-1" {
		t.Fatalf("want only the RSA key, got %d keys", len(keys))
	}

	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: private}, (&jose.SignerOptions{}).WithHeader("kid", "oidc-1"))
	if err != nil {
		t.Fatal(err)
	}
	signed, err := signer.Sign([]byte(`{"sub":"42"}`))
	if err != nil {
		t.Fatal(err)
	}
	token, _ := signed.CompactSerialize()
	set := &lenientKeySet{keys: keys}
	set.fetched = set.fetched.Add(1) // non-zero: no fetch in this test
	payload, err := set.verifyWith(keys, token)
	if err != nil || string(payload) != `{"sub":"42"}` {
		t.Fatalf("verify: %v %q", err, payload)
	}
}

func TestLenientJWKSRejectsASetWithoutUsableKeys(t *testing.T) {
	if _, err := parseLenientJWKS(strings.NewReader(`{"keys":[{"kty":"EC","crv":"secp256k1","x":"AA","y":"AA"}]}`)); err == nil {
		t.Fatal("a set with only unsupported keys must fail")
	}
}
