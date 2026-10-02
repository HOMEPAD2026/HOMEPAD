//! ARCIRCLE Orders on Solana — limit orders that stay in the owner's wallet until they fill.
//!
//! The same idea as the EVM ArcircleOrders (Arc, Robinhood Chain): nothing is deposited. Placing an order records it
//! on chain and lets this program's `auth` PDA move exactly the order's input out of the owner's token account (an SPL
//! delegate approval, made in the same transaction). Every market is a token against SOL:
//!   buy  — the input is wrapped SOL (the owner's wSOL account), the output is the token
//!   sell — the input is the token (SPL Token or Token-2022), the output is native SOL
//!
//! A fill is one transaction with three parts, in order:
//!   fill_start  the program moves the input from the owner to the filler (a buy's fee first goes to the treasury) and
//!               notes the owner's balance of the output
//!   (anything)  the filler swaps however it likes — Jupiter, PumpSwap, its own inventory — and pays the owner
//!   fill_end    the program checks the owner's output went up by at least the order's min_out (and, on a sell, that
//!               the treasury got its fee), then closes the order (its rent back to the owner)
//! fill_start refuses to run unless that same transaction ends with this order's fill_end, and a transaction may hold
//! only one fill, so the owner always ends with at least min_out or nothing moves at all. The filler isn't trusted:
//! whatever it gets above min_out is its own.
//!
//! Fees are in SOL: on a buy, fee_bps of the input (wSOL) to the treasury's wSOL account; on a sell, fee_bps of min_out
//! (lamports) to the treasury wallet, paid by the filler. The admin (the program's upgrade authority at set-up) sets
//! the filler (or leaves it open), the fee (at most 1%), a cap per order and a pause.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{get_stack_height, TRANSACTION_LEVEL_STACK_HEIGHT};
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::sysvar::instructions::{load_current_index_checked, load_instruction_at_checked};
use anchor_lang::Discriminator;
use anchor_spl::token::spl_token::native_mint;
use anchor_spl::token_2022::spl_token_2022::{extension::StateWithExtensions, state::Account as SplAccount};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("ArcOrd1111111111111111111111111111111111111");

pub const MAX_FEE_BPS: u16 = 100;
pub const BUY: u8 = 0;
pub const SELL: u8 = 1;
pub const OPEN: u8 = 0;
pub const FILLING: u8 = 1;
/// fill_end's accounts: [filler, config, order, owner, owner_dest, treasury, instructions]
const FILL_END_ORDER_INDEX: usize = 2;

#[program]
pub mod arcircle_orders {
    use super::*;

    /// One time, by the program's upgrade authority (so nobody can claim the config first after a deploy).
    pub fn init_config(ctx: Context<InitConfig>, keeper: Pubkey, fee_bps: u16, max_in: u64) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, OrdersError::FeeTooHigh);
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.keeper = keeper;
        c.treasury = ctx.accounts.treasury_wsol.owner;
        c.treasury_wsol = ctx.accounts.treasury_wsol.key();
        c.fee_bps = fee_bps;
        c.max_in = max_in;
        c.paused = false;
        c.bump = ctx.bumps.config;
        c.auth_bump = Pubkey::find_program_address(&[b"auth"], &crate::ID).1;
        Ok(())
    }

    /// The admin: filler (Pubkey::default() = anyone may fill), fee, cap per order, pause, a new admin.
    pub fn set_config(ctx: Context<SetConfig>, keeper: Pubkey, fee_bps: u16, max_in: u64, paused: bool, new_admin: Pubkey) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, OrdersError::FeeTooHigh);
        require!(new_admin != Pubkey::default(), OrdersError::BadAccount);
        let c = &mut ctx.accounts.config;
        c.keeper = keeper;
        c.fee_bps = fee_bps;
        c.max_in = max_in;
        c.paused = paused;
        c.admin = new_admin;
        Ok(())
    }

    /// The treasury (a wallet) and its wSOL account move together.
    pub fn set_treasury(ctx: Context<SetTreasury>) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.treasury = ctx.accounts.treasury_wsol.owner;
        c.treasury_wsol = ctx.accounts.treasury_wsol.key();
        Ok(())
    }

    /// Record an order. The transaction also approves `auth` as the delegate of `source` (the client adds that
    /// instruction before this one); this checks the approval covers the order.
    pub fn place(ctx: Context<Place>, nonce: u64, side: u8, amount_in: u64, min_out: u64, expiry: i64) -> Result<()> {
        let c = &ctx.accounts.config;
        require!(!c.paused, OrdersError::Paused);
        require!(side == BUY || side == SELL, OrdersError::BadSide);
        require!(amount_in > 0 && min_out > 0, OrdersError::ZeroAmount);
        let mint = ctx.accounts.mint.key();
        require!(mint != native_mint::ID, OrdersError::BadMint);
        // the cap is in lamports: a buy's input, a sell's least output
        let sol_side = if side == BUY { amount_in } else { min_out };
        require!(c.max_in == 0 || sol_side <= c.max_in, OrdersError::OverCap);
        let now = Clock::get()?.unix_timestamp;
        require!(expiry == 0 || expiry > now, OrdersError::Expired);
        let src = &ctx.accounts.source;
        let want_mint = if side == BUY { native_mint::ID } else { mint };
        require_keys_eq!(src.mint, want_mint, OrdersError::BadAccount);
        require!(src.delegate == COption::Some(ctx.accounts.auth.key()) && src.delegated_amount >= amount_in, OrdersError::NotApproved);
        require!(src.amount >= amount_in, OrdersError::NotEnough);
        let o = &mut ctx.accounts.order;
        o.owner = ctx.accounts.owner.key();
        o.nonce = nonce;
        o.side = side;
        o.mint = mint;
        o.amount_in = amount_in;
        o.min_out = min_out;
        o.expiry = expiry;
        o.created = now;
        o.state = OPEN;
        o.pre_dest = 0;
        o.pre_treasury = 0;
        o.bump = ctx.bumps.order;
        emit!(OrderPlaced { order: o.key(), owner: o.owner, mint, side, amount_in, min_out, expiry });
        Ok(())
    }

    /// The owner closes an open order (its rent comes back). The client lowers the delegate approval in the same
    /// transaction.
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        require!(ctx.accounts.order.state == OPEN, OrdersError::BadState);
        emit!(OrderClosed { order: ctx.accounts.order.key(), owner: ctx.accounts.owner.key(), filled: false });
        Ok(())
    }

    /// Anyone may close an order past its expiry; the rent goes back to its owner.
    pub fn close_expired(ctx: Context<CloseExpired>) -> Result<()> {
        let o = &ctx.accounts.order;
        require!(o.state == OPEN, OrdersError::BadState);
        require!(o.expiry != 0 && Clock::get()?.unix_timestamp >= o.expiry, OrdersError::NotExpired);
        emit!(OrderClosed { order: o.key(), owner: o.owner, filled: false });
        Ok(())
    }

    pub fn fill_start(ctx: Context<FillStart>) -> Result<()> {
        let c = &ctx.accounts.config;
        require!(!c.paused, OrdersError::Paused);
        require!(c.keeper == Pubkey::default() || c.keeper == ctx.accounts.filler.key(), OrdersError::NotKeeper);
        require!(get_stack_height() == TRANSACTION_LEVEL_STACK_HEIGHT, OrdersError::NoCpi);
        let order_key = ctx.accounts.order.key();
        let o = &ctx.accounts.order;
        require!(o.state == OPEN, OrdersError::BadState);
        require!(o.expiry == 0 || Clock::get()?.unix_timestamp < o.expiry, OrdersError::Expired);
        check_one_fill(&ctx.accounts.instructions, &order_key)?;

        // the accounts this order needs
        let buy = o.side == BUY;
        let in_mint = if buy { native_mint::ID } else { o.mint };
        require_keys_eq!(ctx.accounts.in_mint.key(), in_mint, OrdersError::BadAccount);
        require_keys_eq!(ctx.accounts.out_mint.key(), if buy { o.mint } else { native_mint::ID }, OrdersError::BadAccount);
        let src = &ctx.accounts.source;
        require_keys_eq!(src.owner, o.owner, OrdersError::BadAccount);
        require_keys_eq!(src.mint, in_mint, OrdersError::BadAccount);
        require_keys_eq!(ctx.accounts.filler_in.mint, in_mint, OrdersError::BadAccount);
        require_keys_eq!(ctx.accounts.treasury.key(), c.treasury, OrdersError::BadAccount);
        require_keys_eq!(ctx.accounts.treasury_wsol.key(), c.treasury_wsol, OrdersError::BadAccount);

        // where the output lands, and how much is there now
        let pre_dest = if buy {
            dest_token_amount(&ctx.accounts.owner_dest, &o.owner, &o.mint, ctx.accounts.out_mint.to_account_info().owner)?
        } else {
            require_keys_eq!(ctx.accounts.owner_dest.key(), o.owner, OrdersError::BadAccount);
            ctx.accounts.owner_dest.lamports()
        };
        let pre_treasury = ctx.accounts.treasury.lamports();

        // move the input: a buy's fee to the treasury's wSOL first, the rest to the filler
        let seeds: &[&[u8]] = &[b"auth", &[c.auth_bump]];
        let signer = &[seeds];
        let dec = ctx.accounts.in_mint.decimals;
        let mut to_filler = o.amount_in;
        if buy {
            let fee = mul_bps(o.amount_in, c.fee_bps)?;
            if fee > 0 {
                token_interface::transfer_checked(
                    CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), TransferChecked {
                        from: ctx.accounts.source.to_account_info(), mint: ctx.accounts.in_mint.to_account_info(),
                        to: ctx.accounts.treasury_wsol.to_account_info(), authority: ctx.accounts.auth.to_account_info(),
                    }, signer), fee, dec)?;
                to_filler = to_filler.checked_sub(fee).ok_or(OrdersError::Math)?;
            }
        }
        token_interface::transfer_checked(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), TransferChecked {
                from: ctx.accounts.source.to_account_info(), mint: ctx.accounts.in_mint.to_account_info(),
                to: ctx.accounts.filler_in.to_account_info(), authority: ctx.accounts.auth.to_account_info(),
            }, signer), to_filler, dec)?;

        let o = &mut ctx.accounts.order;
        o.state = FILLING;
        o.pre_dest = pre_dest;
        o.pre_treasury = pre_treasury;
        Ok(())
    }

    pub fn fill_end(ctx: Context<FillEnd>) -> Result<()> {
        require!(get_stack_height() == TRANSACTION_LEVEL_STACK_HEIGHT, OrdersError::NoCpi);
        let c = &ctx.accounts.config;
        let o = &ctx.accounts.order;
        // FILLING only exists inside the transaction that ran fill_start (it reverts otherwise)
        require!(o.state == FILLING, OrdersError::BadState);
        require_keys_eq!(ctx.accounts.treasury.key(), c.treasury, OrdersError::BadAccount);
        let got = if o.side == BUY {
            let info = ctx.accounts.owner_dest.to_account_info();
            let now = dest_token_amount(&info, &o.owner, &o.mint, info.owner)?;
            now.checked_sub(o.pre_dest).ok_or(OrdersError::ShortFill)?
        } else {
            require_keys_eq!(ctx.accounts.owner_dest.key(), o.owner, OrdersError::BadAccount);
            ctx.accounts.owner_dest.lamports().checked_sub(o.pre_dest).ok_or(OrdersError::ShortFill)?
        };
        require!(got >= o.min_out, OrdersError::ShortFill);
        if o.side == SELL {
            let fee = mul_bps(o.min_out, c.fee_bps)?;
            let paid = ctx.accounts.treasury.lamports().checked_sub(o.pre_treasury).ok_or(OrdersError::FeeNotPaid)?;
            require!(paid >= fee, OrdersError::FeeNotPaid);
        }
        emit!(OrderFilled { order: o.key(), owner: o.owner, mint: o.mint, side: o.side, amount_in: o.amount_in, out: got, filler: ctx.accounts.filler.key() });
        emit!(OrderClosed { order: o.key(), owner: o.owner, filled: true });
        Ok(())
    }
}

/// fee_bps of an amount, rounded down
fn mul_bps(v: u64, bps: u16) -> Result<u64> {
    Ok(((v as u128) * (bps as u128) / 10_000u128) as u64)
}

/// The owner's token account for `mint` (SPL Token or Token-2022): checked, and its balance
fn dest_token_amount(info: &AccountInfo, owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Result<u64> {
    require!(info.owner == token_program && (*info.owner == anchor_spl::token::ID || *info.owner == anchor_spl::token_2022::ID), OrdersError::BadAccount);
    let data = info.try_borrow_data()?;
    let acc = StateWithExtensions::<SplAccount>::unpack(&data).map_err(|_| error!(OrdersError::BadAccount))?;
    require_keys_eq!(acc.base.owner, *owner, OrdersError::BadAccount);
    require_keys_eq!(acc.base.mint, *mint, OrdersError::BadAccount);
    Ok(acc.base.amount)
}

/// This transaction holds exactly one fill_start (this one) and exactly one fill_end, later, for the same order.
fn check_one_fill(ix_sysvar: &AccountInfo, order: &Pubkey) -> Result<()> {
    let cur = load_current_index_checked(ix_sysvar)? as usize;
    let (mut starts, mut ends, mut ok) = (0u32, 0u32, false);
    let mut i = 0usize;
    while let Ok(ix) = load_instruction_at_checked(i, ix_sysvar) {
        if ix.program_id == crate::ID && ix.data.len() >= 8 {
            if ix.data[..8] == *crate::instruction::FillStart::DISCRIMINATOR { starts += 1; }
            if ix.data[..8] == *crate::instruction::FillEnd::DISCRIMINATOR {
                ends += 1;
                if i > cur && ix.accounts.get(FILL_END_ORDER_INDEX).map(|m| m.pubkey == *order).unwrap_or(false) { ok = true; }
            }
        }
        i += 1;
    }
    require!(starts == 1 && ends == 1 && ok, OrdersError::NoFillEnd);
    Ok(())
}

// ---------------------------------------------------------------- accounts

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub treasury: Pubkey,
    pub treasury_wsol: Pubkey,
    pub fee_bps: u16,
    pub max_in: u64,
    pub paused: bool,
    pub bump: u8,
    pub auth_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Order {
    pub owner: Pubkey,
    pub nonce: u64,
    pub side: u8,
    pub mint: Pubkey,
    pub amount_in: u64,
    pub min_out: u64,
    pub expiry: i64,
    pub created: i64,
    pub state: u8,
    pub pre_dest: u64,
    pub pre_treasury: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(token::mint = native_mint::ID)]
    pub treasury_wsol: InterfaceAccount<'info, TokenAccount>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ OrdersError::BadAccount)]
    pub program: Program<'info, crate::program::ArcircleOrders>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ OrdersError::NotAdmin)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ OrdersError::NotAdmin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct SetTreasury<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ OrdersError::NotAdmin)]
    pub config: Account<'info, Config>,
    #[account(token::mint = native_mint::ID)]
    pub treasury_wsol: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct Place<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(init, payer = owner, space = 8 + Order::INIT_SPACE, seeds = [b"order", owner.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub order: Account<'info, Order>,
    /// the token traded against SOL
    pub mint: InterfaceAccount<'info, Mint>,
    /// the owner's account the input comes from (wSOL on a buy, the token on a sell), approved to `auth`
    #[account(token::authority = owner)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: the program's delegate PDA (no data)
    #[account(seeds = [b"auth"], bump)]
    pub auth: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, close = owner, has_one = owner @ OrdersError::NotOwner, seeds = [b"order", owner.key().as_ref(), &order.nonce.to_le_bytes()], bump = order.bump)]
    pub order: Account<'info, Order>,
}

#[derive(Accounts)]
pub struct CloseExpired<'info> {
    pub caller: Signer<'info>,
    /// CHECK: receives the rent; must be the order's owner
    #[account(mut, address = order.owner @ OrdersError::NotOwner)]
    pub owner: UncheckedAccount<'info>,
    #[account(mut, close = owner, seeds = [b"order", order.owner.as_ref(), &order.nonce.to_le_bytes()], bump = order.bump)]
    pub order: Account<'info, Order>,
}

#[derive(Accounts)]
pub struct FillStart<'info> {
    #[account(mut)]
    pub filler: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"order", order.owner.as_ref(), &order.nonce.to_le_bytes()], bump = order.bump)]
    pub order: Account<'info, Order>,
    /// CHECK: the delegate PDA, signs the transfers
    #[account(seeds = [b"auth"], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    pub in_mint: InterfaceAccount<'info, Mint>,
    pub out_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub filler_in: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_wsol: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: the treasury wallet (checked against the config)
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: a buy: the owner's token account for the mint; a sell: the owner (checked in the handler)
    pub owner_dest: UncheckedAccount<'info>,
    /// the program of the input mint
    pub token_program: Interface<'info, TokenInterface>,
    /// CHECK: the instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct FillEnd<'info> {
    pub filler: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = owner, seeds = [b"order", order.owner.as_ref(), &order.nonce.to_le_bytes()], bump = order.bump)]
    pub order: Account<'info, Order>,
    /// CHECK: the order's owner; gets the order's rent back
    #[account(mut, address = order.owner @ OrdersError::NotOwner)]
    pub owner: UncheckedAccount<'info>,
    /// CHECK: the same account fill_start measured (checked in the handler)
    pub owner_dest: UncheckedAccount<'info>,
    /// CHECK: the treasury wallet (checked against the config)
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: the instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

// ---------------------------------------------------------------- events, errors

#[event]
pub struct OrderPlaced { pub order: Pubkey, pub owner: Pubkey, pub mint: Pubkey, pub side: u8, pub amount_in: u64, pub min_out: u64, pub expiry: i64 }
#[event]
pub struct OrderFilled { pub order: Pubkey, pub owner: Pubkey, pub mint: Pubkey, pub side: u8, pub amount_in: u64, pub out: u64, pub filler: Pubkey }
#[event]
pub struct OrderClosed { pub order: Pubkey, pub owner: Pubkey, pub filled: bool }

#[error_code]
pub enum OrdersError {
    #[msg("The fee can be at most 1%")] FeeTooHigh,
    #[msg("Orders are paused")] Paused,
    #[msg("Side must be buy (0) or sell (1)")] BadSide,
    #[msg("Amounts must be above zero")] ZeroAmount,
    #[msg("Pick a token, not SOL itself")] BadMint,
    #[msg("Above the per-order cap")] OverCap,
    #[msg("The order has expired")] Expired,
    #[msg("The order hasn't expired")] NotExpired,
    #[msg("An account doesn't belong to this order")] BadAccount,
    #[msg("Approve the order's amount first")] NotApproved,
    #[msg("Not enough balance for this order")] NotEnough,
    #[msg("Only the admin can do that")] NotAdmin,
    #[msg("Only the order's owner can do that")] NotOwner,
    #[msg("Only the keeper can fill")] NotKeeper,
    #[msg("The order isn't in the right state")] BadState,
    #[msg("A fill needs exactly one fill_start and one later fill_end for this order")] NoFillEnd,
    #[msg("Not callable through another program")] NoCpi,
    #[msg("The owner got less than the order's minimum")] ShortFill,
    #[msg("The treasury fee wasn't paid")] FeeNotPaid,
    #[msg("Math overflow")] Math,
}
