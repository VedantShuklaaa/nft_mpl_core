# Metaplex Core NFT Program (Anchor)

A Solana program built with Anchor 1.0 that mints and manages NFTs through CPI calls to the Metaplex Core (MPL Core) program.

## How it works

A Core NFT is a **single account**, the asset. It stores its own owner, name, URI and update authority, so there is no mint account, token account or supply to manage.

- `mint_nft` generates the asset from a fresh keypair that signs the transaction, and MPL Core creates the account at that address.
- **Owner** and **update authority** are separate roles. The owner can transfer or burn. The update authority controls the name and metadata. Both default to the payer when minting.
- The program never compares signers itself. MPL Core checks the authority inside each CPI and rejects anyone who isn't allowed.
- The program has no state accounts of its own.

## Instructions

| Instruction | Signer | CPI | What it does |
|---|---|---|---|
| `mint_nft(name, uri)` | payer + new asset keypair | `CreateV2` | Creates a Core asset owned by the payer |
| `update_nft(new_name, new_uri)` | update authority | `UpdateV1` | Changes the asset's name and URI |
| `transfer_nft()` | current owner | `TransferV1` | Moves ownership to a new wallet |
| `burn_nft()` | owner | `BurnV1` | Destroys the asset and returns the rent to the owner |

After a transfer, the update authority stays with the original wallet, so it can still update the name and URI.

## Accounts

Every instruction takes the MPL Core program (`CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d`), checked with `address = MPL_CORE_ID`. The existing asset is checked with `owner = MPL_CORE_ID`.

## Dependencies

```toml
mpl-core = "0.12.1"   # default features, without the `anchor` feature
```

The `anchor` feature of `mpl-core` only lists Anchor 0.31 and 0.32. The program only makes CPI calls and never deserializes an asset, so the plain crate works with Anchor 1.0.

## Build and test

Requirements: Rust, Solana CLI, Anchor 1.0.

```bash
anchor build
```

The build prints "Stack offset exceeded" messages from `mpl-core`'s own `deserialize` functions. They are expected here, because the program never calls those functions.

LiteSVM doesn't include MPL Core, so dump it once and load it into the tests:

```bash
solana program dump CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d \
  programs/nft_mpl_core/tests/fixtures/mpl_core.so --url devnet
cargo test
```

## Deploy to devnet

```bash
solana config set --url devnet
anchor keys sync
anchor build
anchor program deploy --provider.cluster devnet
```

- Program ID: `CzZNAK9o7NRtN924pr2NFAxta2frKYfLV2Kec2MYtK53`
- Explorer: `https://explorer.solana.com/address/CzZNAK9o7NRtN924pr2NFAxta2frKYfLV2Kec2MYtK53?cluster=devnet`

## Run the demo script

```bash
yarn add @anchor-lang/core @solana/web3.js@1 --ignore-engines
yarn add -D tsx --ignore-engines

ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=$HOME/.config/solana/id.json \
npx tsx scripts/invoke.ts
```

The script mints an NFT, updates it as the update authority, shows that another wallet can't update it, transfers it, and burns it. Each step prints an Explorer link.

## What I learned

- Core simplifies NFTs to one account, with no mint or token account.
- Owner and update authority are different roles, and MPL Core enforces both inside the CPI.
- Minting is a CPI with real keypair signers, so no PDA signing is needed.
- Burning closes the asset account and returns the rent.

## Links

- Write-up: `https://x.com/SegFault_Dev/status/2118263446500470949`
