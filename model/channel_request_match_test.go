package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestGetRandomSatisfiedChannelWithFilterUsesMatchedPriority(t *testing.T) {
	oldMemoryCacheEnabled := common.MemoryCacheEnabled
	oldGroup2Model2Channels := group2model2channels
	oldChannelsIDM := channelsIDM
	oldCooldownFunc := IsChannelModelInCooldownFunc
	oldRpmFunc := IsChannelModelRpmExceededFunc
	defer func() {
		common.MemoryCacheEnabled = oldMemoryCacheEnabled
		group2model2channels = oldGroup2Model2Channels
		channelsIDM = oldChannelsIDM
		IsChannelModelInCooldownFunc = oldCooldownFunc
		IsChannelModelRpmExceededFunc = oldRpmFunc
	}()

	common.MemoryCacheEnabled = true
	IsChannelModelInCooldownFunc = nil
	IsChannelModelRpmExceededFunc = nil

	highPriority := int64(20)
	lowPriority := int64(10)
	zeroWeight := uint(0)
	channelsIDM = map[int]*Channel{
		1: {Id: 1, Name: "high", Priority: &highPriority, Weight: &zeroWeight},
		2: {Id: 2, Name: "low", Priority: &lowPriority, Weight: &zeroWeight},
	}
	group2model2channels = map[string]map[string][]int{
		"default": {
			"gpt-test": {1, 2},
		},
	}

	channel, err := GetRandomSatisfiedChannelWithFilter("default", "gpt-test", 0, func(channel *Channel) bool {
		return channel.Id == 2
	})

	require.NoError(t, err)
	require.NotNil(t, channel)
	require.Equal(t, 2, channel.Id)
}

func TestGetRandomSatisfiedChannelWithFilterReturnsNilWhenAllFiltered(t *testing.T) {
	oldMemoryCacheEnabled := common.MemoryCacheEnabled
	oldGroup2Model2Channels := group2model2channels
	oldChannelsIDM := channelsIDM
	oldCooldownFunc := IsChannelModelInCooldownFunc
	oldRpmFunc := IsChannelModelRpmExceededFunc
	defer func() {
		common.MemoryCacheEnabled = oldMemoryCacheEnabled
		group2model2channels = oldGroup2Model2Channels
		channelsIDM = oldChannelsIDM
		IsChannelModelInCooldownFunc = oldCooldownFunc
		IsChannelModelRpmExceededFunc = oldRpmFunc
	}()

	common.MemoryCacheEnabled = true
	IsChannelModelInCooldownFunc = nil
	IsChannelModelRpmExceededFunc = nil

	priority := int64(20)
	channelsIDM = map[int]*Channel{
		1: {Id: 1, Name: "high", Priority: &priority},
	}
	group2model2channels = map[string]map[string][]int{
		"default": {
			"gpt-test": {1},
		},
	}

	channel, err := GetRandomSatisfiedChannelWithFilter("default", "gpt-test", 0, func(channel *Channel) bool {
		return false
	})

	require.NoError(t, err)
	require.Nil(t, channel)
}
