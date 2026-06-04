package domain

import "github.com/chaitin/panda-wiki/consts"

type LicenseResp struct {
	Edition   consts.LicenseEdition `json:"edition"`
	StartedAt int64                 `json:"started_at"`
	ExpiredAt int64                 `json:"expired_at"`
	State     int                   `json:"state"`
}
