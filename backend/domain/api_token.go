package domain

import (
	"context"
	"time"

	"github.com/chaitin/panda-wiki/consts"
)

type APIToken struct {
	ID         string                  `json:"id" gorm:"primaryKey"`
	Name       string                  `json:"name" gorm:"not null"`
	UserID     string                  `json:"user_id" gorm:"not null"`
	Token      string                  `json:"token" gorm:"uniqueIndex;not null"`
	KbId       string                  `json:"kb_id" gorm:"not null"`
	Permission consts.UserKBPermission `json:"permission" gorm:"not null"`
	CreatedAt  time.Time               `json:"created_at"`
	UpdatedAt  time.Time               `json:"updated_at"`
}

func (APIToken) TableName() string {
	return "api_tokens"
}

type CreateAPITokenReq struct {
	KBID       string                  `json:"kb_id" validate:"required"`
	Name       string                  `json:"name" validate:"required"`
	Permission consts.UserKBPermission `json:"permission" validate:"required"`
}

type UpdateAPITokenReq struct {
	ID         string                   `json:"id" validate:"required"`
	KBID       string                   `json:"kb_id" validate:"required"`
	Name       *string                  `json:"name"`
	Permission *consts.UserKBPermission `json:"permission"`
}

type ListAPITokenReq struct {
	KBID string `json:"kb_id" query:"kb_id" validate:"required"`
}

type DeleteAPITokenReq struct {
	ID   string `json:"id" query:"id" validate:"required"`
	KBID string `json:"kb_id" query:"kb_id" validate:"required"`
}

type CtxAuthInfo struct {
	IsToken    bool
	Permission consts.UserKBPermission
	UserId     string
	KBId       string
}

type contextKey string

const (
	CtxAuthInfoKey contextKey = "ctx_auth_info"
)

func GetAuthInfoFromCtx(c context.Context) *CtxAuthInfo {
	v := c.Value(CtxAuthInfoKey)
	if v == nil {
		return nil
	}
	ctxAuthInfo, ok := v.(*CtxAuthInfo)
	if !ok {
		return nil
	}
	return ctxAuthInfo
}
