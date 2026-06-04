package usecase

import (
	"context"

	"github.com/chaitin/panda-wiki/domain"
	"github.com/chaitin/panda-wiki/log"
	"github.com/chaitin/panda-wiki/repo/pg"
)

type BlockWordUsecase struct {
	logger *log.Logger
	repo   *pg.BlockWordRepo
}

func NewBlockWordUsecase(logger *log.Logger, repo *pg.BlockWordRepo) *BlockWordUsecase {
	return &BlockWordUsecase{
		logger: logger.WithModule("usecase.block_word"),
		repo:   repo,
	}
}

func (u *BlockWordUsecase) GetBlockWords(ctx context.Context, kbID string) (*domain.BlockWords, error) {
	words, err := u.repo.GetBlockWords(ctx, kbID)
	if err != nil {
		return nil, err
	}
	return &domain.BlockWords{Words: words}, nil
}

func (u *BlockWordUsecase) UpsertBlockWords(ctx context.Context, req *domain.CreateBlockWordsReq) error {
	return u.repo.UpsertBlockWords(ctx, req.KBID, req.BlockWords)
}
