use anchor_lang::prelude::*;
use mpl_core::{instructions::UpdateV1CpiBuilder, ID as MPL_CORE_ID};

#[derive(Accounts)]
pub struct UpdateNft<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: must be owned by MPL Core, which validates the asset data
    #[account(mut, owner = MPL_CORE_ID)]
    pub asset: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: verified by the address constraint
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
}

pub fn update_nft(ctx: Context<UpdateNft>, name: String, uri: String) -> Result<()> {
    UpdateV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .payer(&ctx.accounts.authority.to_account_info())
        .authority(Some(&ctx.accounts.authority.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .new_name(name)
        .new_uri(uri)
        .invoke()?;

    Ok(())
}
