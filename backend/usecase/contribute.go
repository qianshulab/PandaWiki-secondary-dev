package usecase

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/chaitin/panda-wiki/consts"
	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/repo/ipdb"
	"github.com/chaitin/panda-wiki/repo/pg"
)

type ContributeUsecase struct {
	logger      *log.Logger
	repo        *pg.ContributeRepository
	nodeRepo    *pg.NodeRepository
	appRepo     *pg.AppRepository
	ipRepo      *ipdb.IPAddressRepo
	nodeUsecase *NodeUsecase
}

func NewContributeUsecase(
	logger *log.Logger,
	repo *pg.ContributeRepository,
	nodeRepo *pg.NodeRepository,
	appRepo *pg.AppRepository,
	ipRepo *ipdb.IPAddressRepo,
	nodeUsecase *NodeUsecase,
) *ContributeUsecase {
	return &ContributeUsecase{
		logger:      logger.WithModule("usecase.contribute"),
		repo:        repo,
		nodeRepo:    nodeRepo,
		appRepo:     appRepo,
		ipRepo:      ipRepo,
		nodeUsecase: nodeUsecase,
	}
}

func (u *ContributeUsecase) Submit(ctx context.Context, kbID string, req *domain.SubmitContributeReq, authID uint, remoteIP string) (*domain.SubmitContributeResp, error) {
	if !domain.GetBaseEditionLimitation(ctx).AllowContribution {
		return nil, domain.ErrPermissionDenied
	}

	app, err := u.appRepo.GetOrCreateAppByKBIDAndType(ctx, kbID, domain.AppTypeWeb)
	if err != nil {
		return nil, err
	}
	if !app.Settings.ContributeSettings.IsEnable {
		return nil, fmt.Errorf("contribution is not enabled")
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Reason = strings.TrimSpace(req.Reason)
	if req.ContentType == "" {
		req.ContentType = domain.ContentTypeHTML
	}

	var authIDPtr *int64
	if authID > 0 {
		v := int64(authID)
		authIDPtr = &v
	}

	meta := domain.NodeMeta{Emoji: req.Emoji, ContentType: req.ContentType}

	switch req.Type {
	case consts.ContributeTypeAdd:
		if req.Name == "" {
			return nil, fmt.Errorf("name is required for add contribution")
		}
	case consts.ContributeTypeEdit:
		if req.NodeID == "" {
			return nil, fmt.Errorf("node_id is required for edit contribution")
		}
		node, err := u.nodeRepo.GetByID(ctx, req.NodeID, kbID)
		if err != nil {
			return nil, err
		}
		if req.Name == "" {
			req.Name = node.Name
		}
		if meta.Emoji == "" {
			meta.Emoji = node.Meta.Emoji
		}
		if meta.ContentType == "" {
			meta.ContentType = node.Meta.ContentType
		}
	default:
		return nil, fmt.Errorf("unsupported contribution type: %s", req.Type)
	}

	id := uuid.NewString()
	if err := u.repo.Create(ctx, &domain.Contribute{
		Id:        id,
		AuthId:    authIDPtr,
		KBId:      kbID,
		Status:    consts.ContributeStatusPending,
		Type:      req.Type,
		NodeId:    req.NodeID,
		Name:      req.Name,
		Content:   req.Content,
		Meta:      meta,
		Reason:    req.Reason,
		RemoteIP:  remoteIP,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}); err != nil {
		return nil, err
	}

	return &domain.SubmitContributeResp{ID: id}, nil
}

func (u *ContributeUsecase) List(ctx context.Context, req *domain.ContributeListReq) (*domain.ContributeListResp, error) {
	if !domain.GetBaseEditionLimitation(ctx).AllowContribution {
		return nil, domain.ErrPermissionDenied
	}

	total, list, err := u.repo.List(ctx, req)
	if err != nil {
		return nil, err
	}

	ips := make([]string, 0, len(list))
	seen := map[string]struct{}{}
	for _, item := range list {
		if item.RemoteIP == "" {
			item.RemoteIP = "-"
			item.IPAddress = &domain.IPAddress{IP: "-", Country: "未知地址", Province: "未知地址", City: "未知地址"}
			continue
		}
		if _, ok := seen[item.RemoteIP]; !ok {
			seen[item.RemoteIP] = struct{}{}
			ips = append(ips, item.RemoteIP)
		}
	}
	ipMap, err := u.ipRepo.GetIPAddresses(ctx, ips)
	if err != nil {
		return nil, err
	}
	for _, item := range list {
		if info, ok := ipMap[item.RemoteIP]; ok {
			item.IPAddress = info
		}
		if item.IPAddress == nil {
			item.IPAddress = &domain.IPAddress{IP: item.RemoteIP, Country: "未知地址", Province: "未知地址", City: "未知地址"}
		}
	}

	return &domain.ContributeListResp{List: list, Total: total}, nil
}

func (u *ContributeUsecase) Detail(ctx context.Context, req *domain.ContributeDetailReq) (*domain.ContributeDetailResp, error) {
	if !domain.GetBaseEditionLimitation(ctx).AllowContribution {
		return nil, domain.ErrPermissionDenied
	}

	detail, err := u.repo.Detail(ctx, req.KBID, req.ID)
	if err != nil {
		return nil, err
	}

	if detail.Type == consts.ContributeTypeEdit && detail.NodeID != "" {
		node, err := u.nodeRepo.GetByID(ctx, detail.NodeID, req.KBID)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		if node != nil {
			detail.OriginalNode = &domain.OriginalNodeInfo{
				ID:      node.ID,
				Name:    node.Name,
				Content: node.Content,
				Meta:    node.Meta,
			}
		}
	}

	return detail, nil
}

func (u *ContributeUsecase) Audit(ctx context.Context, req *domain.ContributeAuditReq, userID string) (*domain.ContributeAuditResp, error) {
	if !domain.GetBaseEditionLimitation(ctx).AllowContribution {
		return nil, domain.ErrPermissionDenied
	}

	contribute, err := u.repo.GetByID(ctx, req.KBID, req.ID)
	if err != nil {
		return nil, err
	}
	if contribute.Status != consts.ContributeStatusPending {
		return nil, fmt.Errorf("contribution already audited")
	}

	now := time.Now()
	if req.Status == consts.ContributeStatusRejected {
		if err := u.repo.MarkAudited(ctx, req.KBID, req.ID, req.Status, userID, now); err != nil {
			return nil, err
		}
		return &domain.ContributeAuditResp{Message: "rejected"}, nil
	}

	var nodeID string
	switch contribute.Type {
	case consts.ContributeTypeAdd:
		if strings.TrimSpace(req.NavID) == "" {
			return nil, fmt.Errorf("nav_id is required for add contribution audit")
		}
		contentType := contribute.Meta.ContentType
		if contentType == "" {
			contentType = domain.ContentTypeHTML
		}
		createReq := &domain.CreateNodeReq{
			KBID:        req.KBID,
			NavId:       req.NavID,
			ParentID:    req.ParentID,
			Type:        domain.NodeTypeDocument,
			Name:        contribute.Name,
			Content:     contribute.Content,
			Emoji:       contribute.Meta.Emoji,
			ContentType: &contentType,
			MaxNode:     domain.GetBaseEditionLimitation(ctx).MaxNode,
			Position:    req.Position,
		}
		nodeID, err = u.nodeUsecase.Create(ctx, createReq, userID)
		if err != nil {
			return nil, err
		}
	case consts.ContributeTypeEdit:
		if contribute.NodeId == "" {
			return nil, fmt.Errorf("node_id is required")
		}
		nodeID = contribute.NodeId
		content := contribute.Content
		name := contribute.Name
		emoji := contribute.Meta.Emoji
		contentType := contribute.Meta.ContentType
		updateReq := &domain.UpdateNodeReq{
			ID:          nodeID,
			KBID:        req.KBID,
			Name:        &name,
			Content:     &content,
			Emoji:       &emoji,
			ContentType: &contentType,
		}
		if req.NavID != "" {
			updateReq.NavId = &req.NavID
		}
		if req.Position != nil {
			updateReq.Position = req.Position
		}
		if err := u.nodeUsecase.Update(ctx, updateReq, userID); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported contribution type: %s", contribute.Type)
	}

	if err := u.repo.MarkAudited(ctx, req.KBID, req.ID, consts.ContributeStatusApproved, userID, now); err != nil {
		return nil, err
	}

	return &domain.ContributeAuditResp{Message: "approved", NodeID: nodeID}, nil
}
