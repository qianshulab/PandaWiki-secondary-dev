package pg

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/store/pg"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type BlockWordRepo struct {
	db     *pg.DB
	logger *log.Logger
}

func NewBlockWordRepo(db *pg.DB, logger *log.Logger) *BlockWordRepo {
	return &BlockWordRepo{
		db:     db,
		logger: logger,
	}
}

func (r *BlockWordRepo) GetBlockWords(ctx context.Context, kbID string) ([]string, error) {
	var setting domain.Setting
	var words domain.BlockWords
	err := r.db.WithContext(ctx).Table("settings").
		Where("kb_id = ? AND key = ?", kbID, domain.SettingBlockWords).
		First(&setting).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(setting.Value, &words); err != nil {
		return nil, err
	}
	return words.Words, nil
}

func (r *BlockWordRepo) UpsertBlockWords(ctx context.Context, kbID string, words []string) error {
	value, err := json.Marshal(domain.BlockWords{Words: words})
	if err != nil {
		return err
	}

	setting := domain.Setting{
		KBID:        kbID,
		Key:         domain.SettingBlockWords,
		Value:       value,
		Description: "question block words",
		UpdatedAt:   time.Now(),
	}

	return r.db.WithContext(ctx).Table("settings").Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "kb_id"}, {Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"value",
			"description",
			"updated_at",
		}),
	}).Create(&setting).Error
}
