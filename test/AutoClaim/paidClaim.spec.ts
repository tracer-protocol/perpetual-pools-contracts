import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
    AutoClaim,
    PoolKeeper,
    L2Encoder,
} from "../../types"

import {
    POOL_CODE,
    DEFAULT_FEE,
    LONG_MINT,
    LONG_BURN,
    SHORT_MINT,
} from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    createCommit,
    timeout,
} from "../utilities"
import { BigNumber, BigNumberish } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 1
const reward = ethers.utils.parseEther("103")

describe("AutoClaim - paidClaim", () => {
    let poolCommitter: PoolCommitter
    let token: TestToken
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary
    let autoClaim: AutoClaim
    let signers: SignerWithAddress[]
    let poolKeeper: PoolKeeper
    let l2Encoder: L2Encoder

    beforeEach(async () => {
        const result = await deployPoolAndTokenContracts(
            POOL_CODE,
            frontRunningInterval,
            updateInterval,
            leverage,
            feeAddress,
            fee
        )
        l2Encoder = result.l2Encoder
        pool = result.pool
        library = result.library
        poolCommitter = result.poolCommitter
        autoClaim = result.autoClaim
        signers = result.signers
        poolKeeper = result.poolKeeper

        token = result.token
        shortToken = result.shortToken
        longToken = result.longToken

        await token.approve(pool.address, amountMinted)
    })

    context("When there is no claim", async () => {
        it("does nothing", async () => {
            const receipt = await (
                await autoClaim.paidClaim(
                    signers[0].address,
                    poolCommitter.address
                )
            ).wait()
            expect(receipt?.events?.length).to.equal(0)
        })
    })

    context("When there is a claim but it is still pending", async () => {
        it("does nothing", async () => {
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted,
                false,
                true,
                reward
            )
            const receipt = await (
                await autoClaim.paidClaim(
                    signers[0].address,
                    poolCommitter.address
                )
            ).wait()
            expect(receipt?.events?.length).to.equal(0)
        })
    })

    context("When there is a valid request to claim", async () => {
        let balanceBeforeClaim: BigNumberish
        beforeEach(async () => {
            await token.transfer(signers[1].address, amountCommitted.mul(2))
            await token.connect(signers[1]).approve(pool.address, amountMinted)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted,
                false,
                true,
                reward,
                signers[1]
            )
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            balanceBeforeClaim = await ethers.provider.getBalance(
                signers[0].address
            )
            await autoClaim.paidClaim(signers[1].address, poolCommitter.address)
        })
        it("Sends money", async () => {
            const balanceAfterClaim = await ethers.provider.getBalance(
                signers[0].address
            )
            expect(balanceBeforeClaim).to.be.lt(balanceAfterClaim)
        })
        it("Deletes request", async () => {
            const request = await autoClaim.claimRequests(
                signers[1].address,
                poolCommitter.address
            )
            expect(request.updateIntervalId).to.equal(0)
            expect(request.reward).to.equal(0)
        })
        it("Claims", async () => {
            const longTokenBalance = await longToken.balanceOf(
                signers[1].address
            )
            expect(longTokenBalance).to.equal(amountCommitted)
        })
    })
})
