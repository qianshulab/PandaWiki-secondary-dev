package usecase

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/chaitin/panda-wiki/consts"
	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/repo/pg"
)

type APITokenUsecase struct {
	logger *log.Logger
	repo   *pg.APITokenRepo
}

func NewAPITokenUsecase(logger *log.Logger, repo *pg.APITokenRepo) *APITokenUsecase {
	return &APITokenUsecase{
		logger: logger.WithModule("usecase.api_token"),
		repo:   repo,
	}
}

func (u *APITokenUsecase) Create(ctx context.Context, req *domain.CreateAPITokenReq) error {
	if !isValidAPITokenPermission(req.Permission) {
		return errors.New("invalid api token permission")
	}
	authInfo := domain.GetAuthInfoFromCtx(ctx)
	if authInfo == nil || authInfo.IsToken {
		return domain.ErrPermissionDenied
	}

	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	token, err := generateAPIToken()
	if err != nil {
		return err
	}

	now := time.Now()
	return u.repo.Create(ctx, &domain.APIToken{
		ID:         id.String(),
		Name:       req.Name,
		UserID:     authInfo.UserId,
		Token:      token,
		KbId:       req.KBID,
		Permission: req.Permission,
		CreatedAt:  now,
		UpdatedAt:  now,
	})
}

func (u *APITokenUsecase) List(ctx context.Context, req *domain.ListAPITokenReq) ([]*domain.APIToken, error) {
	authInfo := domain.GetAuthInfoFromCtx(ctx)
	if authInfo == nil || authInfo.IsToken {
		return nil, domain.ErrPermissionDenied
	}
	return u.repo.ListByUserAndKB(ctx, authInfo.UserId, req.KBID)
}

func (u *APITokenUsecase) Update(ctx context.Context, req *domain.UpdateAPITokenReq) error {
	authInfo := domain.GetAuthInfoFromCtx(ctx)
	if authInfo == nil || authInfo.IsToken {
		return domain.ErrPermissionDenied
	}
	values := map[string]interface{}{}
	if req.Name != nil {
		values["name"] = *req.Name
	}
	if req.Permission != nil {
		if !isValidAPITokenPermission(*req.Permission) {
			return errors.New("invalid api token permission")
		}
		values["permission"] = *req.Permission
	}
	if len(values) > 0 {
		values["updated_at"] = time.Now()
	}
	return u.repo.Update(ctx, req.ID, authInfo.UserId, req.KBID, values)
}

func (u *APITokenUsecase) Delete(ctx context.Context, req *domain.DeleteAPITokenReq) error {
	authInfo := domain.GetAuthInfoFromCtx(ctx)
	if authInfo == nil || authInfo.IsToken {
		return domain.ErrPermissionDenied
	}
	return u.repo.Delete(ctx, req.ID, authInfo.UserId, req.KBID)
}

func isValidAPITokenPermission(permission consts.UserKBPermission) bool {
	switch permission {
	case consts.UserKBPermissionFullControl, consts.UserKBPermissionDocManage, consts.UserKBPermissionDataOperate:
		return true
	default:
		return false
	}
}

func generateAPIToken() (string, error) {
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return "pw_" + base64.RawURLEncoding.EncodeToString(data), nil
}
