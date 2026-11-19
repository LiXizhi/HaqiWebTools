// adventure/membership_controller.js — 会员状态同步、VIP 判定、充值入口与魔豆兑换触发。
import { createMembershipClient } from '../adventure_membership.js';

export function createMembershipController({
    getContext,
    bus,
    toast,
    onTitleDirty,
    onLocalShopsDirty,
    maybeExchangeMagicBeans,
} = {}) {
    const client = createMembershipClient({
        onChange: () => {
            const state = getContext();
            if (state.stage === 'title') {
                onTitleDirty?.();
                return;
            }
            if (!state.assets || !state.save) return;
            if (state.stage === 'world' && !state.save.pendingEncounter) {
                maybeExchangeMagicBeans?.();
            }
            if (state.stage === 'world') {
                bus?.emit('hud:dirty');
                if (['shop', 'npc-services', 'membership', 'recharge', 'checkin'].includes(state.panel)) {
                    bus?.emit('panel:dirty');
                }
                onLocalShopsDirty?.();
            }
        },
    });

    function accountIsVip() {
        const state = getContext();
        return (
            client.state.status === 'ready'
            && client.state.isVip === true
            && (!state.roleStore?.owner || client.state.username === state.roleStore.owner)
        );
    }

    async function rechargeMembership(amount) {
        try {
            await client.openRecharge(amount, getContext().roleStore?.owner);
            toast?.('已刷新会员状态，魔豆按实际新增到期日兑换。');
        } catch (error) {
            toast?.(error.message);
        }
    }

    function refreshMembership(force = false) {
        const state = getContext();
        if (state.panel === 'recharge') void client.refreshRechargePrice({ force });
        return client.refresh({ force }).catch(error => toast?.(error.message));
    }

    return {
        client,
        get state() {
            return client.state;
        },
        accountIsVip,
        rechargeMembership,
        refreshMembership,
        refresh: (...args) => client.refresh(...args),
    };
}
