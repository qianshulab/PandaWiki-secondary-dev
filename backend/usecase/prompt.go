package usecase

import (
	"context"

	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/repo/pg"
)

type PromptUsecase struct {
	logger *log.Logger
	repo   *pg.PromptRepo
}

func NewPromptUsecase(logger *log.Logger, repo *pg.PromptRepo) *PromptUsecase {
	return &PromptUsecase{
		logger: logger.WithModule("usecase.prompt"),
		repo:   repo,
	}
}

func (u *PromptUsecase) GetPrompt(ctx context.Context, kbID string) (*domain.Prompt, error) {
	return u.repo.GetPrompt(ctx, kbID)
}

func (u *PromptUsecase) UpdatePrompt(ctx context.Context, req *domain.UpdatePromptReq) (*domain.Prompt, error) {
	prompt := &domain.Prompt{
		Content:                  req.Content,
		SummaryContent:           req.SummaryContent,
		EnablePreset:             req.EnablePreset,
		EnablePresetAutoLanguage: req.EnablePresetAutoLanguage,
		EnablePresetGeneralInfo:  req.EnablePresetGeneralInfo,
		EnablePresetReference:    req.EnablePresetReference,
	}
	if err := u.repo.UpsertPrompt(ctx, req.KBID, prompt); err != nil {
		return nil, err
	}
	return u.repo.GetPrompt(ctx, req.KBID)
}
