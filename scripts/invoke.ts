// Exercise the deployed nft_mpl_core program on devnet:
// mint -> update -> rejected update -> transfer -> update again -> burn.
//
// Run from the repo root (Anchor's AnchorProvider.env() reads these two vars):
//
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=$HOME/.config/solana/id.json \
//   yarn ts-node scripts/invoke.ts
//
// Packages (already in package.json, installed with --ignore-engines):
//   @anchor-lang/core, @solana/web3.js@^1.99.0,
//   @metaplex-foundation/mpl-core, @metaplex-foundation/umi,
//   @metaplex-foundation/umi-bundle-defaults
//
// Each run mints a brand-new asset, so it can be run repeatedly.

import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import {
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction,
} from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fetchAsset, mplCore } from "@metaplex-foundation/mpl-core";
import fs from "fs";
import path from "path";

// ---------------------------- edit me ---------------------------------------
const NAME = "Turbin3 NFT";
const URI = "https://example.com/nft.json"; // <-- set your metadata URI

// Used by the two update_nft steps (MPL Core caps name at 32 bytes, uri at 200).
const UPDATED_NAME = "Turbin3 NFT (updated)";
const UPDATED_URI = "https://example.com/nft-updated.json"; // <-- set if you have one
const POST_TRANSFER_NAME = "Turbin3 NFT (post-transfer)";
// ----------------------------------------------------------------------------

const MPL_CORE_PROGRAM_ID = new PublicKey(
    "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
);

// SOL sent to the throwaway wallets before they need to sign.
const FUND_SOL = 0.05;

const explorer = (sig: string) =>
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

async function main() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const idl = JSON.parse(
        fs.readFileSync(path.resolve("target/idl/nft_mpl_core.json"), "utf8")
    );
    const program = new Program(idl, provider);
    const connection = provider.connection;
    const wallet = provider.wallet.publicKey;

    console.log("Program:", program.programId.toBase58());
    console.log("Wallet :", wallet.toBase58());

    // Read-only umi client, only used to print asset state between steps.
    // Reuse the provider's connection (commitment "processed"); a connection
    // created from just the URL would read at the RPC default ("finalized")
    // and show stale data right after each transaction.
    const umi = createUmi(connection).use(mplCore());

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const showAsset = async (asset: PublicKey, label: string) => {
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const a = await fetchAsset(umi, asset.toBase58());
                const authority =
                    a.updateAuthority.type === "None"
                        ? "none"
                        : `${a.updateAuthority.type}(${a.updateAuthority.address})`;
                console.log(
                    `    ${label} owner=${a.owner} authority=${authority} name="${a.name}" uri=${a.uri}`
                );
                return;
            } catch (e: any) {
                if (attempt === 4) {
                    console.log(
                        `    ${label} (asset not readable: ${firstLine(e)})`
                    );
                    return;
                }
                await wait(300);
            }
        }
    };

    // After burn the asset account must disappear; poll briefly for that.
    const showClosed = async (asset: PublicKey, label: string) => {
        for (let attempt = 0; attempt < 10; attempt++) {
            try {
                await fetchAsset(umi, asset.toBase58());
            } catch {
                console.log(`    ${label} asset account closed, rent returned`);
                return;
            }
            await wait(300);
        }
        console.log(`    ${label} asset still readable (unexpected)`);
    };

    const fund = async (to: PublicKey, label: string) => {
        const tx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: wallet,
                toPubkey: to,
                lamports: FUND_SOL * LAMPORTS_PER_SOL,
            })
        );
        const sig = await provider.sendAndConfirm(tx);
        console.log(`\n[fund] ${FUND_SOL} SOL -> ${label} ${to.toBase58()}`);
        console.log(explorer(sig));
        return sig;
    };

    // The two on-chain programs shared by every instruction.
    const coreAccounts = {
        systemProgram: SystemProgram.programId,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
    };

    // ---------- 1. mint_nft (asset is a fresh signer) ----------
    const asset = Keypair.generate();
    console.log("\n[1. mint_nft] asset:", asset.publicKey.toBase58());
    try {
        const sig = await program.methods
            .mintNft(NAME, URI)
            .accountsPartial({
                payer: wallet,
                asset: asset.publicKey,
                ...coreAccounts,
            })
            .signers([asset])
            .rpc();
        console.log(explorer(sig));
    } catch (e: any) {
        console.log("    mint failed:", firstLine(e));
        // Everything below depends on the asset, so stop here.
        return;
    }
    await showAsset(asset.publicKey, "[1] after mint:");

    // ---------- 2. update_nft as the minting wallet ----------
    console.log("\n[2. update_nft] signed by the original wallet");
    try {
        const sig = await program.methods
            .updateNft(UPDATED_NAME, UPDATED_URI)
            .accountsPartial({
                authority: wallet,
                asset: asset.publicKey,
                ...coreAccounts,
            })
            .rpc();
        console.log(explorer(sig));
    } catch (e: any) {
        console.log("    update failed:", firstLine(e));
    }
    await showAsset(asset.publicKey, "[2] after update:");

    // ---------- 3. update_nft from a second wallet (must fail) ----------
    console.log("\n[3. update_nft] signed by a second, funded wallet");
    const second = Keypair.generate();
    console.log("    second wallet:", second.publicKey.toBase58());
    await fund(second.publicKey, "second wallet");
    try {
        await program.methods
            .updateNft(NAME, URI)
            .accountsPartial({
                authority: second.publicKey,
                asset: asset.publicKey,
                ...coreAccounts,
            })
            .signers([second])
            .rpc();
        console.log("    UNEXPECTED: non-authority update succeeded");
    } catch (e: any) {
        // MPL Core rejects the CPI because `second` is not the update authority.
        console.log("    rejected as expected");
        console.log("    reason:", failureDetail(e));
    }
    await showAsset(asset.publicKey, "[3] unchanged:");

    // ---------- 4. transfer_nft to a new keypair ----------
    console.log("\n[4. transfer_nft] to a fresh keypair");
    const newOwner = Keypair.generate();
    console.log("    new owner:", newOwner.publicKey.toBase58());
    await fund(newOwner.publicKey, "new owner");
    try {
        const sig = await program.methods
            .transferNft()
            .accountsPartial({
                owner: wallet,
                asset: asset.publicKey,
                newOwner: newOwner.publicKey,
                ...coreAccounts,
            })
            .rpc();
        console.log(explorer(sig));
    } catch (e: any) {
        console.log("    transfer failed:", firstLine(e));
    }
    await showAsset(asset.publicKey, "[4] after transfer:");

    // ---------- 5. update_nft from the original wallet again ----------
    // The owner changed but the update authority did not, so this still works.
    console.log("\n[5. update_nft] original wallet, after the transfer");
    try {
        const sig = await program.methods
            .updateNft(POST_TRANSFER_NAME, UPDATED_URI)
            .accountsPartial({
                authority: wallet,
                asset: asset.publicKey,
                ...coreAccounts,
            })
            .rpc();
        console.log(explorer(sig));
    } catch (e: any) {
        console.log("    update failed:", firstLine(e));
    }
    await showAsset(asset.publicKey, "[5] after update:");

    // ---------- 6. burn_nft signed by the new owner ----------
    console.log("\n[6. burn_nft] signed by the new owner");
    const before = await connection.getBalance(newOwner.publicKey);
    console.log(
        "    owner balance before:",
        before / LAMPORTS_PER_SOL,
        "SOL"
    );
    try {
        const sig = await program.methods
            .burnNft()
            .accountsPartial({
                owner: newOwner.publicKey,
                asset: asset.publicKey,
                ...coreAccounts,
            })
            .signers([newOwner])
            .rpc();
        console.log(explorer(sig));
    } catch (e: any) {
        console.log("    burn failed:", firstLine(e));
    }
    const after = await connection.getBalance(newOwner.publicKey);
    console.log("    owner balance after :", after / LAMPORTS_PER_SOL, "SOL");
    console.log(
        "    rent returned       :",
        (after - before) / LAMPORTS_PER_SOL,
        "SOL"
    );
    await showClosed(asset.publicKey, "[6] after burn:");
}

const firstLine = (e: any): string => {
    const msg =
        typeof e?.message === "string" ? e.message : String(e);
    return msg.split("\n")[0];
};

// Pull the most relevant line out of a failed transaction's simulation logs.
const failureDetail = (e: any): string => {
    const logs: string[] = e?.transactionLogs ?? e?.logs ?? [];
    const errors = logs.filter((l) => /error/i.test(l));
    const line = errors.length ? errors[errors.length - 1] : logs[logs.length - 1];
    return (line ?? firstLine(e)).trim();
};

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
