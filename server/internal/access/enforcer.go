package access

import (
	"embed"
	"encoding/csv"
	"fmt"
	"io"
	"strings"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
	gormadapter "github.com/casbin/gorm-adapter/v3"
	"gorm.io/gorm"
)

//go:embed model.conf policy.csv
var files embed.FS

func New(db *gorm.DB) (*casbin.Enforcer, error) {
	modelText, err := files.ReadFile("model.conf")
	if err != nil {
		return nil, fmt.Errorf("read RBAC model: %w", err)
	}
	m, err := model.NewModelFromString(string(modelText))
	if err != nil {
		return nil, fmt.Errorf("parse RBAC model: %w", err)
	}
	adapter, err := gormadapter.NewAdapterByDB(db)
	if err != nil {
		return nil, fmt.Errorf("initialize Casbin PostgreSQL adapter: %w", err)
	}
	enforcer, err := casbin.NewEnforcer(m, adapter)
	if err != nil {
		return nil, fmt.Errorf("initialize Casbin enforcer: %w", err)
	}
	if err := enforcer.LoadPolicy(); err != nil {
		return nil, fmt.Errorf("load RBAC policy: %w", err)
	}
	if err := seedPolicy(enforcer); err != nil {
		return nil, err
	}
	return enforcer, nil
}

func seedPolicy(enforcer *casbin.Enforcer) error {
	data, err := files.ReadFile("policy.csv")
	if err != nil {
		return fmt.Errorf("read default RBAC policy: %w", err)
	}
	reader := csv.NewReader(strings.NewReader(string(data)))
	for {
		row, err := reader.Read()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("parse default RBAC policy: %w", err)
		}
		for i := range row {
			row[i] = strings.TrimSpace(row[i])
		}
		if len(row) == 0 {
			continue
		}
		if len(row) != 4 {
			return fmt.Errorf("invalid default RBAC row: %v", row)
		}
		var added bool
		switch row[0] {
		case "p":
			added, err = enforcer.AddPolicy(row[1], row[2], row[3])
		case "g":
			added, err = enforcer.AddGroupingPolicy(row[1], row[2], row[3])
		default:
			return fmt.Errorf("invalid default RBAC policy type %q", row[0])
		}
		if err != nil {
			return fmt.Errorf("seed Casbin policy: %w", err)
		}
		_ = added
	}
}
