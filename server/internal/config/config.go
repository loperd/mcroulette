package config

import (
	"os"
	"strings"
)

type Config struct {
	Address          string
	DatabaseURL      string
	FrontendURL      string
	RPID             string
	RPDisplayName    string
	RPOrigins        []string
	CookieSecure     bool
	DefaultRole      string
	TelegramClientID string
	TelegramSecret   string
	TelegramRedirect string
	// Chests every new player gets once, as "case:count,case:count".
	StarterChests string
}

func Load() Config {
	return Config{
		Address:          env("HTTP_ADDRESS", ":8080"),
		DatabaseURL:      env("DATABASE_URL", "postgres://voxel:voxel@localhost:5432/voxel_vault?sslmode=disable"),
		FrontendURL:      env("FRONTEND_URL", "http://localhost:5173/"),
		RPID:             env("WEBAUTHN_RP_ID", "localhost"),
		RPDisplayName:    env("WEBAUTHN_RP_NAME", "Voxel Vault"),
		RPOrigins:        split(env("WEBAUTHN_ORIGINS", "http://localhost:5173,http://localhost:4173")),
		CookieSecure:     strings.EqualFold(env("COOKIE_SECURE", "false"), "true"),
		DefaultRole:      env("DEFAULT_ROLE", "player"),
		TelegramClientID: os.Getenv("TELEGRAM_CLIENT_ID"),
		TelegramSecret:   os.Getenv("TELEGRAM_CLIENT_SECRET"),
		TelegramRedirect: os.Getenv("TELEGRAM_REDIRECT_URL"),
		StarterChests:    env("STARTER_CHESTS", "traveler:10,deep-mine:5,ender:5,dragon:3"),
	}
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func split(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if item := strings.TrimSpace(part); item != "" {
			result = append(result, item)
		}
	}
	return result
}
