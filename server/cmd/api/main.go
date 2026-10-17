package main

import (
	"log"
	"net/http"

	"github.com/voxel-vault/api/internal/access"
	"github.com/voxel-vault/api/internal/config"
	"github.com/voxel-vault/api/internal/httpapi"
	"github.com/voxel-vault/api/internal/store"
)

func main() {
	cfg := config.Load()
	db, err := store.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	acl, err := access.New(db)
	if err != nil {
		log.Fatal(err)
	}
	api, err := httpapi.New(db, cfg, acl)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("Voxel Vault API listening on %s", cfg.Address)
	log.Fatal(http.ListenAndServe(cfg.Address, api.Handler()))
}
