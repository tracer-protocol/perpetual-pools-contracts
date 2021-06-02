import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { LeveragedPool, TestToken, ERC20 } from "../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { POOL_CODE } from "../../constants";
import {
  deployPoolAndTokenContracts,
  getRandomInt,
  generateRandomAddress,
  createCommit,
  CommitEventArgs,
  timeout,
} from "../../utilities";

chai.use(chaiAsPromised);
const { expect } = chai;

const amountCommitted = ethers.utils.parseEther("2000");
const amountMinted = ethers.utils.parseEther("10000");
const feeAddress = generateRandomAddress();
const lastPrice = getRandomInt(99999999, 1);
const updateInterval = 120; // 2 minutes
const frontRunningInterval = 1; // seconds
const fee = getRandomInt(256, 1);
const leverage = 2;
const imbalance = ethers.BigNumber.from("5").mul(
  ethers.BigNumber.from("2").pow(64)
);

describe("LeveragedPool - executeCommitment: Long Burn", () => {
  let token: TestToken;

  let longToken: ERC20;
  let pool: LeveragedPool;
  let signers: SignerWithAddress[];
  let commit: CommitEventArgs;

  describe("Long Burn", () => {
    beforeEach(async () => {
      const result = await deployPoolAndTokenContracts(
        POOL_CODE,
        lastPrice,
        updateInterval,
        frontRunningInterval,
        fee,
        leverage,
        feeAddress,
        amountMinted
      );
      pool = result.pool;
      signers = result.signers;
      token = result.token;

      longToken = result.longToken;

      await token.approve(pool.address, amountMinted);
      commit = await createCommit(pool, [2], imbalance, amountCommitted);
      await timeout(2000);
      await pool.executePriceChange(9);
      await pool.executeCommitment([commit.commitID]);

      await longToken.approve(pool.address, amountCommitted);
      commit = await createCommit(pool, [3], imbalance, amountCommitted);
    });
    it("should adjust the live long pool balance", async () => {
      expect(await pool.longBalance()).to.eq(amountCommitted);
      await timeout(2000);
      await pool.executePriceChange(9);
      await pool.executeCommitment([commit.commitID]);
      expect(await pool.longBalance()).to.eq(amountCommitted);
    });
    it("should reduce the shadow long burn pool balance", async () => {
      expect(await pool.shadowPools(commit.commitType)).to.eq(amountCommitted);
      await timeout(2000);
      await pool.executePriceChange(9);
      await pool.executeCommitment([commit.commitID]);
      expect(await pool.shadowPools(commit.commitType)).to.eq(0);
    });
    it("should burn long pair tokens", async () => {
      expect(await longToken.balanceOf(pool.address)).to.eq(amountCommitted);
      await timeout(2000);
      await pool.executePriceChange(9);
      await pool.executeCommitment([commit.commitID]);
      expect(await longToken.balanceOf(pool.address)).to.eq(0);
    });
    it("should transfer quote tokens to the commit owner", async () => {
      expect(await token.balanceOf(signers[0].address)).to.eq(0);
      await timeout(2000);
      await pool.executePriceChange(9);
      await pool.executeCommitment([commit.commitID]);
      expect(await token.balanceOf(signers[0].address)).to.eq(amountCommitted);
    });
  });
});