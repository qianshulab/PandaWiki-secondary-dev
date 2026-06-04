package pg

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/store/cache"
	"github.com/chaitin/panda-wiki/store/pg"
)

type APITokenRepo struct {
	db     *pg.DB
	logger *log.Logger
	cache  *cache.Cache
}

func NewAPITokenRepo(db *pg.DB, logger *log.Logger, cache *cache.Cache) *APITokenRepo {
	return &APITokenRepo{
		db:     db,
		logger: logger,
		cache:  cache,
	}
}

func (r *APITokenRepo) Create(ctx context.Context, apiToken *domain.APIToken) error {
	return r.db.WithContext(ctx).Create(apiToken).Error
}

func (r *APITokenRepo) ListByUserAndKB(ctx context.Context, userID string, kbID string) ([]*domain.APIToken, error) {
	var tokens []*domain.APIToken
	if err := r.db.WithContext(ctx).
		Where("user_id = ? AND kb_id = ?", userID, kbID).
		Order("created_at DESC").
		Find(&tokens).Error; err != nil {
		return nil, err
	}
	return tokens, nil
}

func (r *APITokenRepo) GetByIDUserAndKB(ctx context.Context, id string, userID string, kbID string) (*domain.APIToken, error) {
	var apiToken domain.APIToken
	if err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ? AND kb_id = ?", id, userID, kbID).
		First(&apiToken).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &apiToken, nil
}

func (r *APITokenRepo) Update(ctx context.Context, id string, userID string, kbID string, values map[string]interface{}) error {
	if len(values) == 0 {
		return nil
	}

	oldToken, err := r.GetByIDUserAndKB(ctx, id, userID, kbID)
	if err != nil {
		return err
	}
	if oldToken == nil {
		return gorm.ErrRecordNotFound
	}

	if err := r.db.WithContext(ctx).
		Model(&domain.APIToken{}).
		Where("id = ? AND user_id = ? AND kb_id = ?", id, userID, kbID).
		Updates(values).Error; err != nil {
		return err
	}
	r.deleteTokenCache(ctx, oldToken.Token)
	return nil
}

func (r *APITokenRepo) Delete(ctx context.Context, id string, userID string, kbID string) error {
	oldToken, err := r.GetByIDUserAndKB(ctx, id, userID, kbID)
	if err != nil {
		return err
	}
	if oldToken == nil {
		return nil
	}
	if err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ? AND kb_id = ?", id, userID, kbID).
		Delete(&domain.APIToken{}).Error; err != nil {
		return err
	}
	r.deleteTokenCache(ctx, oldToken.Token)
	return nil
}

func (r *APITokenRepo) GetByTokenWithCache(ctx context.Context, token string) (*domain.APIToken, error) {
	cacheKey := fmt.Sprintf("api_token:%s", token)

	cachedData, err := r.cache.Get(ctx, cacheKey).Result()
	if err == nil && cachedData != "" {
		var apiToken domain.APIToken
		if err := json.Unmarshal([]byte(cachedData), &apiToken); err == nil {
			return &apiToken, nil
		}
	}

	// 缓存未命中，从数据库查询
	var apiToken domain.APIToken
	if err := r.db.WithContext(ctx).Where("token = ?", token).First(&apiToken).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("get api token by token failed: %w", err)
	}

	if tokenData, err := json.Marshal(&apiToken); err == nil {
		if err := r.cache.Set(ctx, cacheKey, tokenData, 30*time.Minute).Err(); err != nil {
			r.logger.Warn("failed to cache API token", log.Error(err))
		}
	}

	return &apiToken, nil
}

func (r *APITokenRepo) deleteTokenCache(ctx context.Context, token string) {
	if token == "" {
		return
	}
	if err := r.cache.Del(ctx, fmt.Sprintf("api_token:%s", token)).Err(); err != nil {
		r.logger.Warn("failed to delete API token cache", log.Error(err))
	}
}
