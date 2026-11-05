pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;

declare_id!("CzZNAK9o7NRtN924pr2NFAxta2frKYfLV2Kec2MYtK53");

#[program]
pub mod nft_mpl_core {
    use super::*;

    pub fn mint_nft(ctx: Context<MintNft>, name: String, uri: String) -> Result<()> {
        instructions::mint_nft::mint_nft(ctx, name, uri)
    }

    pub fn update_nft(ctx: Context<UpdateNft>, name: String, uri: String) -> Result<()> {
        instructions::update_nft::update_nft(ctx, name, uri)
    }

    pub fn transfer_nft(ctx: Context<TransferNft>) -> Result<()> {
        instructions::transfer_nft::transfer_nft(ctx)
    }

    pub fn burn_nft(ctx: Context<BurnNft>) -> Result<()> {
        instructions::burn_nft::burn_nft(ctx)
    }
}
