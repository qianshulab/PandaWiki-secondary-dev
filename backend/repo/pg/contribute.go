package pg

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/chaitin/panda-wiki/consts"
	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/store/pg"
)

type ContributeRepository struct {
	db     *pg.DB
	logger *log.Logger
}

func NewContributeRepository(db *pg.DB, logger *log.Logger) *ContributeRepository {
	return &ContributeRepository{db: db, logger: logger.WithModule("repo.pg.contribute")}
}

func (r *ContributeRepository) Create(ctx context.Context, contribute *domain.Contribute) error {
	if contribute.Id == "" {
		contribute.Id = uuid.NewString()
	}
	now := time.Now()
	if contribute.CreatedAt.IsZero() {
		contribute.CreatedAt = now
	}
	if contribute.UpdatedAt.IsZero() {
		contribute.UpdatedAt = now
	}
	return r.db.WithContext(ctx).Create(contribute).Error
}

func (r *ContributeRepository) GetByID(ctx context.Context, kbID, id string) (*domain.Contribute, error) {
	var contribute domain.Contribute
	if err := r.db.WithContext(ctx).
		Model(&domain.Contribute{}).
		Where("kb_id = ? AND id = ?", kbID, id).
		First(&contribute).Error; err != nil {
		return nil, err
	}
	return &contribute, nil
}

func (r *ContributeRepository) List(ctx context.Context, req *domain.ContributeListReq) (int64, []*domain.ContributeItem, error) {
	query := r.db.WithContext(ctx).
		Model(&domain.Contribute{}).
		Joins("LEFT JOIN nodes ON nodes.id = contributes.node_id AND nodes.kb_id = contributes.kb_id").
		Joins("LEFT JOIN auths ON auths.id = contributes.auth_id").
		Where("contributes.kb_id = ?", req.KBID)

	if req.NodeName != "" {
		pattern := "%" + req.NodeName + "%"
		query = query.Where("COALESCE(NULLIF(nodes.name, ''), contributes.name) ILIKE ?", pattern)
	}
	if req.AuthName != "" {
		pattern := "%" + req.AuthName + "%"
		query = query.Where("COALESCE(auths.user_info->>'username', '') ILIKE ?", pattern)
	}
	if req.Status != "" {
		query = query.Where("contributes.status = ?", req.Status)
	}
	if req.Type != "" {
		query = query.Where("contributes.type = ?", req.Type)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return 0, nil, err
	}

	var list []*domain.ContributeItem
	if err := query.
		Select(`contributes.id AS id,
            contributes.auth_id AS auth_id,
            contributes.kb_id AS kb_id,
            contributes.status AS status,
            contributes.type AS type,
            contributes.node_id AS node_id,
            COALESCE(NULLIF(nodes.name, ''), contributes.name) AS node_name,
            COALESCE(NULLIF(contributes.name, ''), nodes.name) AS contribute_name,
            COALESCE(auths.user_info->>'username', '') AS auth_name,
            COALESCE(auths.user_info->>'avatar_url', '') AS avatar,
            contributes.meta AS meta,
            contributes.reason AS reason,
            contributes.audit_user_id AS audit_user_id,
            contributes.audit_time AS audit_time,
            contributes.remote_ip AS remote_ip,
            contributes.created_at AS created_at,
            contributes.updated_at AS updated_at`).
		Order("contributes.created_at DESC").
		Offset(req.Offset()).
		Limit(req.Limit()).
		Find(&list).Error; err != nil {
		return 0, nil, err
	}

	return total, list, nil
}

func (r *ContributeRepository) Detail(ctx context.Context, kbID, id string) (*domain.ContributeDetailResp, error) {
	var detail domain.ContributeDetailResp
	if err := r.db.WithContext(ctx).
		Model(&domain.Contribute{}).
		Joins("LEFT JOIN nodes ON nodes.id = contributes.node_id AND nodes.kb_id = contributes.kb_id").
		Joins("LEFT JOIN auths ON auths.id = contributes.auth_id").
		Where("contributes.kb_id = ? AND contributes.id = ?", kbID, id).
		Select(`contributes.id AS id,
            contributes.auth_id AS auth_id,
            COALESCE(auths.user_info->>'username', '') AS auth_name,
            contributes.kb_id AS kb_id,
            contributes.status AS status,
            contributes.type AS type,
            contributes.node_id AS node_id,
            COALESCE(NULLIF(nodes.name, ''), contributes.name) AS node_name,
            contributes.name AS name,
            contributes.content AS content,
            contributes.meta AS meta,
            contributes.reason AS reason,
            contributes.audit_user_id AS audit_user_id,
            contributes.audit_time AS audit_time,
            contributes.created_at AS created_at,
            contributes.updated_at AS updated_at`).
		First(&detail).Error; err != nil {
		return nil, err
	}
	return &detail, nil
}

func (r *ContributeRepository) MarkAudited(ctx context.Context, kbID, id string, status consts.ContributeStatus, auditUserID string, auditTime time.Time) error {
	return r.db.WithContext(ctx).
		Model(&domain.Contribute{}).
		Where("kb_id = ? AND id = ?", kbID, id).
		Updates(map[string]any{
			"status":        status,
			"audit_user_id": auditUserID,
			"audit_time":    auditTime,
			"updated_at":    auditTime,
		}).Error
}

func (r *ContributeRepository) WithTx(ctx context.Context, fn func(tx *gorm.DB) error) error {
	return r.db.WithContext(ctx).Transaction(fn)
}
