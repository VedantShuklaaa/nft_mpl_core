use anchor_lang::prelude::*;
use mpl_core::{instructions::TransferV1CpiBuilder, ID as MPL_CORE_ID};

#[derive(Accounts)]
pub struct TransferNft<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: must be owned by MPL Core, which validates the asset data
    #[account(mut, owner = MPL_CORE_ID)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: only the address is used, as the new owner of the asset
    pub new_owner: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: verified by the address constraint
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
}

pub fn transfer_nft(ctx: Context<TransferNft>) -> Result<()> {
    TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.owner.to_account_info())
        .authority(Some(&ctx.accounts.owner.to_account_info()))
        .new_owner(&ctx.accounts.new_owner.to_account_info())
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke()?;

    Ok(())
}
