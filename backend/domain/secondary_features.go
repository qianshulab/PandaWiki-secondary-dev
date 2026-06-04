package domain

import (
	"time"

	"github.com/chaitin/panda-wiki/consts"
)

type GetNodeReleaseListReq struct {
	KBID   string `json:"kb_id" query:"kb_id" validate:"required"`
	NodeID string `json:"node_id" query:"node_id" validate:"required"`
}

type GetNodeReleaseDetailReq struct {
	KBID string `json:"kb_id" query:"kb_id" validate:"required"`
	ID   string `json:"id" query:"id" validate:"required"`
}

type NodeReleaseListItem struct {
	ID               string    `json:"id"`
	KBID             string    `json:"kb_id"`
	NodeID           string    `json:"node_id"`
	Name             string    `json:"name"`
	Meta             NodeMeta  `json:"meta"`
	CreatorID        string    `json:"creator_id"`
	CreatorAccount   string    `json:"creator_account"`
	EditorID         string    `json:"editor_id"`
	EditorAccount    string    `json:"editor_account"`
	PublisherID      string    `json:"publisher_id"`
	PublisherAccount string    `json:"publisher_account"`
	ReleaseID        string    `json:"release_id"`
	ReleaseName      string    `json:"release_name"`
	ReleaseMessage   string    `json:"release_message"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type GetNodeReleaseDetailResp struct {
	ID               string    `json:"id"`
	KBID             string    `json:"kb_id"`
	NodeID           string    `json:"node_id"`
	Name             string    `json:"name"`
	Content          string    `json:"content"`
	Meta             NodeMeta  `json:"meta"`
	CreatorID        string    `json:"creator_id"`
	CreatorAccount   string    `json:"creator_account"`
	EditorID         string    `json:"editor_id"`
	EditorAccount    string    `json:"editor_account"`
	PublisherID      string    `json:"publisher_id"`
	PublisherAccount string    `json:"publisher_account"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type SubmitContributeReq struct {
	CaptchaToken string                `json:"captcha_token" validate:"required"`
	Content      string                `json:"content"`
	ContentType  string                `json:"content_type" validate:"required,oneof=html md"`
	Emoji        string                `json:"emoji"`
	Name         string                `json:"name"`
	NodeID       string                `json:"node_id"`
	Reason       string                `json:"reason" validate:"required"`
	Type         consts.ContributeType `json:"type" validate:"required,oneof=add edit"`
}

type SubmitContributeResp struct {
	ID string `json:"id"`
}

type ContributeListReq struct {
	KBID     string `json:"kb_id" query:"kb_id" validate:"required"`
	NodeName string `json:"node_name" query:"node_name"`
	AuthName string `json:"auth_name" query:"auth_name"`
	Status   string `json:"status" query:"status" validate:"omitempty,oneof=pending approved rejected"`
	Type     string `json:"type" query:"type" validate:"omitempty,oneof=add edit"`
	Pager
}

type ContributeDetailReq struct {
	KBID string `json:"kb_id" query:"kb_id" validate:"required"`
	ID   string `json:"id" query:"id" validate:"required"`
}

type ContributeAuditReq struct {
	ID       string                  `json:"id" validate:"required"`
	KBID     string                  `json:"kb_id" validate:"required"`
	NavID    string                  `json:"nav_id"`
	ParentID string                  `json:"parent_id"`
	Position *float64                `json:"position"`
	Status   consts.ContributeStatus `json:"status" validate:"required,oneof=approved rejected"`
}

type ContributeAuditResp struct {
	Message string `json:"message"`
	NodeID  string `json:"node_id,omitempty"`
}

type ContributeItem struct {
	ID             string                  `json:"id"`
	AuthID         *int64                  `json:"auth_id"`
	KBID           string                  `json:"kb_id"`
	Status         consts.ContributeStatus `json:"status"`
	Type           consts.ContributeType   `json:"type"`
	NodeID         string                  `json:"node_id"`
	NodeName       string                  `json:"node_name"`
	ContributeName string                  `json:"contribute_name"`
	AuthName       string                  `json:"auth_name"`
	Avatar         string                  `json:"avatar"`
	Meta           NodeMeta                `json:"meta"`
	Reason         string                  `json:"reason"`
	AuditUserID    string                  `json:"audit_user_id"`
	AuditTime      *time.Time              `json:"audit_time"`
	RemoteIP       string                  `json:"remote_ip"`
	IPAddress      *IPAddress              `json:"ip_address" gorm:"-"`
	CreatedAt      time.Time               `json:"created_at"`
	UpdatedAt      time.Time               `json:"updated_at"`
}

type ContributeListResp struct {
	List  []*ContributeItem `json:"list"`
	Total int64             `json:"total"`
}

type OriginalNodeInfo struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Content string   `json:"content"`
	Meta    NodeMeta `json:"meta"`
}

type ContributeDetailResp struct {
	ID           string                  `json:"id"`
	AuthID       *int64                  `json:"auth_id"`
	AuthName     string                  `json:"auth_name"`
	KBID         string                  `json:"kb_id"`
	Status       consts.ContributeStatus `json:"status"`
	Type         consts.ContributeType   `json:"type"`
	NodeID       string                  `json:"node_id"`
	NodeName     string                  `json:"node_name"`
	Name         string                  `json:"name"`
	Content      string                  `json:"content"`
	Meta         NodeMeta                `json:"meta"`
	Reason       string                  `json:"reason"`
	AuditUserID  string                  `json:"audit_user_id"`
	AuditTime    *time.Time              `json:"audit_time"`
	OriginalNode *OriginalNodeInfo       `json:"original_node,omitempty"`
	CreatedAt    time.Time               `json:"created_at"`
	UpdatedAt    time.Time               `json:"updated_at"`
}
