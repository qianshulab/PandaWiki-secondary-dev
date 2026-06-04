package domain

type Prompt struct {
	Content                  string `json:"content"`
	SummaryContent           string `json:"summary_content"`
	EnablePreset             bool   `json:"enable_preset"`
	EnablePresetAutoLanguage bool   `json:"enable_preset_auto_language"` // 允许AI自动匹配用户提问的语言进行回复
	EnablePresetGeneralInfo  bool   `json:"enable_preset_general_info"`  // 允许AI结合通用知识进行补充回答
	EnablePresetReference    bool   `json:"enable_preset_reference"`     // 在回答中显示引用来源
}

type GetPromptReq struct {
	KBID string `json:"kb_id" query:"kb_id" validate:"required"`
}

type UpdatePromptReq struct {
	KBID                     string `json:"kb_id" validate:"required"`
	Content                  string `json:"content"`
	SummaryContent           string `json:"summary_content"`
	EnablePreset             bool   `json:"enable_preset"`
	EnablePresetAutoLanguage bool   `json:"enable_preset_auto_language"`
	EnablePresetGeneralInfo  bool   `json:"enable_preset_general_info"`
	EnablePresetReference    bool   `json:"enable_preset_reference"`
}
