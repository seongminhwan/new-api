package model

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"

	"github.com/samber/lo"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Ability struct {
	Group     string  `json:"group" gorm:"type:varchar(64);primaryKey;autoIncrement:false"`
	Model     string  `json:"model" gorm:"type:varchar(255);primaryKey;autoIncrement:false"`
	ChannelId int     `json:"channel_id" gorm:"primaryKey;autoIncrement:false;index"`
	Enabled   bool    `json:"enabled"`
	Priority  *int64  `json:"priority" gorm:"bigint;default:0;index"`
	Weight    uint    `json:"weight" gorm:"default:0;index"`
	Tag       *string `json:"tag" gorm:"index"`
}

type AbilityWithChannel struct {
	Ability
	ChannelType int `json:"channel_type"`
}

func (ability Ability) GetPriority() int64 {
	if ability.Priority == nil {
		return 0
	}
	return *ability.Priority
}

func GetAllEnableAbilityWithChannels() ([]AbilityWithChannel, error) {
	var abilities []AbilityWithChannel
	err := DB.Table("abilities").
		Select("abilities.*, channels.type as channel_type").
		Joins("left join channels on abilities.channel_id = channels.id").
		Where("abilities.enabled = ?", true).
		Scan(&abilities).Error
	return abilities, err
}

func GetGroupEnabledModels(group string) []string {
	var models []string
	// Find distinct models
	DB.Table("abilities").Where(commonGroupCol+" = ? and enabled = ?", group, true).Distinct("model").Pluck("model", &models)
	return models
}

func GetEnabledModels() []string {
	var models []string
	// Find distinct models
	DB.Table("abilities").Where("enabled = ?", true).Distinct("model").Pluck("model", &models)
	return models
}

func GetAllEnableAbilities() []Ability {
	var abilities []Ability
	DB.Find(&abilities, "enabled = ?", true)
	return abilities
}

func getPriority(group string, model string, retry int) (int, error) {

	var priorities []int
	err := DB.Model(&Ability{}).
		Select("DISTINCT(priority)").
		Where(commonGroupCol+" = ? and model = ? and enabled = ?", group, model, true).
		Order("priority DESC").              // 按优先级降序排序
		Pluck("priority", &priorities).Error // Pluck用于将查询的结果直接扫描到一个切片中

	if err != nil {
		// 处理错误
		return 0, err
	}

	if len(priorities) == 0 {
		// 如果没有查询到优先级，则返回错误
		return 0, errors.New("数据库一致性被破坏")
	}

	// 确定要使用的优先级
	var priorityToUse int
	if retry >= len(priorities) {
		// 如果重试次数大于优先级数，则使用最小的优先级
		priorityToUse = priorities[len(priorities)-1]
	} else {
		priorityToUse = priorities[retry]
	}
	return priorityToUse, nil
}

func getChannelQuery(group string, model string, retry int) (*gorm.DB, error) {
	maxPrioritySubQuery := DB.Model(&Ability{}).Select("MAX(priority)").Where(commonGroupCol+" = ? and model = ? and enabled = ?", group, model, true)
	channelQuery := DB.Where(commonGroupCol+" = ? and model = ? and enabled = ? and priority = (?)", group, model, true, maxPrioritySubQuery)
	if retry != 0 {
		priority, err := getPriority(group, model, retry)
		if err != nil {
			return nil, err
		} else {
			channelQuery = DB.Where(commonGroupCol+" = ? and model = ? and enabled = ? and priority = ?", group, model, true, priority)
		}
	}

	return channelQuery, nil
}

func GetChannel(group string, model string, retry int) (*Channel, error) {
	return GetChannelWithFilter(group, model, retry, nil)
}

func GetChannelWithFilter(group string, model string, retry int, filter ChannelFilterFunc) (*Channel, error) {
	if filter != nil {
		return getChannelWithFilter(group, model, retry, filter)
	}

	var abilities []Ability

	var err error = nil
	channelQuery, err := getChannelQuery(group, model, retry)
	if err != nil {
		return nil, err
	}
	if common.UsingSQLite || common.UsingPostgreSQL {
		err = channelQuery.Order("weight DESC").Find(&abilities).Error
	} else {
		err = channelQuery.Order("weight DESC").Find(&abilities).Error
	}
	if err != nil {
		return nil, err
	}

	if len(abilities) == 0 {
		return nil, nil
	}

	// 过滤冷静期渠道
	if IsChannelModelInCooldownFunc != nil {
		active := make([]Ability, 0, len(abilities))
		var lastFilteredId int
		for _, a := range abilities {
			if !IsChannelModelInCooldownFunc(a.ChannelId, model) {
				active = append(active, a)
			} else {
				lastFilteredId = a.ChannelId
			}
		}
		if len(active) == 0 {
			// 所有渠道都在冷静期，查询最后被过滤的渠道完整信息用于日志
			var lastCh *Channel
			if lastFilteredId > 0 {
				if ch, err := GetChannelById(lastFilteredId, false); err == nil {
					lastCh = ch
				} else {
					lastCh = &Channel{Id: lastFilteredId}
				}
			}
			return nil, newAllCooldownError(model, lastCh)
		}
		abilities = active
	}

	// 过滤 RPM 超限渠道
	if IsChannelModelRpmExceededFunc != nil {
		rpmActive := make([]Ability, 0, len(abilities))
		var lastRpmFilteredId int
		for _, a := range abilities {
			if !IsChannelModelRpmExceededFunc(a.ChannelId, model) {
				rpmActive = append(rpmActive, a)
			} else {
				lastRpmFilteredId = a.ChannelId
			}
		}
		if len(rpmActive) == 0 {
			var lastCh *Channel
			if lastRpmFilteredId > 0 {
				if ch, err := GetChannelById(lastRpmFilteredId, false); err == nil {
					lastCh = ch
				} else {
					lastCh = &Channel{Id: lastRpmFilteredId}
				}
			}
			return nil, newAllRpmExceededError(model, lastCh)
		}
		abilities = rpmActive
	}

	channel := Channel{}
	// Randomly choose one by weight
	weightSum := uint(0)
	for _, ability_ := range abilities {
		weightSum += ability_.Weight + 10
	}
	weight := common.GetRandomInt(int(weightSum))
	for _, ability_ := range abilities {
		weight -= int(ability_.Weight) + 10
		if weight <= 0 {
			channel.Id = ability_.ChannelId
			break
		}
	}
	err = DB.First(&channel, "id = ?", channel.Id).Error
	if err != nil {
		return &channel, err
	}
	incrementChannelRpm(channel.Id, model)
	return &channel, nil
}

func getChannelWithFilter(group string, model string, retry int, filter ChannelFilterFunc) (*Channel, error) {
	var abilities []Ability
	err := DB.Where(commonGroupCol+" = ? and model = ? and enabled = ?", group, model, true).
		Order("priority DESC").
		Find(&abilities).Error
	if err != nil {
		return nil, err
	}
	if len(abilities) == 0 {
		return nil, nil
	}

	channelByID := make(map[int]*Channel, len(abilities))
	filteredAbilities := make([]Ability, 0, len(abilities))
	uniquePriorities := make(map[int]bool)
	for _, ability := range abilities {
		channel, ok := channelByID[ability.ChannelId]
		if !ok {
			var loadErr error
			channel, loadErr = GetChannelById(ability.ChannelId, false)
			if loadErr != nil {
				return nil, loadErr
			}
			channelByID[ability.ChannelId] = channel
		}
		if !channelMatchesFilter(channel, filter) {
			continue
		}
		filteredAbilities = append(filteredAbilities, ability)
		uniquePriorities[int(ability.GetPriority())] = true
	}
	if len(filteredAbilities) == 0 {
		return nil, nil
	}

	sortedUniquePriorities := make([]int, 0, len(uniquePriorities))
	for priority := range uniquePriorities {
		sortedUniquePriorities = append(sortedUniquePriorities, priority)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(sortedUniquePriorities)))
	if retry >= len(sortedUniquePriorities) {
		retry = len(sortedUniquePriorities) - 1
	}
	targetPriority := int64(sortedUniquePriorities[retry])

	targetAbilities := make([]Ability, 0, len(filteredAbilities))
	for _, ability := range filteredAbilities {
		if ability.GetPriority() == targetPriority {
			targetAbilities = append(targetAbilities, ability)
		}
	}
	if len(targetAbilities) == 0 {
		return nil, fmt.Errorf("no channel found, group: %s, model: %s, priority: %d", group, model, targetPriority)
	}

	if IsChannelModelInCooldownFunc != nil {
		active := make([]Ability, 0, len(targetAbilities))
		var lastFilteredId int
		for _, ability := range targetAbilities {
			if !IsChannelModelInCooldownFunc(ability.ChannelId, model) {
				active = append(active, ability)
			} else {
				lastFilteredId = ability.ChannelId
			}
		}
		if len(active) == 0 {
			return nil, newAllCooldownError(model, channelByID[lastFilteredId])
		}
		targetAbilities = active
	}

	if IsChannelModelRpmExceededFunc != nil {
		active := make([]Ability, 0, len(targetAbilities))
		var lastFilteredId int
		for _, ability := range targetAbilities {
			if !IsChannelModelRpmExceededFunc(ability.ChannelId, model) {
				active = append(active, ability)
			} else {
				lastFilteredId = ability.ChannelId
			}
		}
		if len(active) == 0 {
			return nil, newAllRpmExceededError(model, channelByID[lastFilteredId])
		}
		targetAbilities = active
	}

	weightSum := uint(0)
	for _, ability := range targetAbilities {
		weightSum += ability.Weight + 10
	}
	weight := common.GetRandomInt(int(weightSum))
	var selectedId int
	for _, ability := range targetAbilities {
		weight -= int(ability.Weight) + 10
		if weight <= 0 {
			selectedId = ability.ChannelId
			break
		}
	}
	if selectedId == 0 {
		return nil, errors.New("channel not found")
	}
	channel, err := GetChannelById(selectedId, true)
	if err != nil {
		return nil, err
	}
	incrementChannelRpm(channel.Id, model)
	return channel, nil
}

func (channel *Channel) AddAbilities(tx *gorm.DB) error {
	models_ := strings.Split(channel.Models, ",")
	groups_ := strings.Split(channel.Group, ",")
	abilitySet := make(map[string]struct{})
	abilities := make([]Ability, 0, len(models_))
	for _, model := range models_ {
		for _, group := range groups_ {
			key := group + "|" + model
			if _, exists := abilitySet[key]; exists {
				continue
			}
			abilitySet[key] = struct{}{}
			ability := Ability{
				Group:     group,
				Model:     model,
				ChannelId: channel.Id,
				Enabled:   channel.Status == common.ChannelStatusEnabled,
				Priority:  channel.Priority,
				Weight:    uint(channel.GetWeight()),
				Tag:       channel.Tag,
			}
			abilities = append(abilities, ability)
		}
	}
	if len(abilities) == 0 {
		return nil
	}
	// choose DB or provided tx
	useDB := DB
	if tx != nil {
		useDB = tx
	}
	for _, chunk := range lo.Chunk(abilities, 50) {
		err := useDB.Clauses(clause.OnConflict{DoNothing: true}).Create(&chunk).Error
		if err != nil {
			return err
		}
	}
	return nil
}

func (channel *Channel) DeleteAbilities() error {
	return DB.Where("channel_id = ?", channel.Id).Delete(&Ability{}).Error
}

// UpdateAbilities updates abilities of this channel.
// Make sure the channel is completed before calling this function.
func (channel *Channel) UpdateAbilities(tx *gorm.DB) error {
	isNewTx := false
	// 如果没有传入事务，创建新的事务
	if tx == nil {
		tx = DB.Begin()
		if tx.Error != nil {
			return tx.Error
		}
		isNewTx = true
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()
	}

	// First delete all abilities of this channel
	err := tx.Where("channel_id = ?", channel.Id).Delete(&Ability{}).Error
	if err != nil {
		if isNewTx {
			tx.Rollback()
		}
		return err
	}

	// Then add new abilities
	models_ := strings.Split(channel.Models, ",")
	groups_ := strings.Split(channel.Group, ",")
	abilitySet := make(map[string]struct{})
	abilities := make([]Ability, 0, len(models_))
	for _, model := range models_ {
		for _, group := range groups_ {
			key := group + "|" + model
			if _, exists := abilitySet[key]; exists {
				continue
			}
			abilitySet[key] = struct{}{}
			ability := Ability{
				Group:     group,
				Model:     model,
				ChannelId: channel.Id,
				Enabled:   channel.Status == common.ChannelStatusEnabled,
				Priority:  channel.Priority,
				Weight:    uint(channel.GetWeight()),
				Tag:       channel.Tag,
			}
			abilities = append(abilities, ability)
		}
	}

	if len(abilities) > 0 {
		for _, chunk := range lo.Chunk(abilities, 50) {
			err = tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&chunk).Error
			if err != nil {
				if isNewTx {
					tx.Rollback()
				}
				return err
			}
		}
	}

	// 如果是新创建的事务，需要提交
	if isNewTx {
		return tx.Commit().Error
	}

	return nil
}

func UpdateAbilityStatus(channelId int, status bool) error {
	return DB.Model(&Ability{}).Where("channel_id = ?", channelId).Select("enabled").Update("enabled", status).Error
}

func UpdateAbilityStatusByTag(tag string, status bool) error {
	return DB.Model(&Ability{}).Where("tag = ?", tag).Select("enabled").Update("enabled", status).Error
}

func UpdateAbilityByTag(tag string, newTag *string, priority *int64, weight *uint) error {
	ability := Ability{}
	if newTag != nil {
		ability.Tag = newTag
	}
	if priority != nil {
		ability.Priority = priority
	}
	if weight != nil {
		ability.Weight = *weight
	}
	return DB.Model(&Ability{}).Where("tag = ?", tag).Updates(ability).Error
}

var fixLock = sync.Mutex{}

func FixAbility() (int, int, error) {
	lock := fixLock.TryLock()
	if !lock {
		return 0, 0, errors.New("已经有一个修复任务在运行中，请稍后再试")
	}
	defer fixLock.Unlock()

	// truncate abilities table
	if common.UsingSQLite {
		err := DB.Exec("DELETE FROM abilities").Error
		if err != nil {
			common.SysLog(fmt.Sprintf("Delete abilities failed: %s", err.Error()))
			return 0, 0, err
		}
	} else {
		err := DB.Exec("TRUNCATE TABLE abilities").Error
		if err != nil {
			common.SysLog(fmt.Sprintf("Truncate abilities failed: %s", err.Error()))
			return 0, 0, err
		}
	}
	var channels []*Channel
	// Find all channels
	err := DB.Model(&Channel{}).Find(&channels).Error
	if err != nil {
		return 0, 0, err
	}
	if len(channels) == 0 {
		return 0, 0, nil
	}
	successCount := 0
	failCount := 0
	for _, chunk := range lo.Chunk(channels, 50) {
		ids := lo.Map(chunk, func(c *Channel, _ int) int { return c.Id })
		// Delete all abilities of this channel
		err = DB.Where("channel_id IN ?", ids).Delete(&Ability{}).Error
		if err != nil {
			common.SysLog(fmt.Sprintf("Delete abilities failed: %s", err.Error()))
			failCount += len(chunk)
			continue
		}
		// Then add new abilities
		for _, channel := range chunk {
			err = channel.AddAbilities(nil)
			if err != nil {
				common.SysLog(fmt.Sprintf("Add abilities for channel %d failed: %s", channel.Id, err.Error()))
				failCount++
			} else {
				successCount++
			}
		}
	}
	InitChannelCache()
	return successCount, failCount, nil
}
